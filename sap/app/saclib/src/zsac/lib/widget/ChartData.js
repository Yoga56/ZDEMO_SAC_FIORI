/** Shapes an aggregate query result into the data each chart builder expects (pure). */
sap.ui.define(["../core/QueryEngine"], function (QueryEngine) {
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

  function fromResult(type, result, measureLabel, level, options) {
    if (level && (result.rowInfo || result.colInfo)) { result = atLevel(result, level); }
    switch (type) {
      case "chart.bar": { const d = categoriesAndSeries(result, measureLabel); d.stacked = !!(options && options.stacked); return d; }
      case "chart.line": return categoriesAndSeries(result, measureLabel);
      case "chart.waterfall": return waterfall(categoriesAndTotals(result), !options || options.total !== false);
      case "chart.donut": case "chart.funnel": return categoriesAndTotals(result);
      case "chart.sankey": return sankey(result);
      default: throw new Error("No chart data shape for " + type);
    }
  }

  return { fromResult, waterfall, atLevel, categoriesAndSeries, categoriesAndTotals, sankey, QueryEngine };
});
