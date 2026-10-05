const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");

const QueryEngine = req("zsac/lib/core/QueryEngine");
const HierarchyEngine = req("zsac/lib/core/HierarchyEngine");
const Format = req("zsac/lib/core/Format");
const PlanBuffer = req("zsac/lib/planning/PlanBuffer");
const Spreader = req("zsac/lib/planning/Spreader");
const PlanEditor = req("zsac/lib/planning/PlanEditor");

const model = { ModelId: "M", PlanningEnabled: true, PeriodFrom: "2026-01", PeriodTo: "2026-06",
  Dimensions: [{ DimId: "REGION", Slot: 1, Members: [{ Id: "A" }, { Id: "B" }, { Id: "ALL" }], Hierarchies: [{ Id: "H", Parents: { A: "ALL", B: "ALL" } }] }],
  Measures: [{ MeasureId: "X", Aggregation: "SUM" }, { MeasureId: "AVGM", Aggregation: "AVG" }] };
const fact = (r, p, v, m = "X", ver = "BUD") => ({ ModelId: "M", VersionId: ver, Period: p, Measure: m, Dim1: r, Dim2: "", Dim3: "", Dim4: "", Dim5: "", Value: v });
const base = [fact("A", "2026-01", 10), fact("A", "2026-02", 30), fact("B", "2026-01", 60), fact("B", "2026-04", 100)];
const versions = [{ VersionId: "BUD", Locked: false }, { VersionId: "ACT", Locked: true }];

test("Date hierarchy: year > quarter > month, filters on a year select its months, labels", () => {
  const t = HierarchyEngine.buildTime(["2026-01", "2026-02", "2026-04", "2027-01"]);
  assert.deepStrictEqual(t.roots, ["2026", "2027"]);
  assert.deepStrictEqual(t.path("2026-04"), ["2026", "2026-Q2", "2026-04"]);
  const r = QueryEngine.aggregate(model, base, { rows: [], columns: ["PERIOD"], filters: { MEASURE: ["X"] }, hierarchies: { PERIOD: "TIME" } });
  assert.strictEqual(r.cell([], ["2026"]), 200);
  assert.strictEqual(r.cell([], ["2026-Q1"]), 100);
  assert.strictEqual(r.cell([], ["2026-Q2"]), 100);
  assert.strictEqual(r.grand, 200);
  assert.strictEqual(QueryEngine.applyFilters(model, base, { PERIOD: ["2026-Q1"] }).length, 3);
  assert.strictEqual(Format.period("2026-Q1"), "Q1 2026");
  assert.strictEqual(Format.period("2026-03"), "Mar 2026");
});

test("spreading: proportional with rounding to the largest, equal when zero, avg sets every fact", () => {
  const s = Spreader.spread("SUM", [fact("A", "2026-01", 10), fact("A", "2026-02", 30)], 80);
  assert.deepStrictEqual(s.map((f) => f.Value), [20, 60]);
  const odd = Spreader.spread("SUM", [fact("A", "2026-01", 1), fact("A", "2026-02", 1), fact("A", "2026-03", 1)], 100);
  assert.strictEqual(odd.reduce((a, f) => a + f.Value, 0), 100);
  const zero = Spreader.spread("SUM", [fact("A", "2026-01", 0), fact("A", "2026-02", 0)], 50);
  assert.deepStrictEqual(zero.map((f) => f.Value), [25, 25]);
  assert.deepStrictEqual(Spreader.spread("AVG", [fact("A", "2026-01", 1), fact("A", "2026-02", 9)], 5).map((f) => f.Value), [5, 5]);
  assert.deepStrictEqual(Spreader.spread("SUM", [fact("A", "2026-01", 5)], 5), []);       // unchanged: no change
});

test("plan buffer: overlay, undo and redo as whole edits, reverting to the stored value clears the change", () => {
  const b = new PlanBuffer();
  const lookup = (f) => { const x = base.find((y) => y.Dim1 === f.Dim1 && y.Period === f.Period); return x ? x.Value : null; };
  b.apply([fact("A", "2026-01", 99), fact("A", "2026-02", 1)], lookup);
  assert.strictEqual(b.count, 2);
  assert.strictEqual(b.overlay(base).find((f) => f.Dim1 === "A" && f.Period === "2026-01").Value, 99);
  b.apply([fact("A", "2026-01", 10)], lookup);                    // back to the stored 10
  assert.strictEqual(b.count, 1);
  assert.ok(b.undo());
  assert.strictEqual(b.count, 2);
  assert.ok(b.undo());
  assert.strictEqual(b.dirty, false);
  assert.ok(b.redo() && b.count === 2);
  b.apply([fact("C", "2026-01", 5)], lookup);                     // a new fact
  assert.strictEqual(b.overlay(base).length, base.length + 1);
  assert.deepStrictEqual(b.models(), ["M"]);
  let fired = 0;
  b.attachChange(() => fired++);
  b.clear();
  assert.ok(fired === 1 && !b.dirty && !b.canUndo);
});

test("editing a cell: leaf writes the fact, a parent node spreads, locked and unscoped cells refuse", () => {
  const spec = { rows: ["REGION"], columns: ["PERIOD"], filters: { VERSION: ["BUD"], MEASURE: ["X"] }, hierarchies: { REGION: "H", PERIOD: "TIME" } };
  const ctx = { model, spec, versions, editable: true };
  const r = QueryEngine.aggregate(model, base, { rows: spec.rows, columns: spec.columns, filters: spec.filters, hierarchies: spec.hierarchies });
  // leaf cell A / Jan: 10 -> 15
  let e = PlanEditor.edit(ctx, r, ["A"], ["2026-01"], 15);
  assert.deepStrictEqual(e.changes.map((f) => [f.Dim1, f.Period, f.Value]), [["A", "2026-01", 15]]);
  // node cell ALL / Q1 holds 100 (10 + 30 + 60): 200 doubles every fact below
  e = PlanEditor.edit(ctx, r, ["ALL"], ["2026-Q1"], 200);
  assert.deepStrictEqual(e.changes.map((f) => f.Value).sort((a, b) => a - b), [20, 60, 120]);
  // empty leaf cell (B / Feb has no fact): created
  e = PlanEditor.edit(ctx, r, ["B"], ["2026-02"], 7);
  assert.deepStrictEqual(e.changes.map((f) => [f.Dim1, f.Period, f.Value]), [["B", "2026-02", 7]]);
  // empty cell at a node cannot be created
  assert.ok(PlanEditor.edit(ctx, r, ["ALL"], ["2026-Q3"], 7).error);
  // locked version and read only
  assert.match(PlanEditor.cellState(Object.assign({}, ctx, { spec: Object.assign({}, spec, { filters: { VERSION: ["ACT"], MEASURE: ["X"] } }) }), r, ["A"], ["2026-01"]).reason, /locked/);
  assert.ok(!PlanEditor.cellState(Object.assign({}, ctx, { editable: false }), r, ["A"], ["2026-01"]).editable);
  assert.ok(!PlanEditor.cellState(Object.assign({}, ctx, { model: Object.assign({}, model, { PlanningEnabled: false }) }), r, ["A"], ["2026-01"]).editable);
  assert.ok(PlanEditor.edit(ctx, r, ["A"], ["2026-01"], "abc").error);
});

test("new rows: zero facts for the periods that do not exist yet", () => {
  const rows = PlanEditor.newRows(model, "BUD", "X", { REGION: "A" }, ["2026-01", "2026-02", "2026-03"], base);
  assert.deepStrictEqual(rows.map((f) => f.Period), ["2026-03"]);
});
