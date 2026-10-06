const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const req = require("./loader");

const LockEngine = req("zsac/lib/planning/LockEngine");
const PlanEditor = req("zsac/lib/planning/PlanEditor");
const QueryEngine = req("zsac/lib/core/QueryEngine");
const MockProvider = req("zsac/lib/provider/MockProvider");

const model = { ModelId: "M", PlanningEnabled: true, DataLocking: true, PeriodFrom: "2026-01", PeriodTo: "2026-12",
  Dimensions: [{ DimId: "REGION", Slot: 1, Members: [{ Id: "A" }, { Id: "B" }, { Id: "ALL" }], Hierarchies: [{ Id: "H", Parents: { A: "ALL", B: "ALL" } }] }],
  Measures: [{ MeasureId: "X", Aggregation: "SUM" }],
  LockRegions: [
    { Id: "R1", Name: "Q1 closed", State: "LOCKED", Filter: { PERIOD: ["2026-Q1"] } },
    { Id: "R2", Name: "B is the controller's", State: "RESTRICTED", Owners: ["carol"], Filter: { REGION: ["B"] } }
  ] };
const fact = (r, p, v, ver = "BUD") => ({ ModelId: "M", VersionId: ver, Period: p, Measure: "X", Dim1: r, Dim2: "", Dim3: "", Dim4: "", Dim5: "", Value: v });

test("a quarter or a hierarchy node in a region stands for everything below it", () => {
  const c = LockEngine.compile(model);
  assert.strictEqual(LockEngine.check(c, fact("A", "2026-02", 1), "ME").state, "LOCKED");
  assert.strictEqual(LockEngine.check(c, fact("A", "2026-04", 1), "ME").state, "OPEN");
  assert.strictEqual(LockEngine.check(c, fact("B", "2026-04", 1), "ME").ok, false);
  assert.strictEqual(LockEngine.check(c, fact("B", "2026-04", 1), "Carol").ok, true);        // owners are compared without case
  const node = LockEngine.compile(Object.assign({}, model, { LockRegions: [{ Id: "N", Name: "All", State: "LOCKED", Filter: { REGION: ["ALL"] } }] }));
  assert.strictEqual(LockEngine.check(node, fact("A", "2026-04", 1), "ME").state, "LOCKED");
});

test("the strictest region wins; the model default applies outside every region", () => {
  const c = LockEngine.compile(model);
  const both = LockEngine.check(c, fact("B", "2026-01", 1), "carol");          // locked beats the owner's restriction
  assert.strictEqual(both.state, "LOCKED");
  assert.strictEqual(both.ok, false);
  const closed = LockEngine.compile(Object.assign({}, model, { LockDefault: "LOCKED", LockRegions: [{ Id: "O", Name: "Open", State: "OPEN", Filter: { REGION: ["A"] } }] }));
  assert.strictEqual(LockEngine.check(closed, fact("A", "2026-05", 1), "ME").ok, true);
  assert.strictEqual(LockEngine.check(closed, fact("B", "2026-05", 1), "ME").ok, false);
});

test("a model without Data Locking has no locks", () => {
  const c = LockEngine.compile(Object.assign({}, model, { DataLocking: false }));
  assert.strictEqual(LockEngine.check(c, fact("A", "2026-01", 1), "ME").ok, true);
  assert.deepStrictEqual(LockEngine.blocked(Object.assign({}, model, { DataLocking: false }), [fact("A", "2026-01", 1)], "ME"), []);
});

test("cell state: all alike, mixed, with the reason", () => {
  const c = LockEngine.compile(model);
  const allLocked = LockEngine.cellState(c, [fact("A", "2026-01", 1), fact("A", "2026-02", 1)], "ME");
  assert.strictEqual(allLocked.state, "LOCKED");
  assert.match(allLocked.reason, /locked by region Q1 closed/);
  const mixed = LockEngine.cellState(c, [fact("A", "2026-01", 1), fact("A", "2026-05", 1)], "ME");
  assert.strictEqual(mixed.state, "MIXED");
  assert.strictEqual(mixed.ok, false);
  assert.strictEqual(LockEngine.cellState(c, [fact("A", "2026-05", 1)], "ME").ok, true);
  assert.match(LockEngine.cellState(c, [fact("B", "2026-05", 1)], "ME").reason, /restricted by region .* to CAROL/);
});

test("blocked and message: private versions are not locked", () => {
  const list = LockEngine.blocked(model, [fact("A", "2026-01", 1), fact("A", "2026-02", 2), fact("A", "2026-07", 3), fact("A", "2026-01", 4, "PRIV1")], "ME", (v) => v === "PRIV1");
  assert.strictEqual(list.length, 2);
  assert.match(LockEngine.message(list), /2 values in region Q1 closed \(locked\)/);
});

test("validate: names, states, owners, dimensions", () => {
  assert.deepStrictEqual(LockEngine.validate(model, LockEngine.normalize(model.LockRegions)), []);
  const bad = LockEngine.validate(model, [{ Id: "A", Name: "", State: "WHAT", Filter: { NOPE: ["x"] } }, { Id: "A", Name: "Two", State: "RESTRICTED", Filter: {} }]);
  assert.ok(bad.some((e) => /needs a name/.test(e)));
  assert.ok(bad.some((e) => /Open, Restricted or Locked/.test(e)));
  assert.ok(bad.some((e) => /NOPE is not a dimension/.test(e)));
  assert.ok(bad.some((e) => /used twice/.test(e)));
  assert.ok(bad.some((e) => /names no owner/.test(e)));
});

test("typing into a locked cell is refused with the reason; a spread over a total needs every value open", () => {
  const versions = [{ VersionId: "BUD", Locked: false, Category: "BUDGET" }];
  const facts = [fact("A", "2026-01", 10), fact("A", "2026-05", 20)];
  const spec = { rows: ["REGION"], columns: ["PERIOD"], filters: { VERSION: ["BUD"], MEASURE: ["X"] }, hierarchies: { PERIOD: "TIME" } };
  const r = QueryEngine.aggregate(model, facts, spec);
  const ctx = { model, spec, versions, editable: true, lock: { compiled: LockEngine.compile(model), user: "ME" } };
  const jan = PlanEditor.cellState(ctx, r, ["A"], ["2026-01"]);
  assert.strictEqual(jan.editable, false);
  assert.strictEqual(jan.lock, "LOCKED");
  assert.strictEqual(PlanEditor.edit(ctx, r, ["A"], ["2026-01"], 5).error.indexOf("locked"), 8);
  const may = PlanEditor.cellState(ctx, r, ["A"], ["2026-05"]);
  assert.strictEqual(may.editable, true);
  assert.strictEqual(may.lock, "OPEN");
  assert.strictEqual(PlanEditor.cellState(ctx, r, ["A"], ["2026"]).editable, false);    // the year holds January
  assert.strictEqual(PlanEditor.cellState(ctx, r, ["A"], ["2026-Q2"]).editable, true);
  // without the lock in the context the same cell is open
  assert.strictEqual(PlanEditor.cellState(Object.assign({}, ctx, { lock: null }), r, ["A"], ["2026-01"]).editable, true);
});

const dir = path.resolve(__dirname, "../../src/zsac/lib/provider/mockdata");
const seed = {};
["models", "facts", "versions", "stories", "dataactions", "multiactions", "files", "tasks"].forEach((n) => { seed[n] = JSON.parse(fs.readFileSync(path.join(dir, n + ".json"), "utf8")); });
const make = () => new MockProvider({ seed, persist: false });

test("provider: writes into a locked region fail whole; unchanged values and private versions pass; publish respects the lock", async () => {
  const p = make();
  const m = await p.getModel("SALES_PLAN");
  await p.saveModel(Object.assign({}, m, { LockRegions: [{ Id: "R1", Name: "Q1 closed", State: "LOCKED", Filter: { PERIOD: ["2026-Q1"] } }] }));
  const jan = (await p.readFacts("SALES_PLAN", { VERSION: ["BUD"], MEASURE: ["REVENUE"], PERIOD: ["2026-01"] }))[0];
  const dec = (await p.readFacts("SALES_PLAN", { VERSION: ["BUD"], MEASURE: ["REVENUE"], PERIOD: ["2026-12"] }))[0];
  await assert.rejects(p.writeFacts("SALES_PLAN", [Object.assign({}, dec, { Value: dec.Value + 1 }), Object.assign({}, jan, { Value: jan.Value + 1 })]), /Data locking stops this change.*1 value in region Q1 closed/);
  const after = (await p.readFacts("SALES_PLAN", { VERSION: ["BUD"], MEASURE: ["REVENUE"], PERIOD: ["2026-12"] }))[0];
  assert.strictEqual(after.Value, dec.Value);                                              // nothing was written
  await p.writeFacts("SALES_PLAN", [jan]);                                                 // the same value: no change, no refusal
  await p.writeFacts("SALES_PLAN", [Object.assign({}, dec, { Value: dec.Value + 1 })]);    // outside the region
  const v = await p.createPrivateVersion("SALES_PLAN", "BUD", "What if");                  // copying into a private version is not locked
  const pj = (await p.readFacts("SALES_PLAN", { VERSION: [v.VersionId], MEASURE: ["REVENUE"], PERIOD: ["2026-01"] }))[0];
  await p.writeFacts("SALES_PLAN", [Object.assign({}, pj, { Value: pj.Value + 5 })]);
  await assert.rejects(p.publishVersion("SALES_PLAN", v.VersionId, "BUD"), /Data locking stops this change/);
  await p.saveModel(Object.assign({}, m, { LockRegions: [] }));
  await p.publishVersion("SALES_PLAN", v.VersionId, "BUD");
});
