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

  function fromResult(type, result, measureLabel, level) {
    if (level && (result.rowInfo || result.colInfo)) { result = atLevel(result, level); }
    switch (type) {
      case "chart.bar": case "chart.line": return categoriesAndSeries(result, measureLabel);
      case "chart.donut": case "chart.funnel": return categoriesAndTotals(result);
      case "chart.sankey": return sankey(result);
      default: throw new Error("No chart data shape for " + type);
    }
  }

  return { fromResult, atLevel, categoriesAndSeries, categoriesAndTotals, sankey, QueryEngine };
});
