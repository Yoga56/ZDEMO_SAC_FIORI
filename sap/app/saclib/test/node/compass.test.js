const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");
const VT = req("zsac/lib/core/ValueTree");
const Compass = req("zsac/lib/core/Compass");

const parse = (t) => { const r = VT.parse(t); assert.deepStrictEqual(r.errors, []); return r.tree; };

test("tree syntax: range, pct and dist describe the uncertainty of a driver", () => {
  const t = parse("T | sum\n  A | leaf | range=10..20; dist=uniform\n  B | leaf | pct=10");
  assert.deepStrictEqual(t.children[0].range, { min: 10, max: 20 });
  assert.strictEqual(t.children[0].dist, "uniform");
  assert.strictEqual(t.children[1].pct, 10);
  const bad = VT.parse("A | leaf | range=20..10").errors.concat(VT.parse("A | leaf | pct=-1").errors, VT.parse("A | leaf | dist=cauchy").errors).join("\n");
  assert.match(bad, /range is MIN..MAX/); assert.match(bad, /pct is a number/); assert.match(bad, /dist must be normal or uniform/);
});

test("drivers: range wins over pct, the scenario's setting wins over the tree's, a blank driver is not active", () => {
  const t = parse("T | sum\n  A | leaf | range=10..20\n  B | leaf | pct=10\n  C | leaf");
  const ds = Compass.drivers(t, { "0.0": 15, "0.1": 100, "0.2": 7 }, { "0.0": { min: 12, max: 14 } });
  assert.deepStrictEqual(ds.map((d) => [d.min, d.max, d.active]), [[12, 14, true], [90, 110, true], [null, null, false]]);
  const off = Compass.drivers(t, { "0.0": 15, "0.1": 100, "0.2": 7 }, { "0.1": { active: false } });
  assert.strictEqual(off[1].active, false);
  assert.strictEqual(Compass.drivers(t, { "0.0": 15, "0.1": 100, "0.2": 7 }, { "0.2": { min: 9, max: 3 } })[2].valid, false); // min above max is flagged, not simulated
});

test("run: same seed gives the same result, a different seed a different one", () => {
  const t = parse("T | sum\n  A | leaf | range=0..100\n  B | leaf | range=0..100");
  const v = { "0.0": 50, "0.1": 50 };
  const a = Compass.run(t, v, { seed: 7, iterations: 2000 }); const b = Compass.run(t, v, { seed: 7, iterations: 2000 }); const c = Compass.run(t, v, { seed: 8, iterations: 2000 });
  assert.strictEqual(a.mean, b.mean); assert.notStrictEqual(a.mean, c.mean);
  assert.deepStrictEqual(Compass.MODES, { preview: 1000, medium: 10000, high: 100000 });
  assert.strictEqual(Compass.run(t, v, { mode: "preview" }).iterations, 1000);
});

test("normal draws: mean in the middle, a sixth of the range as spread, never outside the range", () => {
  const t = parse("T | sum\n  A | leaf | range=10..70");
  const r = Compass.run(t, { "0.0": 40 }, { seed: 3, iterations: 20000 });
  assert.ok(r.min >= 10 && r.max <= 70);
  assert.ok(Math.abs(r.mean - 40) < 0.4);
  assert.ok(r.sd > 9 && r.sd < 10.2, "sd " + r.sd); // 10 for the full normal, a little less once the tails are cut
  const inside = r.probAtLeast(30) - r.probAtLeast(50.0000001);
  assert.ok(inside > 0.66 && inside < 0.70, "within one sd " + inside);
});

test("uniform draws: flat across the range, sd of a uniform", () => {
  const t = parse("T | sum\n  A | leaf | range=0..60; dist=uniform");
  const r = Compass.run(t, { "0.0": 30 }, { seed: 5, iterations: 20000 });
  assert.ok(Math.abs(r.mean - 30) < 0.6);
  assert.ok(Math.abs(r.sd - 60 / Math.sqrt(12)) < 0.5);
  assert.ok(Math.abs(r.quantile(0.25) - 15) < 1);
});

test("the target follows the relations: revenue = price x volume, only volume uncertain", () => {
  const t = parse("Revenue | product\n  Price | leaf\n  Volume | leaf | range=80..120");
  const r = Compass.run(t, { "0.0": 5, "0.1": 100 }, { seed: 1, iterations: 10000 });
  assert.strictEqual(r.baseline, 500);
  assert.ok(Math.abs(r.mean - 500) < 5);
  assert.ok(r.min >= 400 - 1e-9 && r.max <= 600 + 1e-9);
  assert.deepStrictEqual(r.influence.map((i) => i.id), ["0.1"]); // price is not drawn, so it is not a driver of the risk
  assert.strictEqual(r.influence[0].share, 1);
});

test("no uncertainty anywhere: every result is the baseline and it says so", () => {
  const t = parse("T | sum\n  A | leaf\n  B | leaf");
  const r = Compass.run(t, { "0.0": 1, "0.1": 2 }, { iterations: 500 });
  assert.strictEqual(r.noRandomness, true);
  assert.strictEqual(r.min, 3); assert.strictEqual(r.max, 3); assert.strictEqual(r.sd, 0);
  assert.strictEqual(r.probAtLeast(3), 1); assert.strictEqual(r.probAtLeast(3.1), 0);
});

test("cases: default 5 / 90 / 5, boundaries are quantiles, the bad end follows lowerIsBetter", () => {
  const t = parse("T | sum\n  A | leaf | range=0..100; dist=uniform");
  const r = Compass.run(t, { "0.0": 50 }, { seed: 9, iterations: 20000 });
  assert.deepStrictEqual(r.cases.map((c) => c.id), ["pessimistic", "realistic", "optimistic"]);
  assert.deepStrictEqual(r.cases.map((c) => Math.round(c.p * 100)), [5, 90, 5]);
  assert.ok(Math.abs(r.cases[0].to - 5) < 1 && Math.abs(r.cases[1].to - 95) < 1);
  assert.ok(r.cases[0].from === r.min && r.cases[2].to === r.max);
  const wide = Compass.run(t, { "0.0": 50 }, { seed: 9, iterations: 5000, pessimistic: 20, optimistic: 10 });
  assert.deepStrictEqual(wide.cases.map((c) => Math.round(c.p * 100)), [20, 70, 10]);
  assert.deepStrictEqual(Compass.run(t, { "0.0": 50 }, { seed: 9, iterations: 1000, lowerIsBetter: true }).cases.map((c) => c.id), ["optimistic", "realistic", "pessimistic"]);
});

test("histogram: 200 bins that add up to one, the curve is as long", () => {
  const t = parse("T | sum\n  A | leaf | range=0..100");
  const r = Compass.run(t, { "0.0": 50 }, { seed: 2, iterations: 10000 });
  assert.strictEqual(r.bins.length, 200); assert.strictEqual(r.curve.length, 200);
  assert.ok(Math.abs(r.bins.reduce((s, b) => s + b.p, 0) - 1) < 1e-9);
  assert.strictEqual(r.bins[0].from, r.min); assert.ok(Math.abs(r.bins[199].to - r.max) < 1e-9);
});

test("influence: the driver with the wider range explains more of the risk, shares add up to one", () => {
  const t = parse("T | sum\n  Big | leaf | range=0..100\n  Small | leaf | range=0..10\n  Fixed | leaf");
  const r = Compass.run(t, { "0.0": 50, "0.1": 5, "0.2": 9 }, { seed: 4, iterations: 20000 });
  assert.deepStrictEqual(r.influence.map((i) => i.label), ["Big", "Small"]);
  assert.ok(r.influence[0].share > 0.95);
  assert.ok(Math.abs(r.influence.reduce((s, i) => s + i.share, 0) - 1) < 1e-9);
  assert.ok(r.influence[0].r > 0);
  const t2 = parse("T | diff\n  A | leaf | range=0..10\n  B | leaf | range=0..10");
  const r2 = Compass.run(t2, { "0.0": 5, "0.1": 5 }, { seed: 4, iterations: 10000 });
  assert.ok(r2.influence.find((i) => i.label === "B").r < 0); // a driver that is subtracted pulls the target down
});

test("ratio by zero: those iterations are counted as invalid, not turned into numbers", () => {
  const t = parse("T | ratio\n  A | leaf\n  B | leaf | range=0..2; dist=uniform");
  const r = Compass.run(t, { "0.0": 10, "0.1": 1 }, { seed: 6, iterations: 2000 });
  assert.strictEqual(r.n + r.invalid, 2000);
  const none = Compass.run(parse("T | ratio\n  A | leaf\n  B | leaf"), { "0.0": 10, "0.1": 0 }, { iterations: 100 });
  assert.strictEqual(none.n, 0); assert.strictEqual(none.mean, null); assert.strictEqual(none.baseline, null);
});

test("restricted driver: a leaf split by a filter keeps the rest at baseline", () => {
  // Volume Asia = Germany + India; only India is uncertain
  const t = parse("Asia volume | sum\n  Germany | leaf\n  India | leaf | range=1500..2500");
  const r = Compass.run(t, { "0.0": 2500, "0.1": 2000 }, { seed: 11, iterations: 10000 });
  assert.strictEqual(r.baseline, 4500);
  assert.ok(r.min >= 4000 && r.max <= 5000);
});
