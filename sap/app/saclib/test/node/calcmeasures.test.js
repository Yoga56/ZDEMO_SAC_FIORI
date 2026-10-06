const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");

const CalcMeasures = req("zsac/lib/core/CalcMeasures");
const QueryEngine = req("zsac/lib/core/QueryEngine");
const ModelSchema = req("zsac/lib/core/ModelSchema");

const model = ModelSchema.normalize({ ModelId: "M", Name: "M", PeriodFrom: "2026-01", PeriodTo: "2026-02",
  Dimensions: [{ DimId: "REGION", Label: "Region", Slot: 1, Members: [{ Id: "A" }, { Id: "B" }] }],
  Measures: [{ MeasureId: "REV", Label: "Revenue", Aggregation: "SUM" }, { MeasureId: "COST", Label: "Cost", Aggregation: "SUM" }],
  CalcMeasures: [{ MeasureId: "PROFIT", Label: "Profit", Formula: "REV - COST", Unit: "USD" },
    { MeasureId: "MARGIN", Label: "Margin", Formula: "PROFIT / REV", Percent: true }] });
const f = (r, p, m, v) => ({ ModelId: "M", VersionId: "BUD", Period: p, Measure: m, Dim1: r, Dim2: "", Dim3: "", Dim4: "", Dim5: "", Value: v });
const facts = [f("A", "2026-01", "REV", 100), f("A", "2026-01", "COST", 60), f("B", "2026-01", "REV", 300), f("B", "2026-01", "COST", 270), f("B", "2026-02", "REV", 50)];

test("a calculated measure is worked out per cell on aggregated numbers", () => {
  const r = QueryEngine.aggregate(model, facts, { rows: ["REGION"], columns: [], filters: { MEASURE: ["PROFIT"] } });
  assert.strictEqual(r.cell(["A"], []), 40);
  assert.strictEqual(r.cell(["B"], []), 80);          // 350 - 270
  assert.strictEqual(r.grand, 120);
  assert.strictEqual(r.measure.Label, "Profit");
  assert.strictEqual(r.measure.Calculated, true);
  assert.deepStrictEqual(r.cellFacts(["A"], []), []);        // read only
});

test("a ratio of totals is not the total of ratios; percent; a formula on a calculated measure; no value gives an empty cell", () => {
  const r = QueryEngine.aggregate(model, facts, { rows: ["REGION"], columns: ["PERIOD"], filters: { MEASURE: ["MARGIN"] } });
  assert.strictEqual(r.cell(["A"], ["2026-01"]), 40);                         // 40 / 100 as a percentage
  assert.strictEqual(Math.round(r.cell(["B"], ["2026-01"]) * 100) / 100, 10);
  assert.strictEqual(Math.round(r.grand * 100) / 100, Math.round((120 / 450) * 10000) / 100);   // (profit of all) / (revenue of all)
  assert.strictEqual(r.measure.Unit, "%");
  // February of B has revenue but no cost: cost counts as 0, margin is 100
  assert.strictEqual(r.cell(["B"], ["2026-02"]), 100);
  // nothing for A in February: empty
  assert.strictEqual(r.cell(["A"], ["2026-02"]), undefined);
});

test("reading a calculated measure asks the provider for the measures it is made of", () => {
  assert.deepStrictEqual(CalcMeasures.baseIds(model, ["MARGIN"]).sort(), ["COST", "REV"]);
  assert.deepStrictEqual(QueryEngine.expandFilters(model, { MEASURE: ["PROFIT"], REGION: ["A"] }).MEASURE.sort(), ["COST", "REV"]);
  assert.deepStrictEqual(CalcMeasures.all(model).map((m) => m.MeasureId + (m.Calculated ? "*" : "")), ["REV", "COST", "PROFIT*", "MARGIN*"]);
});

test("calculated measures are validated", () => {
  const bad = CalcMeasures.validate(model, [
    { MeasureId: "REV", Formula: "COST" }, { MeasureId: "x y", Formula: "REV" }, { MeasureId: "Z", Formula: "REV +" },
    { MeasureId: "ONE", Formula: "5" }, { MeasureId: "A1", Formula: "NOPE * 2" }, { MeasureId: "A2", Formula: "A3 + REV" }, { MeasureId: "A3", Formula: "REV" }]);
  ["already used by a measure", "letters, digits", "ends too early", "uses no measure", "NOPE is not a measure", "A3 is not a measure of the model defined before"].forEach((t) => assert.ok(bad.some((e) => e.indexOf(t) >= 0), t + "\n" + bad.join("\n")));
  assert.deepStrictEqual(CalcMeasures.validate(model, model.CalcMeasures), []);
  assert.ok(ModelSchema.validate(Object.assign({}, model, { CalcMeasures: [{ MeasureId: "REV", Formula: "COST" }] })).some((e) => /already used/.test(e)));
});
