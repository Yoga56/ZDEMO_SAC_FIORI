const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");

const QueryEngine = req("zsac/lib/core/QueryEngine");
const FilterEngine = req("zsac/lib/core/FilterEngine");
const DataActionEngine = req("zsac/lib/planning/DataActionEngine");
const VersionEngine = req("zsac/lib/planning/VersionEngine");

const model = {
  ModelId: "M",
  Dimensions: [
    { DimId: "REGION", Slot: 1, Members: [{ Id: "B" }, { Id: "A" }] },
    { DimId: "PRODUCT", Slot: 2, Members: [] }
  ]
};
const fact = (v, p, r, pr, val, m = "REV") => ({ ModelId: "M", VersionId: v, Period: p, Measure: m, Dim1: r, Dim2: pr, Dim3: "", Dim4: "", Dim5: "", Value: val });
const facts = [
  fact("ACT", "2026-01", "A", "X", 10), fact("ACT", "2026-02", "A", "X", 20),
  fact("ACT", "2026-01", "B", "Y", 5), fact("BUD", "2026-01", "A", "X", 100)
];

test("aggregate sums, orders by master data and totals", () => {
  const r = QueryEngine.aggregate(model, facts, { rows: ["REGION"], columns: ["VERSION"], filters: { VERSION: ["ACT"] } });
  assert.deepStrictEqual(r.rowKeys, [["B"], ["A"]]);          // model order, not alphabetical
  assert.strictEqual(r.cell(["A"], ["ACT"]), 30);
  assert.strictEqual(r.grand, 35);
  assert.strictEqual(r.colTotal(["ACT"]), 35);
});

test("unknown dimension is an error, built-ins are not", () => {
  assert.throws(() => QueryEngine.fieldOf(model, "NOPE"));
  assert.strictEqual(QueryEngine.fieldOf(model, "PERIOD"), "Period");
});

test("filter merge narrows and search/replace rewrites members", () => {
  assert.deepStrictEqual(FilterEngine.merge({ R: ["A", "B"] }, { R: ["B", "C"] }), { R: ["B"] });
  assert.deepStrictEqual(FilterEngine.searchReplace({ P: ["FY25-Q1", "FY25-Q2"] }, "P", "fy25", "FY26"), { P: ["FY26-Q1", "FY26-Q2"] });
  assert.ok(FilterEngine.isEmpty({ R: [] }));
});

test("data action COPY then SCALE, narrowed by the data filter parameter", () => {
  const action = { Steps: [
    { StepNo: 10, StepType: "COPY", SrcVersion: "ACT", TgtVersion: "FCT", Filter: {}, Factor: 1 },
    { StepNo: 20, StepType: "SCALE", TgtVersion: "FCT", Filter: {}, Factor: 2 }
  ] };
  const all = DataActionEngine.run(model, facts, action, {});
  assert.strictEqual(all.facts.filter((f) => f.VersionId === "FCT").length, 3);
  assert.strictEqual(all.facts.find((f) => f.VersionId === "FCT" && f.Period === "2026-02").Value, 40);

  const narrowed = DataActionEngine.run(model, facts, action, { Filter: { REGION: ["A"] } });
  assert.strictEqual(narrowed.facts.filter((f) => f.VersionId === "FCT").length, 2);
});

test("data action ALLOCATE spreads the sum equally and diff reports only the change", () => {
  const action = { Steps: [{ StepNo: 10, StepType: "ALLOCATE", SrcVersion: "ACT", TgtVersion: "FCT",
    Filter: { REGION: ["A"] }, TargetDim: "REGION", TargetMembers: ["A", "B"] }] };
  const run = DataActionEngine.run(model, facts, action, {});
  const fct = run.facts.filter((f) => f.VersionId === "FCT" && f.Period === "2026-01");
  assert.deepStrictEqual(fct.map((f) => [f.Dim1, f.Value]).sort(), [["A", 5], ["B", 5]]);
  const d = DataActionEngine.diff(facts, run.facts);
  assert.strictEqual(d.deletes.length, 0);
  assert.strictEqual(d.upserts.length, 4);
});

test("version publish replaces the target, revert drops the version", () => {
  const priv = VersionEngine.copyVersion(facts, "ACT", "PRIV1");
  const withPriv = facts.concat(priv);
  const published = VersionEngine.publish(withPriv, "PRIV1", "BUD");
  assert.strictEqual(published.filter((f) => f.VersionId === "BUD").length, 3);
  assert.ok(!published.some((f) => f.VersionId === "BUD" && f.Value === 100));
  assert.strictEqual(VersionEngine.revert(withPriv, "PRIV1").some((f) => f.VersionId === "PRIV1"), false);
  const v = VersionEngine.variance(facts, "BUD", "ACT");
  assert.strictEqual(v[0].Value, 90);
});

test("chart builders return svg for every type and a placeholder for no data", () => {
  const B = req("zsac/lib/widget/ChartBuilders");
  const D = req("zsac/lib/widget/ChartData");
  const r = QueryEngine.aggregate(model, facts, { rows: ["REGION"], columns: ["PRODUCT"], filters: { VERSION: ["ACT"] } });
  assert.ok(B.bar(D.fromResult("chart.bar", r), 400, 240).includes("<rect"));
  const t = QueryEngine.aggregate(model, facts, { rows: ["PERIOD"], columns: ["REGION"], filters: { VERSION: ["ACT"] } });
  assert.ok(B.line(D.fromResult("chart.line", t), 400, 240).includes("polyline"));
  assert.strictEqual(D.fromResult("chart.line", t).series.find((x) => x.name === "B").values[1], null);   // gap, not zero
  assert.ok(B.donut(D.fromResult("chart.donut", r), 400, 240).includes("<path"));
  assert.ok(B.funnel(D.fromResult("chart.funnel", r), 300, 240).includes("<path"));
  assert.ok(B.sankey(D.fromResult("chart.sankey", r), 400, 240).includes("zsacLink"));
  assert.ok(B.gauge({ value: 80, max: 100 }, 240, 160).includes("80%"));
  assert.ok(B.bar({ categories: [], series: [] }, 300, 200).includes("No data"));
});
