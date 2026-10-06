const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");

const GridView = req("zsac/lib/planning/GridView");

test("normalize fills every property and drops what makes no sense", () => {
  const d = GridView.normalize(null);
  assert.deepStrictEqual(d, { suppressZero: false, scale: 1, decimals: -1, sort: null, thresholds: [], variance: null, swap: false });
  assert.ok(GridView.isDefault({}));
  const n = GridView.normalize({ scale: 7, decimals: "2", sort: { col: ["2026-01"], dir: "up" }, variance: { vs: "ACT", mode: "x" },
    thresholds: [{ Op: "<", Value: "0", Level: "BAD" }, { Op: "??", Value: 1, Level: "BAD" }, { Op: "between", Value: 1, Level: "GOOD" }, { Op: "between", Value: 1, Value2: 5, Level: "GOOD" }] });
  assert.strictEqual(n.scale, 1);
  assert.strictEqual(n.decimals, 2);
  assert.strictEqual(n.sort, null);
  assert.deepStrictEqual(n.variance, { vs: "ACT", mode: "ABS" });
  assert.strictEqual(n.thresholds.length, 2);
  assert.strictEqual(GridView.normalize({ decimals: 0 }).decimals, 0);
  assert.strictEqual(GridView.isDefault({ scale: 1000 }), false);
});

test("sorting rows: flat, descending, missing values last", () => {
  const rows = [["a"], ["b"], ["c"], ["d"]];
  const v = { a: 5, b: 9, c: undefined, d: 1 };
  const by = (k) => v[k[0]];
  assert.deepStrictEqual(GridView.sortRows(rows, null, by, "asc").map((k) => k[0]), ["d", "a", "b", "c"]);
  assert.deepStrictEqual(GridView.sortRows(rows, null, by, "desc").map((k) => k[0]), ["b", "a", "d", "c"]);
});

test("sorting a hierarchy keeps children below their parent and sorts the siblings", () => {
  const parent = { n1: null, n2: null, c1: ["n1"], c2: ["n1"], c3: ["n2"], c4: ["n2"] };
  const info = (k) => ({ parent: parent[k[0]] });
  const val = { n1: 10, n2: 30, c1: 4, c2: 6, c3: 10, c4: 20 };
  const out = GridView.sortRows([["n1"], ["c1"], ["c2"], ["n2"], ["c3"], ["c4"]], info, (k) => val[k[0]], "desc").map((k) => k[0]);
  assert.deepStrictEqual(out, ["n2", "c4", "c3", "n1", "c2", "c1"]);
});

test("suppress zero rows; scaling; thresholds; variance; description", () => {
  const vals = { a: [0, 0], b: [0, 3], c: [undefined, undefined], d: [-2, 0] };
  assert.deepStrictEqual(GridView.suppress([["a"], ["b"], ["c"], ["d"]], (k) => vals[k[0]]).map((k) => k[0]), ["b", "d"]);
  assert.strictEqual(GridView.scaled(2500, 1000), 2.5);
  assert.strictEqual(GridView.scaled(undefined, 1000), undefined);
  assert.strictEqual(GridView.suffix(1000000), "M");
  const rules = GridView.normalize({ thresholds: [{ Op: "<", Value: 0, Level: "BAD" }, { Op: "between", Value: 0, Value2: 10, Level: "CRITICAL" }, { Op: ">=", Value: 100, Level: "GOOD" }] }).thresholds;
  assert.deepStrictEqual([-1, 5, 50, 100, undefined].map((x) => GridView.level(rules, x)), ["BAD", "CRITICAL", "", "GOOD", ""]);
  assert.deepStrictEqual(GridView.variance(120, 100), { abs: 20, pct: 20, mode: undefined });
  assert.strictEqual(GridView.variance(5, 0).pct, null);
  assert.strictEqual(GridView.variance(undefined, 8).abs, -8);
  assert.strictEqual(GridView.describe({ suppressZero: true, scale: 1000, variance: { vs: "ACT" }, swap: true }), "zero rows hidden, in thousands, variance to ACT, rows and columns swapped");
  assert.strictEqual(GridView.describe({}), "");
});

test("thresholds as text for the builder panel", () => {
  const list = GridView.parseThresholds("< 0 : bad; 0..10 : Critical\n>= 100 : good; nonsense; > x : good");
  assert.deepStrictEqual(list, [{ Op: "<", Value: 0, Level: "BAD" }, { Op: "between", Value: 0, Value2: 10, Level: "CRITICAL" }, { Op: ">=", Value: 100, Level: "GOOD" }]);
  assert.strictEqual(GridView.formatThresholds(list), "< 0 : bad; 0..10 : critical; >= 100 : good");
  assert.deepStrictEqual(GridView.parseThresholds(GridView.formatThresholds(list)), list);
});
