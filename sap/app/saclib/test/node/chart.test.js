const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");
const ChartData = req("zsac/lib/widget/ChartData");
const ChartBuilders = req("zsac/lib/widget/ChartBuilders");

const count = (svg, re) => (svg.match(re) || []).length;

test("waterfall: steps carry the running total and a last total bar", () => {
  const w = ChartData.waterfall({ categories: ["Revenue", "Cost", "Tax"], values: [100, -60, -10] }, true);
  assert.deepStrictEqual(w.steps.map((s) => [s.start, s.end, s.kind]), [[0, 100, "up"], [100, 40, "down"], [40, 30, "down"], [0, 30, "total"]]);
  assert.strictEqual(ChartData.waterfall({ categories: ["A"], values: [5] }, false).steps.length, 1);
  assert.strictEqual(ChartData.waterfall({ categories: [], values: [] }, true).steps.length, 0);
});

test("waterfall: one bar per step, connectors between them, empty data says so", () => {
  const w = ChartData.waterfall({ categories: ["Revenue", "Cost", "Tax"], values: [100, -60, -10] }, true);
  const svg = ChartBuilders.waterfall(w, 400, 240);
  assert.strictEqual(count(svg, /class="zsacWf-(up|down|total)"/g), 4);
  assert.strictEqual(count(svg, /class="zsacWfLink"/g), 3);
  assert.match(svg, /zsacWf-down/);
  assert.match(ChartBuilders.waterfall({ steps: [] }, 400, 240), /No data/);
});

test("stacked bar: one segment per value, a legend, and the axis reaches the stack total", () => {
  const data = { categories: ["A", "B"], series: [{ name: "X", values: [10, 30] }, { name: "Y", values: [5, 0] }], stacked: true };
  const svg = ChartBuilders.bar(data, 400, 240);
  assert.strictEqual(count(svg, /<rect class="zsac-fill-\d"/g), 3 + 2); // 3 segments (a zero value is skipped) and 2 legend swatches
  assert.match(svg, />30</); // the axis reaches the biggest stack (30), not the biggest value alone
});

test("fromResult: bar keeps the stack flag, waterfall honors the total flag", () => {
  const result = { rowKeys: [["A"], ["B"]], colKeys: [], cell: (r) => (r[0] === "A" ? 7 : -3), rowTotal: (r) => (r[0] === "A" ? 7 : -3) };
  assert.strictEqual(ChartData.fromResult("chart.bar", result, "M", 0, { stacked: true }).stacked, true);
  assert.strictEqual(ChartData.fromResult("chart.waterfall", result, "M", 0, { total: true }).steps.length, 3);
  assert.strictEqual(ChartData.fromResult("chart.waterfall", result, "M", 0, { total: false }).steps.length, 2);
});
