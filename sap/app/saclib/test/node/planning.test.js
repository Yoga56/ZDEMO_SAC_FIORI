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

const Distributor = req("zsac/lib/planning/Distributor");

test("distribute values: equal with the remainder, proportional, reference, only empty cells", () => {
  const cells = (vals, w) => vals.map((v, i) => ({ value: v, weight: w ? w[i] : undefined }));
  let s = Distributor.distribute(cells([0, 0, 0]), 100, { method: "EQUAL", decimals: 0 });
  assert.deepStrictEqual(s, [34, 33, 33]);
  assert.strictEqual(s.reduce((a, b) => a + b, 0), 100);
  assert.deepStrictEqual(Distributor.distribute(cells([10, 30]), 80, { method: "PROPORTIONAL", decimals: 2 }), [20, 60]);
  assert.deepStrictEqual(Distributor.distribute(cells([0, 0]), 10, { method: "PROPORTIONAL", decimals: 2 }), [5, 5]);          // nothing to be proportional to
  s = Distributor.distribute(cells([1, 1, 1], [100, 100, 200]), 400, { method: "REFERENCE", decimals: 0 });
  assert.deepStrictEqual(s, [100, 100, 200]);
  s = Distributor.distribute(cells([5, 0, undefined, 7]), 90, { method: "EQUAL", onlyEmpty: true, decimals: 0 });
  assert.deepStrictEqual(s, [null, 45, 45, null]);
  assert.deepStrictEqual(Distributor.distribute(cells([5, 7]), 90, { onlyEmpty: true }), [null, null]);
  s = Distributor.distribute(cells([1, 1, 1]), 1, { method: "EQUAL", decimals: 2 });
  assert.strictEqual(Math.round(s.reduce((a, b) => a + b, 0) * 100) / 100, 1);
  const buffer = new PlanBuffer();
  let notified = 0;
  buffer.attachSelection(() => notified++);
  buffer.notifySelection({ id: "grid" });
  assert.ok(notified === 1 && buffer.active.id === "grid");
});

const GridText = req("zsac/lib/planning/GridText");

test("grid text: copy format and paste parsing as spreadsheets exchange it", () => {
  assert.strictEqual(GridText.format([[1, undefined, 2.5], [3, 4, null]]), "1\t\t2.5\n3\t4\t");
  assert.deepStrictEqual(GridText.parse("1\t2\n3\t4\n"), [[1, 2], [3, 4]]);
  assert.deepStrictEqual(GridText.parse("1,234.5\t(200)\t\t1.234,5"), [[1234.5, -200, null, 1234.5]]);
  assert.ok(Number.isNaN(GridText.parse("abc")[0][0]));
  assert.deepStrictEqual(GridText.parse("5\r\n6"), [[5], [6]]);
  assert.deepStrictEqual(GridText.parse(GridText.format([[10, 20], [30, 40]])), [[10, 20], [30, 40]]);
});

test("plan history: labelled steps with times, undo and redo up to a step", () => {
  const b = new PlanBuffer();
  const none = () => null;
  b.apply([fact("A", "2026-01", 1)], none, "first");
  b.apply([fact("A", "2026-02", 2), fact("A", "2026-03", 3)], none, "second");
  b.apply([fact("B", "2026-01", 4)], none);
  let h = b.history();
  assert.deepStrictEqual(h.undo.map((s) => [s.label, s.count]), [["1 values changed", 1], ["second", 2], ["first", 1]]);
  assert.ok(h.undo[0].at <= Date.now() && h.undo[0].versions[0] === "BUD");
  assert.strictEqual(b.undoTo(1), 2);                      // the newest two steps are gone
  assert.strictEqual(b.count, 1);
  h = b.history();
  assert.deepStrictEqual([h.undo.length, h.redo.length], [1, 2]);
  assert.strictEqual(b.redoTo(0), 1);
  assert.strictEqual(b.count, 3);
});

const FormulaEngine = req("zsac/lib/planning/FormulaEngine");

test("formulas: arithmetic, shorthand, percentages, references, errors", () => {
  const run = (text, env) => { const f = FormulaEngine.compile(text); assert.ok(!f.error, f.error); return Math.round(f.evaluate(Object.assign({ current: 200, refs: {} }, env)) * 1e6) / 1e6; };
  assert.strictEqual(run("=120000*1.05"), 126000);
  assert.strictEqual(run("=2+3*4"), 14);
  assert.strictEqual(run("=(2+3)*4"), 20);
  assert.strictEqual(run("=-2^2+10"), 6);                  // -2^2 is -4
  assert.strictEqual(run("=2^-1"), 0.5);
  assert.strictEqual(run("*1.1"), 220);
  assert.strictEqual(run("+500"), 700);
  assert.strictEqual(run("-10%"), 180);                    // current minus 10 percent
  assert.strictEqual(run("+10%"), 220);
  assert.strictEqual(run("*10%"), 20);
  assert.strictEqual(run("=10%"), 0.1);
  assert.strictEqual(run("=current+current/4"), 250);
  assert.strictEqual(run("=ACT*1.05", { refs: { ACT: 100 } }), 105);
  assert.strictEqual(run("=act+10%", { refs: { ACT: 100 } }), 110);
  assert.deepStrictEqual(FormulaEngine.compile("=ACT+BUD*2+current").names.sort(), ["ACT", "BUD"]);
  assert.ok(FormulaEngine.compile("=2+").error);
  assert.ok(FormulaEngine.compile("=2$3").error);
  assert.ok(FormulaEngine.compile("=(2+3").error);
  assert.throws(() => FormulaEngine.compile("=1/0").evaluate({ current: 0, refs: {} }), /Division by zero/);
  assert.throws(() => FormulaEngine.compile("=FOO+1").evaluate({ current: 0, refs: {} }), /Unknown name FOO/);
  assert.ok(FormulaEngine.isFormula("=5") && FormulaEngine.isFormula("*2") && FormulaEngine.isFormula("+10%") && FormulaEngine.isFormula("-10%"));
  assert.ok(!FormulaEngine.isFormula("-5") && !FormulaEngine.isFormula("1,234") && !FormulaEngine.isFormula("10%") && !FormulaEngine.isFormula(""));
  assert.strictEqual(run("=-5"), -5);                      // with "=" a sign is a sign, not shorthand
});
