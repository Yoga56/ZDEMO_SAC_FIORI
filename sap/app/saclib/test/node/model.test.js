const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const req = require("./loader");

const QueryEngine = req("zsac/lib/core/QueryEngine");
const ModelSchema = req("zsac/lib/core/ModelSchema");
const MockProvider = req("zsac/lib/provider/MockProvider");

const fact = (v, p, r, val, m = "X") => ({ ModelId: "M", VersionId: v, Period: p, Measure: m, Dim1: r, Dim2: "", Dim3: "", Dim4: "", Dim5: "", Value: val });
const base = { ModelId: "M", Dimensions: [{ DimId: "REGION", Slot: 1 }], Measures: [] };
const facts = [fact("ACT", "2026-01", "A", 10), fact("ACT", "2026-02", "A", 20), fact("ACT", "2026-01", "B", 30), fact("ACT", "2026-02", "B", 40)];

test("measure aggregation: SUM is the default, AVG MIN MAX COUNT follow the measure", () => {
  const run = (agg) => QueryEngine.aggregate(Object.assign({}, base, { Measures: [{ MeasureId: "X", Aggregation: agg }] }), facts, { rows: ["REGION"], columns: [] });
  assert.strictEqual(QueryEngine.aggregate(base, facts, { rows: ["REGION"], columns: [] }).grand, 100);
  const avg = run("AVG");
  assert.strictEqual(avg.cell(["A"], []), 15);
  assert.strictEqual(avg.grand, 25);            // average of all facts, not of the cell averages
  assert.strictEqual(run("MAX").rowTotal(["B"]), 40);
  assert.strictEqual(run("MIN").grand, 10);
  assert.strictEqual(run("COUNT").cell(["A"], []), 2);
});

test("exception aggregation runs along its dimensions first, then the standard aggregation", () => {
  // headcount: add across regions, but take the AVERAGE over periods
  const model = Object.assign({}, base, { Measures: [{ MeasureId: "X", Aggregation: "SUM", ExceptionAggregation: "AVG", ExceptionDims: ["PERIOD"] }] });
  const r = QueryEngine.aggregate(model, facts, { rows: [], columns: [] });
  assert.strictEqual(r.grand, 15 + 35);          // A: avg(10,20)=15, B: avg(30,40)=35, summed
  const byPeriod = QueryEngine.aggregate(model, facts, { rows: ["PERIOD"], columns: [] });
  assert.strictEqual(byPeriod.cell(["2026-01"], []), 40);   // one period in the cell: nothing to average over
});

test("single measure is reported for formatting; mixed measures are not", () => {
  const model = Object.assign({}, base, { Measures: [{ MeasureId: "X", Label: "X", Scale: 1000 }, { MeasureId: "Y" }] });
  assert.strictEqual(QueryEngine.aggregate(model, facts, { rows: [], columns: [] }).measure.MeasureId, "X");
  assert.strictEqual(QueryEngine.aggregate(model, facts.concat(fact("ACT", "2026-01", "A", 1, "Y")), { rows: [], columns: [] }).measure, null);
});

test("normalize fills defaults; validate catches structure problems", () => {
  const m = ModelSchema.normalize({ ModelId: "M", Name: "M", Dimensions: [{ DimId: "R", Slot: 1 }], Measures: [{ MeasureId: "A", Unit: "USD" }] });
  assert.strictEqual(m.Measures[0].Aggregation, "SUM");
  assert.strictEqual(m.Measures[0].UnitType, "Currency");
  assert.strictEqual(m.PlanningEnabled, true);
  assert.deepStrictEqual(ModelSchema.validate(ModelSchema.newModel()), ["Model ID: capital letters, digits and underscore, starting with a letter", "Name is required"]);
  const bad = ModelSchema.normalize(Object.assign(ModelSchema.newModel(), { ModelId: "OK", Name: "ok" }));
  bad.Measures[0].ExceptionAggregation = "AVG";
  assert.ok(ModelSchema.validate(bad).some((x) => /exception aggregation dimensions/.test(x)));
  bad.Measures[0].ExceptionDims = ["NOPE"];
  assert.ok(ModelSchema.validate(bad).some((x) => /unknown dimension NOPE/.test(x)));
  bad.Measures[0].ExceptionDims = ["PERIOD"];
  assert.deepStrictEqual(ModelSchema.validate(bad), []);
  assert.strictEqual(ModelSchema.unitLabel({ UnitType: "Currency", Unit: "USD", Scale: 1000 }), "USD k");
});

test("audit log records changed plan values only for models with data audit on", async () => {
  const dir = path.resolve(__dirname, "../../src/zsac/lib/provider/mockdata");
  const seed = {};
  ["models", "facts", "versions", "stories", "dataactions", "multiactions", "files", "tasks", "audit"].forEach((n) => {
    const f = path.join(dir, n + ".json");
    seed[n] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
  });
  const p = new MockProvider({ seed, persist: false });
  const f = (await p.readFacts("OPEX_PLAN", { VERSION: ["BUD"], PERIOD: ["2026-01"] }))[0];
  await p.writeFacts("OPEX_PLAN", [Object.assign({}, f, { Value: f.Value + 1 })]);
  assert.strictEqual((await p.listAudit("OPEX_PLAN")).length, 0);          // audit is off in the sample
  const m = await p.getModel("OPEX_PLAN");
  await p.saveModel(Object.assign({}, m, { DataAudit: true }));
  await p.writeFacts("OPEX_PLAN", [Object.assign({}, f, { Value: f.Value + 5 })]);
  const log = await p.listAudit("OPEX_PLAN");
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].New - log[0].Old, 4);
  await p.writeFacts("OPEX_PLAN", [Object.assign({}, f, { Value: f.Value + 5 })]);   // same value again: nothing new
  assert.strictEqual((await p.listAudit("OPEX_PLAN")).length, 1);
});
