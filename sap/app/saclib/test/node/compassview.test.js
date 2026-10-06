const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");
const VT = req("zsac/lib/core/ValueTree");
const Compass = req("zsac/lib/core/Compass");
const View = req("zsac/lib/widget/CompassView");

const t2 = VT.parse("T | sum\n  Big | leaf | range=0..100\n  Small | leaf | range=0..10; dist=uniform").tree;
const values = { "0.0": 50, "0.1": 5 };
const r = Compass.run(t2, values, { seed: 1, iterations: 5000 });

test("compass chart: a coloured area per case, bounds, baseline and a curve", () => {
  const svg = View.chartSvg([{ name: "Base", result: r }], { w: 600, h: 240 });
  ["pessimistic", "realistic", "optimistic"].forEach((c) => assert.match(svg, new RegExp('class="zsacCp zsacCp-' + c + '"')));
  assert.strictEqual((svg.match(/class="zsacCpBound"/g) || []).length, 2);
  assert.match(svg, /class="zsacCpBase"/);
  assert.strictEqual((svg.match(/class="zsacCpCurve"/g) || []).length, 1);
  assert.ok(!/NaN|undefined/.test(svg));
});

test("compass chart: a second scenario is a dashed curve and a legend", () => {
  const other = Compass.run(t2, values, { seed: 2, iterations: 5000, drivers: { "0.0": { min: 20, max: 60 } } });
  const svg = View.chartSvg([{ name: "Base", result: r }, { name: "Cautious", result: other }], { w: 600, h: 240 });
  assert.match(svg, /zsacCpOther zsacCpOther0/);
  assert.match(svg, />Cautious</);
  assert.ok(!/NaN|undefined/.test(svg));
});

test("compass chart: no valid result says so instead of drawing nothing", () => {
  const none = Compass.run(VT.parse("T | ratio\n  A | leaf\n  B | leaf").tree, { "0.0": 1, "0.1": 0 }, { iterations: 10 });
  assert.match(View.chartSvg([{ name: "x", result: none }]), /no valid result/);
  assert.match(View.statsHtml(none, ""), /Every iteration was invalid/);
});

test("compass numbers: baseline, chance of reaching it, a threshold, and a hint when nothing is uncertain", () => {
  const html = View.statsHtml(r, "", 60);
  assert.match(html, /Baseline/); assert.match(html, /Chance of reaching the baseline or more/); assert.match(html, /Chance of reaching 60 or more/);
  const flat = Compass.run(VT.parse("T | sum\n  A | leaf").tree, { "0.0": 3 }, { iterations: 100 });
  assert.match(View.statsHtml(flat, ""), /No driver has a range/);
  assert.strictEqual(View.pct(0.05), "5.0%"); assert.strictEqual(View.pct(0.9), "90%"); assert.strictEqual(View.pct(0), "0%");
});

test("compass tables: cases, influence and driver inputs", () => {
  assert.strictEqual((View.casesHtml(r, "").match(/<tr><td><span/g) || []).length, 3);
  assert.match(View.influenceHtml(r), /Big/);
  const html = View.driversHtml(Compass.drivers(t2, values, {}), { "0.0": { active: false } }, "");
  assert.strictEqual((html.match(/data-f="min"/g) || []).length, 2);
  assert.strictEqual((html.match(/data-f="active" checked/g) || []).length, 1); // the first driver is switched off
  assert.match(html, /<option value="uniform" selected>/);
  assert.match(View.driversHtml(Compass.drivers(t2, values, { "0.0": {} }), {}, ""), /Driver/);
});

test("compass drivers table: a range worked out from a percentage is shown without float noise", () => {
  const t = VT.parse("T | sum\n  A | leaf | pct=15").tree;
  const html = View.driversHtml(Compass.drivers(t, { "0.0": 68341.12345678 }, {}), {}, "");
  assert.match(html, /data-f="min" value="58089\.95"/);
  assert.ok(!/\d{9,}/.test(html.replace(/data-d="[^"]*"/g, "")));
});
