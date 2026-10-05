/**
 * Pure aggregation engine shared by every data provider.
 *
 * Facts are flat rows {ModelId, VersionId, Period, Measure, Dim1..Dim5, Value}. A model maps dimension
 * ids (REGION, PRODUCT ...) to the slot fields Dim1..Dim5; VERSION, PERIOD and MEASURE are built in.
 *
 * spec = { rows: [dimId], columns: [dimId], filters: { dimId: [members] } }
 */
sap.ui.define([], function () {
  "use strict";

  const SEP = "\u0001";
  const BUILTIN = { VERSION: "VersionId", PERIOD: "Period", MEASURE: "Measure" };

  function fieldOf(model, dimId) {
    if (BUILTIN[dimId]) { return BUILTIN[dimId]; }
    const dim = ((model && model.Dimensions) || []).find((d) => d.DimId === dimId);
    if (!dim) { throw new Error("Unknown dimension " + dimId); }
    return "Dim" + dim.Slot;
  }

  function labelOf(model, dimId) {
    if (dimId === "VERSION") { return "Version"; }
    if (dimId === "PERIOD") { return "Period"; }
    if (dimId === "MEASURE") { return "Measure"; }
    const dim = ((model && model.Dimensions) || []).find((d) => d.DimId === dimId);
    return dim ? (dim.Label || dim.DimId) : dimId;
  }

  /** Rows that pass every filter (a dimension with an empty or missing list passes everything). */
  function applyFilters(model, facts, filters) {
    const active = Object.keys(filters || {}).filter((k) => filters[k] && filters[k].length);
    if (!active.length) { return facts.slice(); }
    const checks = active.map((dimId) => [fieldOf(model, dimId), new Set(filters[dimId].map(String))]);
    return facts.filter((f) => checks.every(([field, set]) => set.has(String(f[field]))));
  }

  function distinct(model, facts, dimId) {
    const field = fieldOf(model, dimId);
    const seen = new Set();
    facts.forEach((f) => seen.add(String(f[field])));
    return order(model, dimId, Array.from(seen));
  }

  /** Model master data order first (keeps the order the modeller defined), then alphabetical. */
  function order(model, dimId, members) {
    const dim = ((model && model.Dimensions) || []).find((d) => d.DimId === dimId);
    const known = dim && dim.Members ? dim.Members.map((m) => (typeof m === "string" ? m : m.Id)) : [];
    return members.sort((a, b) => {
      const ia = known.indexOf(a);
      const ib = known.indexOf(b);
      if (ia >= 0 && ib >= 0) { return ia - ib; }
      if (ia >= 0) { return -1; }
      if (ib >= 0) { return 1; }
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  function keyOf(f, fields) { return fields.map((x) => f[x]).join(SEP); }

  const FACT_FIELDS = ["VersionId", "Period", "Measure", "Dim1", "Dim2", "Dim3", "Dim4", "Dim5"];

  function reduce(type, values) {
    if (!values.length) { return 0; }
    switch (type) {
      case "AVG": return values.reduce((a, b) => a + b, 0) / values.length;
      case "MIN": return Math.min.apply(null, values);
      case "MAX": return Math.max.apply(null, values);
      case "COUNT": return values.length;
      default: return values.reduce((a, b) => a + b, 0);
    }
  }

  /**
   * Value of a group of facts. Per measure: with an exception aggregation the facts are first reduced along the
   * exception dimensions (everything else stays as it is), then the standard aggregation runs over the results.
   * Groups holding several measures add the per-measure values.
   */
  function valueOf(model, facts) {
    const byMeasure = new Map();
    facts.forEach((f) => { (byMeasure.get(f.Measure) || byMeasure.set(f.Measure, []).get(f.Measure)).push(f); });
    let total = 0;
    byMeasure.forEach((list, id) => {
      const spec = ((model && model.Measures) || []).find((m) => m.MeasureId === id) || {};
      const agg = spec.Aggregation || "SUM";
      if (spec.ExceptionAggregation && (spec.ExceptionDims || []).length) {
        const drop = new Set(spec.ExceptionDims.map((d) => fieldOf(model, d)));
        const keep = FACT_FIELDS.filter((x) => !drop.has(x));
        const groups = new Map();
        list.forEach((f) => { const k = keyOf(f, keep); (groups.get(k) || groups.set(k, []).get(k)).push(Number(f.Value) || 0); });
        total += reduce(agg, Array.from(groups.values()).map((v) => reduce(spec.ExceptionAggregation, v)));
      } else {
        total += reduce(agg, list.map((f) => Number(f.Value) || 0));
      }
    });
    return total;
  }

  /**
   * @returns {{rowDims, colDims, rowKeys, colKeys, cell(r,c), rowTotal(r), colTotal(c), grand, flat, measure}}
   * `measure` is the measure definition when the result holds exactly one measure, else null (formatting hint).
   */
  function aggregate(model, facts, spec) {
    const rowDims = spec.rows || [];
    const colDims = spec.columns || [];
    const rowFields = rowDims.map((d) => fieldOf(model, d));
    const colFields = colDims.map((d) => fieldOf(model, d));
    const kept = applyFilters(model, facts, spec.filters);

    const cells = new Map();
    const rowGroups = new Map();
    const colGroups = new Map();
    const rowSet = new Map();
    const colSet = new Map();
    const measures = new Set();
    kept.forEach((f) => {
      const rk = keyOf(f, rowFields);
      const ck = keyOf(f, colFields);
      (cells.get(rk + "|" + ck) || cells.set(rk + "|" + ck, []).get(rk + "|" + ck)).push(f);
      (rowGroups.get(rk) || rowGroups.set(rk, []).get(rk)).push(f);
      (colGroups.get(ck) || colGroups.set(ck, []).get(ck)).push(f);
      if (!rowSet.has(rk)) { rowSet.set(rk, rowFields.map((x) => String(f[x]))); }
      if (!colSet.has(ck)) { colSet.set(ck, colFields.map((x) => String(f[x]))); }
      measures.add(f.Measure);
    });

    const values = new Map();
    cells.forEach((list, k) => values.set(k, valueOf(model, list)));
    const rowTotals = new Map();
    rowGroups.forEach((list, k) => rowTotals.set(k, valueOf(model, list)));
    const colTotals = new Map();
    colGroups.forEach((list, k) => colTotals.set(k, valueOf(model, list)));
    const grand = valueOf(model, kept);

    const cmp = (dims) => (a, b) => {
      for (let i = 0; i < dims.length; i++) {
        if (a[i] === b[i]) { continue; }
        const o = order(model, dims[i], [a[i], b[i]]);
        return o[0] === a[i] ? -1 : 1;
      }
      return 0;
    };
    const rowKeys = Array.from(rowSet.values()).sort(cmp(rowDims));
    const colKeys = Array.from(colSet.values()).sort(cmp(colDims));

    const flat = [];
    rowKeys.forEach((r) => colKeys.forEach((c) => {
      const v = values.get(r.join(SEP) + "|" + c.join(SEP));
      if (v === undefined) { return; }
      const row = {};
      rowDims.forEach((d, i) => { row[d] = r[i]; });
      colDims.forEach((d, i) => { row[d] = c[i]; });
      row.Value = v;
      flat.push(row);
    }));

    const single = measures.size === 1 ? ((model && model.Measures) || []).find((m) => m.MeasureId === Array.from(measures)[0]) || null : null;
    return {
      rowDims, colDims, rowKeys, colKeys, flat, grand, measure: single,
      cell: (r, c) => values.get(r.join(SEP) + "|" + c.join(SEP)),
      rowTotal: (r) => rowTotals.get(r.join(SEP)) || 0,
      colTotal: (c) => colTotals.get(c.join(SEP)) || 0
    };
  }

  return { SEP, BUILTIN, fieldOf, labelOf, applyFilters, distinct, order, aggregate, reduce };
});
