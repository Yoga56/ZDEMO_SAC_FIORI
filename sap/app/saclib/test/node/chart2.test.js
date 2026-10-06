const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");
const Treemap = req("zsac/lib/core/Treemap");
const GeoLocations = req("zsac/lib/core/GeoLocations");
const ChartData = req("zsac/lib/widget/ChartData");
const ChartBuilders = req("zsac/lib/widget/ChartBuilders");

const result = (rows, cols, cells) => ({
  rowKeys: rows.map((r) => [r]), colKeys: cols.map((c) => [c]),
  cell: (r, c) => { const i = rows.indexOf(r[0]); const j = cols.length ? cols.indexOf(c[0]) : 0; return cells[i] ? cells[i][j] : undefined; },
  rowTotal: (r) => (cells[rows.indexOf(r[0])] || []).reduce((s, v) => s + (v || 0), 0)
});

test("treemap: areas are proportional to values, fill the box, stay inside it", () => {
  const items = [{ value: 6 }, { value: 6 }, { value: 4 }, { value: 3 }, { value: 2 }, { value: 2 }, { value: 1 }];
  const rects = Treemap.layout(items, 0, 0, 600, 400);
  assert.strictEqual(rects.length, 7);
  const area = rects.reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(Math.abs(area - 600 * 400) < 1e-6);
  rects.forEach((r) => { assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 600 + 1e-9 && r.y + r.h <= 400 + 1e-9); assert.ok(Math.abs(r.w * r.h - (r.item.value / 24) * 240000) < 1e-6); });
  assert.ok(rects.every((r) => Math.max(r.w / r.h, r.h / r.w) < 4)); // squarified: no slivers
  assert.deepStrictEqual(Treemap.layout([{ value: 0 }, { value: -3 }], 0, 0, 100, 100), []);
  assert.deepStrictEqual(Treemap.layout([{ value: 1 }], 0, 0, 0, 100), []);
});

test("treemap: nested groups keep their children inside the group below the header", () => {
  const groups = [{ label: "A", items: [{ label: "a1", value: 5 }, { label: "a2", value: 3 }] }, { label: "B", items: [{ label: "b1", value: 2 }] }];
  const n = Treemap.nest(groups, 400, 300, 3, 20);
  assert.strictEqual(n.length, 2);
  n.forEach((g) => g.children.forEach((c) => { assert.ok(c.y >= g.y + 20 - 1e-9 && c.x >= g.x + 3 - 1e-9 && c.x + c.w <= g.x + g.w - 3 + 1e-9 && c.y + c.h <= g.y + g.h - 3 + 1e-9); }));
});

test("treemap data: values of zero or less are counted, not drawn", () => {
  const d = ChartData.treemap(result(["A", "B", "C"], [], [[5], [-2], [0]]));
  assert.deepStrictEqual(d.items.map((i) => i.label), ["A"]);
  assert.strictEqual(d.skipped, 1); // the zero is not a loss of information
  assert.match(ChartBuilders.treemap(d, 300, 200), /1 value\(s\) of zero or less left out/);
  assert.match(ChartBuilders.treemap({ groups: [], items: [], skipped: 0 }, 300, 200), /Nothing above zero/);
  const two = ChartData.treemap(result(["EMEA", "APAC"], ["Cloud", "Services"], [[5, 3], [4, 0]]));
  assert.strictEqual(two.groups.length, 2);
  assert.strictEqual(two.groups[1].items.length, 1);
});

test("heatmap: grid with empty cells, colour scale and diverging scale around zero", () => {
  const d = ChartData.heatmap(result(["A", "B"], ["x", "y"], [[1, 9], [undefined, 5]]));
  assert.deepStrictEqual(d.cells, [[1, 9], [null, 5]]);
  assert.strictEqual(d.min, 1); assert.strictEqual(d.max, 9);
  const svg = ChartBuilders.heatmap(d, 400, 200);
  assert.strictEqual((svg.match(/class="zsacHeat"/g) || []).length, 4);
  assert.match(svg, /no data/);
  assert.strictEqual(ChartBuilders.heatColor(1, 1, 9), "#eaf3fc");
  assert.strictEqual(ChartBuilders.heatColor(9, 1, 9), "#0a4a96");
  assert.strictEqual(ChartBuilders.heatColor(0, -5, 5), "#ffffff");
  assert.strictEqual(ChartBuilders.heatColor(-5, -5, 5), "#bb0000");
  assert.strictEqual(ChartBuilders.heatColor(null, 0, 1), "#f5f6f7");
  assert.match(ChartBuilders.heatmap({ rows: [], cols: [], cells: [], min: 0, max: 0 }, 300, 100), /No data/);
});

test("geo locations: countries by name or code, regions, own list wins, unknown stays unplaced", () => {
  assert.deepStrictEqual(GeoLocations.find("DE", "Germany"), { lat: 51.2, lon: 10.4 });
  assert.deepStrictEqual(GeoLocations.find("xx", "United Kingdom"), { lat: 54.0, lon: -2.0 });
  assert.ok(GeoLocations.find("EMEA", "EMEA"));
  assert.strictEqual(GeoLocations.find("ZZZ", "Atlantis"), null);
  const own = GeoLocations.parseList("Atlantis = 31.5, -40\nGermany = 48.1, 11.6\nbad line\nX = 95, 0");
  assert.strictEqual(own.errors.length, 2);
  assert.deepStrictEqual(GeoLocations.find("ZZZ", "Atlantis", own.places), { lat: 31.5, lon: -40 });
  assert.strictEqual(GeoLocations.find("DE", "Germany", own.places).lat, 48.1);
  assert.deepStrictEqual(GeoLocations.project(0, 0, 360, 180), { x: 180, y: 90 });
  assert.deepStrictEqual(GeoLocations.project(90, -180, 360, 180), { x: 0, y: 0 });
});

test("geo map: bubbles for placed members, a note for the others", () => {
  const d = ChartData.geomap(result(["EMEA", "Atlantis"], [], [[10], [3]]), { places: {} });
  assert.strictEqual(d.points.length, 1);
  assert.deepStrictEqual(d.unplaced, ["Atlantis"]);
  const svg = ChartBuilders.geomap(d, 600, 300);
  assert.strictEqual((svg.match(/class="zsacGeoBubble /g) || []).length, 1);
  assert.match(svg, /Not placed: Atlantis/);
  assert.ok((svg.match(/class="zsacGeoLand"/g) || []).length >= 6);
});
