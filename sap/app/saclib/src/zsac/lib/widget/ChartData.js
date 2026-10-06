/** Shapes an aggregate query result into the data each chart builder expects (pure). */
sap.ui.define(["../core/QueryEngine", "../core/GeoLocations"], function (QueryEngine, GeoLocations) {
  "use strict";

  const label = (key) => key.join(" / ");

  function categoriesAndSeries(result, measureLabel) {
    const categories = result.rowKeys.map(label);
    const cols = result.colKeys.length ? result.colKeys : [[]];
    const series = cols.map((c) => ({
      name: c.length ? label(c) : (measureLabel || "Value"),
      values: result.rowKeys.map((r) => { const v = result.cell(r, c); return v === undefined ? null : v; })
    }));
    return { categories, series };
  }

  function categoriesAndTotals(result) {
    return { categories: result.rowKeys.map(label), values: result.rowKeys.map((r) => result.rowTotal(r)) };
  }

  function sankey(result) {
    const rowLabel = (r) => "r:" + label(r);
    const colLabel = (c) => "c:" + label(c);
    const nodes = result.rowKeys.map((r) => ({ id: rowLabel(r), label: label(r), side: 0 }))
      .concat(result.colKeys.map((c) => ({ id: colLabel(c), label: label(c), side: 1 })));
    const links = [];
    result.rowKeys.forEach((r) => result.colKeys.forEach((c) => {
      const v = result.cell(r, c);
      if (v) { links.push({ source: rowLabel(r), target: colLabel(c), value: v, sourceLabel: label(r), targetLabel: label(c) }); }
    }));
    return { nodes, links };
  }

  /**
   * With a hierarchy on an axis a chart shows one level: nodes at depth `level`, plus leaves that sit higher up so that every
   * member of the subtree is counted once (level 1 = the top nodes).
   */
  function atLevel(result, level) {
    const pick = (keys, info) => (info ? keys.filter((k) => { const i = info(k); return i.depth === level || (i.depth < level && !i.hasChildren); }) : keys);
    return Object.assign({}, result, { rowKeys: pick(result.rowKeys, result.rowInfo), colKeys: pick(result.colKeys, result.colInfo) });
  }

  /**
   * Waterfall steps from category totals: every category moves the running total, an optional last bar shows the total.
   * step = { label, start, end, delta, kind: "up" | "down" | "total" }
   */
  function waterfall(totals, withTotal) {
    let run = 0;
    const steps = totals.categories.map((c, i) => {
      const delta = totals.values[i] || 0;
      const step = { label: c, start: run, end: run + delta, delta, kind: delta < 0 ? "down" : "up" };
      run += delta;
      return step;
    });
    if (withTotal !== false && steps.length) { steps.push({ label: "Total", start: 0, end: run, delta: run, kind: "total" }); }
    return { steps };
  }

  /** Rows by columns as a grid; a cell without data stays null so it can be drawn empty. */
  function heatmap(result) {
    const rows = result.rowKeys.map(label);
    const cols = (result.colKeys.length ? result.colKeys : [[]]).map(label);
    const cells = result.rowKeys.map((r) => (result.colKeys.length ? result.colKeys : [[]]).map((c) => { const v = result.cell(r, c); return v === undefined ? null : v; }));
    const all = [].concat.apply([], cells).filter((v) => v !== null);
    return { rows, cols, cells, min: all.length ? Math.min.apply(null, all) : 0, max: all.length ? Math.max.apply(null, all) : 0 };
  }

  /**
   * One level (rows only) or two (rows are the groups, columns the members of a group). Values of zero or less have no area
   * in a treemap; how many were left out is reported so the chart does not hide it.
   */
  function treemap(result) {
    let skipped = 0;
    const keep = (label_, v) => { if (v > 0) { return { label: label_, value: v }; } if (v) { skipped++; } return null; };
    if (!result.colKeys.length) {
      return { groups: [], items: result.rowKeys.map((r) => keep(label(r), result.rowTotal(r))).filter(Boolean), skipped };
    }
    const groups = result.rowKeys.map((r) => ({ label: label(r), items: result.colKeys.map((c) => keep(label(c), result.cell(r, c))).filter(Boolean) })).filter((g) => g.items.length);
    return { groups, items: [], skipped };
  }

  /** Bubbles at the place of each member; members that cannot be placed are listed. places = own list (see GeoLocations.parseList). */
  function geomap(result, options) {
    const own = options && options.places;
    const points = []; const unplaced = [];
    result.rowKeys.forEach((r) => {
      const v = result.rowTotal(r);
      const at = GeoLocations.find(r[0], label(r), own);
      if (at) { points.push({ label: label(r), value: v || 0, lat: at.lat, lon: at.lon }); } else { unplaced.push(label(r)); }
    });
    return { points, unplaced };
  }

  function fromResult(type, result, measureLabel, level, options) {
    if (level && (result.rowInfo || result.colInfo)) { result = atLevel(result, level); }
    switch (type) {
      case "chart.bar": { const d = categoriesAndSeries(result, measureLabel); d.stacked = !!(options && options.stacked); return d; }
      case "chart.line": return categoriesAndSeries(result, measureLabel);
      case "chart.waterfall": return waterfall(categoriesAndTotals(result), !options || options.total !== false);
      case "chart.donut": case "chart.funnel": return categoriesAndTotals(result);
      case "chart.sankey": return sankey(result);
      case "chart.heatmap": return heatmap(result);
      case "chart.treemap": return treemap(result);
      case "chart.geomap": return geomap(result, options);
      default: throw new Error("No chart data shape for " + type);
    }
  }

  return { fromResult, waterfall, heatmap, treemap, geomap, atLevel, categoriesAndSeries, categoriesAndTotals, sankey, QueryEngine };
});
