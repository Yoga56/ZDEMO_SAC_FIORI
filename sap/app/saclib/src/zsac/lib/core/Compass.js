/**
 * Compass (pure): a Monte Carlo risk simulation, as in SAP Analytics Cloud Compass. The target is a value tree (see ValueTree: the
 * drivers are its leaves, the relations are its operators); every driver may carry an uncertainty (a range and a distribution).
 * Each iteration draws a value for every uncertain driver, calculates the target, and the sorted results give the probability
 * curve, the three cases, the chance of reaching a value and which driver moves the target most.
 *
 *   Compass.drivers(tree, values, settings) -> [{ id, label, baseline, min, max, dist, active }]   settings = { nodeId: { min, max, dist, active, pct } }
 *   Compass.run(tree, values, options) -> result
 *     options  { drivers: settings, mode: "preview"|"medium"|"high" or iterations: n, seed, pessimistic: 5, optimistic: 5, bins: 200, lowerIsBetter }
 *
 * Uncertainty of a driver (the rules of SAC): no range or inactive = the baseline is used, no random draw. normal = mean in the
 * middle of min and max, standard deviation a sixth of the range, a draw outside the range is thrown away and drawn again;
 * uniform = every value of the range equally likely.
 *
 * result = { baseline, n, invalid, noRandomness, min, max, mean, sd, bins: [{ from, to, count, p }], curve: [p], cases: [{ id, label, p, from, to }],
 *            influence: [{ id, label, share, r }], quantile(q), probAtLeast(x) }
 */
sap.ui.define(["./ValueTree"], function (ValueTree) {
  "use strict";

  const MODES = { preview: 1000, medium: 10000, high: 100000 };

  /** Small seeded generator (mulberry32): the same seed gives the same simulation, so a result can be reproduced. */
  function rng(seed) {
    let a = (Number(seed) || 1) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(rand) {
    let u = 0;
    while (u === 0) { u = rand(); }
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  }

  function draw(d, rand) {
    if (d.max === d.min) { return d.min; }
    if (d.dist === "uniform") { return d.min + rand() * (d.max - d.min); }
    const mean = (d.min + d.max) / 2; const sd = (d.max - d.min) / 6;
    for (let i = 0; i < 1000; i++) { const v = mean + sd * gauss(rand); if (v >= d.min && v <= d.max) { return v; } }
    return mean;
  }

  /** The drivers of the target with the uncertainty they carry (the tree's own settings, overridden by `settings`). */
  function drivers(tree, values, settings) {
    return ValueTree.leaves(tree).map((n) => {
      const s = (settings && settings[n.id]) || {};
      const raw = values[n.id];
      const baseline = raw === undefined || raw === null ? null : raw / n.scale;
      let min = s.min !== undefined && s.min !== "" && s.min !== null ? Number(s.min) : (n.range ? n.range.min : null);
      let max = s.max !== undefined && s.max !== "" && s.max !== null ? Number(s.max) : (n.range ? n.range.max : null);
      const pct = s.pct !== undefined && s.pct !== "" && s.pct !== null ? Number(s.pct) : n.pct;
      if ((min === null || max === null) && pct !== null && pct !== undefined && baseline !== null) {
        const delta = Math.abs(baseline) * pct / 100; const lo = baseline - delta; const hi = baseline + delta;
        if (min === null) { min = Math.min(lo, hi); }
        if (max === null) { max = Math.max(lo, hi); }
      }
      const valid = min !== null && max !== null && isFinite(min) && isFinite(max) && min <= max;
      return { id: n.id, label: n.label, baseline, min: valid ? min : (min === null ? null : min), max: valid ? max : (max === null ? null : max),
        dist: s.dist || n.dist || "normal", active: s.active !== false && valid && baseline !== null, valid: valid || (min === null && max === null) };
    });
  }

  /** The tree as a function of the leaf values (an array in the order of ValueTree.leaves): no allocation in the loop. */
  function compile(node, index) {
    if (node.op === "leaf") { const i = index.get(node.id); return (x) => x[i]; }
    const kids = node.children.map((c) => compile(c, index));
    switch (node.op) {
      case "sum": return (x) => { let s = 0; for (let i = 0; i < kids.length; i++) { s += kids[i](x); } return s; };
      case "diff": return (x) => { let s = kids[0](x); for (let i = 1; i < kids.length; i++) { s -= kids[i](x); } return s; };
      case "product": return (x) => { let s = 1; for (let i = 0; i < kids.length; i++) { s *= kids[i](x); } return s; };
      case "ratio": return (x) => { const d = kids[1](x); return d === 0 ? NaN : kids[0](x) / d; };
      default: return () => NaN;
    }
  }

  function quantileOf(sorted, q) {
    if (!sorted.length) { return NaN; }
    const pos = Math.min(1, Math.max(0, q)) * (sorted.length - 1);
    const lo = Math.floor(pos); const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function run(tree, values, options) {
    const opts = options || {};
    const ds = drivers(tree, values, opts.drivers);
    const leaves = ValueTree.leaves(tree);
    const index = new Map(leaves.map((l, i) => [l.id, i]));
    const target = compile(tree, index);
    const base = leaves.map((l, i) => { const d = ds[i]; return d.baseline === null ? NaN : d.baseline; });
    const baseline = target(base);
    const active = ds.map((d, i) => ({ d, i })).filter((x) => x.d.active);
    const n = Math.max(1, Math.floor(opts.iterations || MODES[opts.mode || "medium"] || MODES.medium));
    const rand = rng(opts.seed === undefined ? 12345 : opts.seed);
    const out = new Float64Array(n);
    const k = active.length;
    const sx = new Float64Array(k); const sxx = new Float64Array(k); const sxy = new Float64Array(k);
    let sy = 0; let syy = 0; let count = 0; let invalid = 0;
    const x = base.slice();
    for (let it = 0; it < n; it++) {
      for (let j = 0; j < k; j++) { x[active[j].i] = draw(active[j].d, rand); }
      const y = target(x);
      if (!isFinite(y)) { invalid++; continue; }
      out[count++] = y;
      sy += y; syy += y * y;
      for (let j = 0; j < k; j++) { const v = x[active[j].i]; sx[j] += v; sxx[j] += v * v; sxy[j] += v * y; }
    }
    const sorted = out.slice(0, count).sort();
    const result = { baseline: isFinite(baseline) ? baseline : null, n: count, invalid, noRandomness: k === 0, drivers: ds, iterations: n, seed: opts.seed === undefined ? 12345 : opts.seed };
    result.quantile = (q) => quantileOf(sorted, q);
    result.probAtLeast = (v) => { // share of the results at or above v
      if (!count) { return null; }
      let lo = 0; let hi = count;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) { lo = mid + 1; } else { hi = mid; } }
      return (count - lo) / count;
    };
    if (!count) { return Object.assign(result, { min: null, max: null, mean: null, sd: null, bins: [], curve: [], cases: [], influence: [] }); }
    const mean = sy / count;
    const sd = Math.sqrt(Math.max(0, syy / count - mean * mean));
    const min = sorted[0]; const max = sorted[count - 1];
    const nb = Math.max(1, Math.min(opts.bins || 200, count));
    const width = (max - min) / nb || 1;
    const bins = Array.from({ length: nb }, (_, b) => ({ from: min + b * width, to: min + (b + 1) * width, count: 0, p: 0 }));
    for (let i = 0; i < count; i++) { bins[Math.min(nb - 1, Math.floor((sorted[i] - min) / width))].count++; }
    bins.forEach((b) => { b.p = b.count / count; });
    const win = 2; // the curve is the histogram smoothed over five bins
    const curve = bins.map((b, i) => { let s = 0; let c = 0; for (let j = Math.max(0, i - win); j <= Math.min(nb - 1, i + win); j++) { s += bins[j].p; c++; } return s / c; });
    const pess = (opts.pessimistic === undefined ? 5 : opts.pessimistic) / 100;
    const opt = (opts.optimistic === undefined ? 5 : opts.optimistic) / 100;
    const lowB = quantileOf(sorted, pess); const highB = quantileOf(sorted, 1 - opt);
    const lowerBetter = !!opts.lowerIsBetter; // for a cost the bad end is the high one
    const low = { from: min, to: lowB, p: pess }; const mid = { from: lowB, to: highB, p: 1 - pess - opt }; const high = { from: highB, to: max, p: opt };
    const cases = lowerBetter
      ? [Object.assign({ id: "optimistic", label: "Optimistic case" }, low), Object.assign({ id: "realistic", label: "Realistic case" }, mid), Object.assign({ id: "pessimistic", label: "Pessimistic case" }, high)]
      : [Object.assign({ id: "pessimistic", label: "Pessimistic case" }, low), Object.assign({ id: "realistic", label: "Realistic case" }, mid), Object.assign({ id: "optimistic", label: "Optimistic case" }, high)];
    // which driver moves the target: squared correlation, shared out over the drivers (signed correlation kept for the direction)
    const varY = syy / count - mean * mean;
    const raw = active.map((a, j) => {
      const mx = sx[j] / count; const varX = sxx[j] / count - mx * mx;
      const cov = sxy[j] / count - mx * mean;
      const r = varX > 1e-12 && varY > 1e-12 ? cov / Math.sqrt(varX * varY) : 0;
      return { id: a.d.id, label: a.d.label, r, r2: r * r };
    });
    const tot = raw.reduce((s, r) => s + r.r2, 0);
    const influence = raw.map((r) => ({ id: r.id, label: r.label, r: r.r, share: tot ? r.r2 / tot : 0 })).sort((a, b) => b.share - a.share);
    return Object.assign(result, { min, max, mean, sd, bins, curve, cases, influence });
  }

  return { run, drivers, MODES, rng };
});
