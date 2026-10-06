/**
 * How a planning table shows its numbers (pure): the table functions of SAC's planning table. They change the view, never the data.
 *
 *   view = { suppressZero, scale, decimals, sort: { col: [member path of a column], dir: "asc" | "desc" } | null,
 *            thresholds: [{ Op, Value, Value2, Level }], variance: { vs: versionId, mode: "ABS" | "PCT" | "BOTH" } | null, swap }
 *
 *   GridView.normalize(view)                           every property filled, bad values dropped
 *   GridView.isDefault(view)                           nothing changed
 *   GridView.sortRows(rowKeys, info, valueOf, dir)     rows ordered by a value, siblings of a hierarchy kept under their parent
 *   GridView.suppress(rowKeys, valuesOf)               rows that have a number other than zero
 *   GridView.scaled(value, scale) / GridView.suffix(scale)
 *   GridView.level(thresholds, value)                  GOOD | CRITICAL | BAD | "" for a displayed value
 *   GridView.variance(current, reference, mode)        { abs, pct } (pct is null without a reference to divide by)
 *   GridView.describe(view)                            short text for the table's status line
 *   GridView.parseThresholds(text) / formatThresholds(list)   "< 0 : bad; 0..10 : critical; >= 100 : good" (for the builder panel)
 */
sap.ui.define([], function () {
  "use strict";

  const SCALES = { 1: "", 1000: "K", 1000000: "M", 1000000000: "B" };
  const OPS = { "<": "below", "<=": "at most", ">": "above", ">=": "at least", "=": "equal to", between: "between" };
  const LEVELS = { GOOD: "Good", CRITICAL: "Critical", BAD: "Bad" };
  const MODES = { ABS: "Absolute", PCT: "Percent", BOTH: "Absolute and percent" };
  const SEP = "\u0001";

  function normalize(view) {
    const v = view || {};
    const rules = (Array.isArray(v.thresholds) ? v.thresholds : []).filter((t) => OPS[t.Op] && LEVELS[t.Level] && Number.isFinite(Number(t.Value)) && (t.Op !== "between" || Number.isFinite(Number(t.Value2))))
      .map((t) => ({ Op: t.Op, Value: Number(t.Value), Value2: t.Op === "between" ? Number(t.Value2) : undefined, Level: t.Level }));
    return {
      suppressZero: !!v.suppressZero,
      scale: SCALES[v.scale] !== undefined ? Number(v.scale) : 1,
      decimals: v.decimals === "" || v.decimals === null || v.decimals === undefined || !Number.isInteger(Number(v.decimals)) || Number(v.decimals) < 0 ? -1 : Number(v.decimals),
      sort: v.sort && Array.isArray(v.sort.col) && (v.sort.dir === "asc" || v.sort.dir === "desc") ? { col: v.sort.col.map(String), dir: v.sort.dir } : null,
      thresholds: rules,
      variance: v.variance && v.variance.vs ? { vs: String(v.variance.vs), mode: MODES[v.variance.mode] ? v.variance.mode : "ABS" } : null,
      swap: !!v.swap
    };
  }

  function isDefault(view) {
    const n = normalize(view);
    return !n.suppressZero && n.scale === 1 && n.decimals === -1 && !n.sort && !n.thresholds.length && !n.variance && !n.swap;
  }

  /**
   * Orders rows by `valueOf(rowKey)`. With a hierarchy (info(rowKey).parent is the parent's key) the children of a node are sorted among
   * themselves and stay below it; rows without a value go last whatever the direction.
   */
  function sortRows(rowKeys, info, valueOf, dir) {
    const sign = dir === "desc" ? -1 : 1;
    const cmp = (a, b) => {
      const x = valueOf(a); const y = valueOf(b);
      const nx = x === undefined || x === null; const ny = y === undefined || y === null;
      if (nx || ny) { return nx === ny ? 0 : nx ? 1 : -1; }
      return (x - y) * sign;
    };
    if (!info) { return rowKeys.slice().sort(cmp); }
    const kids = new Map();
    const roots = [];
    rowKeys.forEach((k) => {
      const p = info(k).parent;
      if (!p) { roots.push(k); return; }
      const ps = p.join(SEP);
      if (!kids.has(ps)) { kids.set(ps, []); }
      kids.get(ps).push(k);
    });
    const out = [];
    const walk = (list) => list.slice().sort(cmp).forEach((k) => { out.push(k); walk(kids.get(k.join(SEP)) || []); });
    walk(roots);
    return out;
  }

  /** Rows with at least one value that is not zero. valuesOf(rowKey) -> the numbers of the row (undefined for no value). */
  function suppress(rowKeys, valuesOf) {
    return rowKeys.filter((k) => valuesOf(k).some((v) => v !== undefined && v !== null && Math.abs(v) > 1e-9));
  }

  const scaled = (value, scale) => (value === undefined || value === null ? value : value / (scale || 1));
  const suffix = (scale) => SCALES[scale] || "";

  function level(thresholds, value) {
    if (value === undefined || value === null || !Number.isFinite(value)) { return ""; }
    for (const t of thresholds || []) {
      const hit = t.Op === "<" ? value < t.Value : t.Op === "<=" ? value <= t.Value : t.Op === ">" ? value > t.Value : t.Op === ">=" ? value >= t.Value
        : t.Op === "=" ? value === t.Value : value >= Math.min(t.Value, t.Value2) && value <= Math.max(t.Value, t.Value2);
      if (hit) { return t.Level; }
    }
    return "";
  }

  function variance(current, reference, mode) {
    if (current === undefined || current === null) { return { abs: reference === undefined || reference === null ? null : -reference, pct: null }; }
    const ref = reference === undefined || reference === null ? 0 : reference;
    const abs = current - ref;
    return { abs, pct: ref ? abs / Math.abs(ref) * 100 : null, mode };
  }

  function describe(view) {
    const n = normalize(view);
    const parts = [];
    if (n.suppressZero) { parts.push("zero rows hidden"); }
    if (n.sort) { parts.push("sorted " + (n.sort.dir === "asc" ? "ascending" : "descending") + " by " + n.sort.col.join(" / ")); }
    if (n.scale !== 1) { parts.push("in " + (suffix(n.scale) === "K" ? "thousands" : suffix(n.scale) === "M" ? "millions" : "billions")); }
    if (n.variance) { parts.push("variance to " + n.variance.vs); }
    if (n.thresholds.length) { parts.push(n.thresholds.length + (n.thresholds.length === 1 ? " threshold" : " thresholds")); }
    if (n.swap) { parts.push("rows and columns swapped"); }
    return parts.join(", ");
  }

  /** "< 0 : bad; 0..10 : critical; >= 100 : good" -> rules; entries that cannot be read are left out. */
  function parseThresholds(text) {
    const out = [];
    String(text || "").split(/[;\n]/).forEach((part) => {
      const m = /^\s*(?:(<=|>=|<|>|=)\s*(-?\d+(?:\.\d+)?)|(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?))\s*:\s*(good|critical|bad)\s*$/i.exec(part);
      if (!m) { return; }
      const Level = m[5].toUpperCase();
      out.push(m[1] ? { Op: m[1], Value: Number(m[2]), Level } : { Op: "between", Value: Number(m[3]), Value2: Number(m[4]), Level });
    });
    return out;
  }

  function formatThresholds(list) {
    return (list || []).map((t) => (t.Op === "between" ? t.Value + ".." + t.Value2 : t.Op + " " + t.Value) + " : " + t.Level.toLowerCase()).join("; ");
  }

  return { parseThresholds, formatThresholds, SCALES, OPS, LEVELS, MODES, normalize, isDefault, sortRows, suppress, scaled, suffix, level, variance, describe };
});
