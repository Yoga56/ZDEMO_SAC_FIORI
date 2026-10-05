const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");

const QueryEngine = req("zsac/lib/core/QueryEngine");
const HierarchyEngine = req("zsac/lib/core/HierarchyEngine");
const ModelSchema = req("zsac/lib/core/ModelSchema");
const ChartData = req("zsac/lib/widget/ChartData");

const dim = {
  DimId: "REGION", Slot: 1, Type: "GENERIC",
  Members: ["WORLD", "AMERICAS", "AMER", "LATAM", "EASTERN", "EMEA", "APAC"].map((Id) => ({ Id, Text: Id })),
  Hierarchies: [{ Id: "GEO", Label: "Geography", Parents: { AMERICAS: "WORLD", EASTERN: "WORLD", AMER: "AMERICAS", LATAM: "AMERICAS", EMEA: "EASTERN", APAC: "EASTERN" } }]
};
const model = { ModelId: "M", Dimensions: [dim], Measures: [] };
const fact = (r, val, p = "2026-01") => ({ ModelId: "M", VersionId: "ACT", Period: p, Measure: "X", Dim1: r, Dim2: "", Dim3: "", Dim4: "", Dim5: "", Value: val });
const facts = [fact("AMER", 10), fact("LATAM", 5), fact("EMEA", 20), fact("APAC", 30), fact("APAC", 1, "2026-02")];

test("hierarchy: depth first order, depth, ancestors, unplaced members are roots", () => {
  const h = HierarchyEngine.build(dim, "GEO");
  assert.deepStrictEqual(h.order, ["WORLD", "AMERICAS", "AMER", "LATAM", "EASTERN", "EMEA", "APAC"]);
  assert.strictEqual(h.depth("LATAM"), 3);
  assert.deepStrictEqual(h.path("APAC"), ["WORLD", "EASTERN", "APAC"]);
  assert.deepStrictEqual(h.path("UNKNOWN"), ["UNKNOWN"]);
  assert.ok(h.isLeaf("AMER") && !h.isLeaf("WORLD"));
  assert.deepStrictEqual(HierarchyEngine.build(dim, "NOPE").roots.length, 7);   // no such hierarchy: everything is a root
});

test("query with a hierarchy: a node holds its subtree, totals count each fact once", () => {
  const r = QueryEngine.aggregate(model, facts, { rows: ["REGION"], columns: [], hierarchies: { REGION: "GEO" } });
  const v = (id) => r.cell([id], []);
  assert.strictEqual(v("AMER"), 10);
  assert.strictEqual(v("AMERICAS"), 15);
  assert.strictEqual(v("EASTERN"), 51);
  assert.strictEqual(v("WORLD"), 66);
  assert.strictEqual(r.grand, 66);                       // not 66 + the nodes
  assert.deepStrictEqual(r.rowKeys.map((k) => k[0]), ["WORLD", "AMERICAS", "AMER", "LATAM", "EASTERN", "EMEA", "APAC"]);
  const info = r.rowInfo(["LATAM"]);
  assert.deepStrictEqual([info.depth, info.hasChildren, info.parent], [3, false, ["AMERICAS"]]);
  assert.strictEqual(r.rowInfo(["WORLD"]).parent, null);
});

test("hierarchy on a column axis, other dimensions untouched", () => {
  const r = QueryEngine.aggregate(model, facts, { rows: ["PERIOD"], columns: ["REGION"], hierarchies: { REGION: "GEO" } });
  assert.strictEqual(r.cell(["2026-01"], ["WORLD"]), 65);
  assert.strictEqual(r.cell(["2026-02"], ["WORLD"]), 1);
  assert.strictEqual(r.colTotal(["EASTERN"]), 51);
  assert.ok(r.colInfo && !r.rowInfo);
});

test("filtering on a node selects its subtree", () => {
  const f = QueryEngine.applyFilters(model, facts, { REGION: ["EASTERN"] });
  assert.deepStrictEqual(f.map((x) => x.Dim1).sort(), ["APAC", "APAC", "EMEA"]);
  assert.strictEqual(QueryEngine.aggregate(model, facts, { rows: [], columns: [], filters: { REGION: ["AMERICAS", "EMEA"] } }).grand, 35);
});

test("charts show one level: depth n plus shallower leaves", () => {
  const r = QueryEngine.aggregate(model, facts, { rows: ["REGION"], columns: [], hierarchies: { REGION: "GEO" } });
  const names = (level) => ChartData.atLevel(r, level).rowKeys.map((k) => k[0]);
  assert.deepStrictEqual(names(1), ["WORLD"]);
  assert.deepStrictEqual(names(2), ["AMERICAS", "EASTERN"]);
  assert.deepStrictEqual(names(3), ["AMER", "LATAM", "EMEA", "APAC"]);
  const donut = ChartData.fromResult("chart.donut", r, "X", 2);
  assert.strictEqual(donut.values.reduce((a, b) => a + b, 0), 66);          // each fact once
});

test("validation: cycles, unknown parents, duplicate members, attribute ids; types get their attributes", () => {
  const bad = Object.assign({}, dim, { Hierarchies: [{ Id: "GEO", Parents: { WORLD: "AMER", AMER: "WORLD", EMEA: "NOPE" } }] });
  const problems = HierarchyEngine.validate(bad);
  assert.ok(problems.some((p) => /cycle/.test(p)));
  assert.ok(problems.some((p) => /parent NOPE/.test(p)));
  assert.deepStrictEqual(HierarchyEngine.validate(dim), []);

  const m = ModelSchema.normalize({ ModelId: "OK", Name: "ok", PeriodFrom: "2026-01", PeriodTo: "2026-12",
    Dimensions: [{ DimId: "ORG", Slot: 1, Type: "ORGANIZATION", Members: [{ Id: "A" }, { Id: "A" }] }], Measures: [{ MeasureId: "M" }] });
  assert.deepStrictEqual(m.Dimensions[0].Attributes.map((a) => a.Id), ["OWNER", "CURRENCY"]);
  assert.ok(ModelSchema.validate(m).some((p) => /unique/.test(p)));
  m.Dimensions[0].Members = [{ Id: "A" }, { Id: "B" }];
  assert.deepStrictEqual(ModelSchema.validate(m), []);
  m.Dimensions[0].Type = "NOPE";
  assert.ok(ModelSchema.normalize(m).Dimensions[0].Type === "GENERIC");        // unknown types fall back
});
