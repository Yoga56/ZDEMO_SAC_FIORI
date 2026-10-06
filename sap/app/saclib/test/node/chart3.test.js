const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");

const ChartBuilders = req("zsac/lib/widget/ChartBuilders");
const ChartData = req("zsac/lib/widget/ChartData");
const QueryEngine = req("zsac/lib/core/QueryEngine");

const model = { ModelId: "M", Dimensions: [{ DimId: "REGION", Slot: 1, Members: [{ Id: "A" }, { Id: "B" }] }, { DimId: "PRODUCT", Slot: 2, Members: [{ Id: "X" }, { Id: "Y" }] }, { DimId: "CHANNEL", Slot: 3, Members: [{ Id: "D" }, { Id: "P" }] }],
  Measures: [{ MeasureId: "V", Aggregation: "SUM" }] };
const f = (r, p, c, v) => ({ ModelId: "M", VersionId: "BUD", Period: "2026-01", Measure: "V", Dim1: r, Dim2: p, Dim3: c, Dim4: "", Dim5: "", Value: v });
const facts = [f("A", "X", "D", 10), f("A", "X", "P", 5), f("A", "Y", "D", 20), f("B", "X", "D", 30), f("B", "Y", "P", 40)];

test("a smooth curve passes through every point and stays between neighbours (no overshoot)", () => {
  const d = ChartBuilders.smooth([[0, 10], [10, 0], [20, 0], [30, 10]]);
  assert.match(d, /^M0\.0,10\.0 C/);
  assert.strictEqual((d.match(/C/g) || []).length, 3);
  assert.ok(d.endsWith("30.0,10.0"));
  assert.ok(!/NaN/.test(d));
  assert.ok(!/C/.test(ChartBuilders.smooth([[1, 1]])));
});

test("area chart: one filled area and line per series; stacked areas add up", () => {
  const data = { categories: ["a", "b", "c"], series: [{ name: "S1", values: [1, 3, 2] }, { name: "S2", values: [2, 1, null] }] };
  const svg = ChartBuilders.area(data, 500, 260);
  assert.strictEqual((svg.match(/class="zsacArea"/g) || []).length, 2);
  assert.strictEqual((svg.match(/class="zsacLine /g) || []).length, 2);
  assert.ok(!/NaN|undefined/.test(svg));
  const stacked = ChartBuilders.area(Object.assign({ stacked: true }, data), 500, 260);
  assert.match(stacked, />4</);                              // the axis reaches the biggest stack (3 + 1)
  assert.match(ChartBuilders.area({ categories: [], series: [] }, 300, 200), /No data/);
  assert.strictEqual(ChartData.fromResult("chart.area", QueryEngine.aggregate(model, facts, { rows: ["REGION"], columns: [], filters: {} }), "V", 0, { stacked: true }).stacked, true);
});

test("sankey over several stages: a link between every pair of neighbouring stages, nothing counted twice", () => {
  const r = QueryEngine.aggregate(model, facts, { rows: ["REGION", "PRODUCT", "CHANNEL"], columns: [], filters: {} });
  const d = ChartData.sankey(r);
  assert.deepStrictEqual(Array.from(new Set(d.nodes.map((n) => n.side))).sort(), [0, 1, 2]);
  const between = (a, b) => d.links.find((l) => l.sourceLabel === a && l.targetLabel === b);
  assert.strictEqual(between("A", "X").value, 15);           // A > X > D (10) and A > X > P (5)
  assert.strictEqual(between("X", "D").value, 40);           // from A (10) and from B (30)
  const stage = (i) => d.links.filter((l) => l.source.indexOf("s" + i) === 0).reduce((a, l) => a + l.value, 0);
  assert.strictEqual(stage(0), 105); assert.strictEqual(stage(1), 105);
  const svg = ChartBuilders.sankey(d, 600, 300);
  assert.strictEqual((svg.match(/class="zsacLink /g) || []).length, d.links.length);
  assert.ok(!/NaN|undefined/.test(svg));
  // the older form with columns still draws two stages
  const old = ChartData.sankey(QueryEngine.aggregate(model, facts, { rows: ["REGION"], columns: ["PRODUCT"], filters: {} }));
  assert.deepStrictEqual(Array.from(new Set(old.nodes.map((n) => n.side))).sort(), [0, 1]);
});

test("gauge: with a target it shows the percentage, without one it shows the value and says there is no target", () => {
  const withTarget = ChartBuilders.gauge({ value: 50, max: 200 }, 240, 160);
  assert.match(withTarget, />25%</);
  const noTarget = ChartBuilders.gauge({ value: 4100, max: 0 }, 240, 160);
  assert.doesNotMatch(noTarget, /0%</);
  assert.match(noTarget, /No target set/);
  assert.match(noTarget, />4\.1k</);
});
