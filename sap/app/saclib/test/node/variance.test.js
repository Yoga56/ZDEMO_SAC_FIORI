const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const req = require("./loader");

const VarianceEngine = req("zsac/lib/core/VarianceEngine");
const ModelSchema = req("zsac/lib/core/ModelSchema");
const dir = path.resolve(__dirname, "../../src/zsac/lib/provider/mockdata");
const model = ModelSchema.normalize(JSON.parse(fs.readFileSync(path.join(dir, "models.json"), "utf8")).find((m) => m.ModelId === "SALES_PLAN"));
const facts = JSON.parse(fs.readFileSync(path.join(dir, "facts.json"), "utf8")).filter((f) => f.ModelId === "SALES_PLAN");

const f = (version, period, measure, region, product, channel, value) => ({ ModelId: "SALES_PLAN", VersionId: version, Period: period, Measure: measure, Dim1: region, Dim2: product, Dim3: channel, Dim4: "", Dim5: "", Value: value });
// budget 100 everywhere (4 combinations in 2 months), actual: EMEA/Cloud ERP +60, EMEA/Services -10, APAC/Cloud ERP +5, rest unchanged
const small = [];
[["EMEA", "Cloud ERP"], ["EMEA", "Services"], ["APAC", "Cloud ERP"], ["APAC", "Services"]].forEach(([r, p], i) => {
  ["2026-01", "2026-02"].forEach((m) => {
    small.push(f("BUD", m, "REVENUE", r, p, "Direct", 100));
    small.push(f("ACT", m, "REVENUE", r, p, "Direct", 100 + [30, -5, 2.5, 0][i]));
    small.push(f("BUD", m, "COST", r, p, "Direct", 10));
    small.push(f("ACT", m, "COST", r, p, "Direct", 12));
  });
});

test("variance: totals, shares add up, members ranked by the size of the change", () => {
  const r = VarianceEngine.explain(model, small, { measure: "REVENUE", base: { VERSION: ["BUD"] }, compare: { VERSION: ["ACT"] }, labels: { base: "Budget", compare: "Actual" } });
  assert.strictEqual(r.base, 800);
  assert.strictEqual(r.compare, 855);
  assert.strictEqual(r.delta, 55);
  assert.strictEqual(r.pct, 6.875);
  assert.strictEqual(r.favorable, true);
  const region = r.dims.find((d) => d.dimId === "REGION");
  assert.deepStrictEqual(region.rows.map((x) => [x.member, x.delta]), [["EMEA", 50], ["APAC", 5]]);
  assert.strictEqual(Math.round(region.rows.reduce((s, x) => s + x.delta, 0)), 55, "the contributions of a dimension sum to the total change");
  assert.ok(Math.abs(region.rows.reduce((s, x) => s + Math.abs(x.share), 0) - 1) < 1e-9, "the shares without sign add up to one");
  const product = r.dims.find((d) => d.dimId === "PRODUCT");
  assert.deepStrictEqual(product.rows.map((x) => [x.member, x.delta]), [["Cloud ERP", 65], ["Services", -10]]);
  assert.ok(Math.abs(product.rows[1].share + 10 / 75) < 0.001 && product.rows[1].favorable === false);
  assert.strictEqual(product.up, 65);
  assert.strictEqual(product.down, -10);
  assert.ok(!r.dims.some((d) => d.dimId === "CHANNEL"), "a dimension with one member explains nothing");
  assert.ok(!r.dims.some((d) => d.dimId === "VERSION"), "the compared dimension is not a breakdown");
  assert.strictEqual(r.dims[0].dimId, "REGION", "the dimension where one member holds the biggest part of the movement comes first");
});

test("variance: the narrative names the drivers and what moves the other way, drilling down", () => {
  const r = VarianceEngine.explain(model, small, { measure: "REVENUE", base: { VERSION: ["BUD"] }, compare: { VERSION: ["ACT"] }, labels: { base: "Budget", compare: "Actual" } });
  assert.match(r.narrative.text, /^Revenue in Actual is 55 \(\+6\.9%\) above Budget\./);
  assert.match(r.narrative.text, /The biggest driver is Region Europe, Middle East, Africa \(\+50, 91% of the movement\)\./);
  assert.match(r.narrative.text, /Within it, Product Cloud ERP \(\+60, 86% of the movement\)\./);
  assert.ok(!/Date/.test(r.narrative.text), "two months with the same change: neither is a driver");
  assert.deepStrictEqual(r.narrative.path.map((x) => x.dimId + ":" + x.member), ["REGION:EMEA", "PRODUCT:Cloud ERP"]);
  const mixed = small.filter((x) => x.Dim1 === "EMEA" && x.Measure === "REVENUE" && x.Period === "2026-01");
  const m2 = VarianceEngine.explain(model, mixed.map((x) => (x.VersionId === "ACT" && x.Dim2 === "Services" ? Object.assign({}, x, { Value: 80 }) : x)), { measure: "REVENUE", base: { VERSION: ["BUD"] }, compare: { VERSION: ["ACT"] } });
  assert.match(m2.narrative.text, /The net change is small because movements cancel out: \+30 up and -20 down\./);
  assert.match(m2.narrative.text, /Product Cloud ERP \(\+30, 60% of the movement\); Product Services moves the other way \(-20\)/);
});

test("variance: lower is better turns an increase into an unfavorable change; a drill path restricts both sides", () => {
  const cost = VarianceEngine.explain(model, small, { measure: "COST", base: { VERSION: ["BUD"] }, compare: { VERSION: ["ACT"] }, lowerIsBetter: true });
  assert.strictEqual(cost.delta, 16);
  assert.strictEqual(cost.favorable, false);
  assert.ok(cost.dims.every((d) => d.rows.every((x) => x.favorable === false)));
  const emea = VarianceEngine.explain(model, small, { measure: "REVENUE", base: { VERSION: ["BUD"] }, compare: { VERSION: ["ACT"] }, filters: { REGION: ["EMEA"] } });
  assert.strictEqual(emea.delta, 50);
  assert.ok(!emea.dims.some((d) => d.dimId === "REGION"));
});

test("variance: periods against periods, hierarchy nodes in the filter, no change, no data, measures that do not add up", () => {
  const q = VarianceEngine.explain(model, small, { measure: "REVENUE", base: { PERIOD: ["2026-01"] }, compare: { PERIOD: ["2026-02"] }, filters: { VERSION: ["ACT"] } });
  assert.strictEqual(q.delta, 0);
  assert.match(q.narrative.text, /is the same in/);
  const node = VarianceEngine.explain(model, small, { measure: "REVENUE", base: { VERSION: ["BUD"] }, compare: { VERSION: ["ACT"] }, filters: { REGION: ["EASTERN"] } });
  assert.strictEqual(node.delta, 55, "EASTERN is EMEA and APAC");
  const none = VarianceEngine.explain(model, small, { measure: "REVENUE", base: { VERSION: ["NOPE"] }, compare: { VERSION: ["NOPE2"] } });
  assert.match(none.narrative.text, /no Revenue in either slice/);
  const avg = ModelSchema.normalize(Object.assign({}, model, { Measures: [{ MeasureId: "REVENUE", Aggregation: "AVG" }] }));
  assert.match(VarianceEngine.explain(avg, small, { measure: "REVENUE", base: {}, compare: {} }).error, /does not add up/);
  assert.match(VarianceEngine.explain(model, small, { measure: "NOPE", base: {}, compare: {} }).error, /Unknown measure/);
});

test("variance on the sample data: actual against budget, the months, a drill of three levels at most", () => {
  const r = VarianceEngine.explain(model, facts, { measure: "REVENUE", base: { VERSION: ["BUD"] }, compare: { VERSION: ["ACT"] }, filters: { PERIOD: ["2026-01", "2026-02", "2026-03"] } });
  const total = r.dims.map((d) => Math.round(d.rows.reduce((s, x) => s + x.delta, 0)));
  total.forEach((t) => assert.ok(Math.abs(t - Math.round(r.delta)) <= 1, t + " vs " + r.delta));
  assert.ok(r.narrative.text.length > 40);
  const months = r.dims.find((d) => d.dimId === "PERIOD");
  assert.deepStrictEqual(months.rows.map((x) => x.member).sort(), ["2026-01", "2026-02", "2026-03"]);
});

test("variance: the filter that loads the facts of both sides", () => {
  assert.deepStrictEqual(VarianceEngine.loadFilter({ base: { VERSION: ["BUD"] }, compare: { VERSION: ["ACT"] }, filters: { REGION: ["EMEA"] } }), { VERSION: ["BUD", "ACT"], REGION: ["EMEA"] });
  assert.deepStrictEqual(VarianceEngine.loadFilter({ base: { PERIOD: ["2026-01"] }, compare: { PERIOD: ["2026-02"] }, filters: { VERSION: ["ACT"] } }), { PERIOD: ["2026-01", "2026-02"], VERSION: ["ACT"] });
  assert.deepStrictEqual(VarianceEngine.loadFilter({ base: { VERSION: ["BUD"] }, compare: {} }), {}, "a side without a restriction needs everything");
});

test("variance: versions that cover different months are compared on the months they share", () => {
  const rows = small.filter((x) => x.Measure === "REVENUE" && x.Dim1 === "EMEA" && x.Dim2 === "Cloud ERP");
  const partial = rows.filter((x) => !(x.VersionId === "ACT" && x.Period === "2026-02"));
  const spec = { measure: "REVENUE", base: { VERSION: ["BUD"] }, compare: { VERSION: ["ACT"] } };
  const c = VarianceEngine.commonPeriods(model, partial, spec);
  assert.deepStrictEqual(c.periods, ["2026-01"]);
  assert.match(c.note, /only the months both have are compared \(Jan 2026 to Jan 2026\)/);
  assert.strictEqual(VarianceEngine.explain(model, partial, Object.assign({}, spec, { filters: { PERIOD: c.periods } })).delta, 30);
  assert.strictEqual(VarianceEngine.explain(model, partial, spec).delta, -70, "without aligning the missing month looks like a loss");
  assert.deepStrictEqual(VarianceEngine.commonPeriods(model, rows, spec).periods, [], "the same months on both sides: nothing to align");
  assert.deepStrictEqual(VarianceEngine.commonPeriods(model, partial, { measure: "REVENUE", base: { PERIOD: ["2026-01"] }, compare: { PERIOD: ["2026-02"] } }).periods, []);
});

test("variance: a total that nets to zero still explains the parts that differ", () => {
  const net = [
    f("BUD", "2026-01", "REVENUE", "EMEA", "Cloud ERP", "Direct", 100), f("BUD", "2026-01", "REVENUE", "EMEA", "Services", "Direct", -100),
    f("ACT", "2026-01", "REVENUE", "EMEA", "Cloud ERP", "Direct", 150), f("ACT", "2026-01", "REVENUE", "EMEA", "Services", "Direct", -150)];
  const r = VarianceEngine.explain(model, net, { measure: "REVENUE", base: { VERSION: ["BUD"] }, compare: { VERSION: ["ACT"] }, labels: { base: "Budget", compare: "Actual" } });
  assert.strictEqual(r.delta, 0);
  assert.match(r.narrative.text, /Revenue adds up to the same in Actual and Budget, but its parts differ\./);
  assert.match(r.narrative.text, /The biggest driver is /);
  assert.doesNotMatch(r.narrative.text, /There is no/);
});
