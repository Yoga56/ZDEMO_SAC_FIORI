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

  /**
   * @returns {{rowDims, colDims, rowKeys, colKeys, cell(r,c), rowTotal(r), colTotal(c), grand, flat}}
   */
  function aggregate(model, facts, spec) {
    const rowDims = spec.rows || [];
    const colDims = spec.columns || [];
    const rowFields = rowDims.map((d) => fieldOf(model, d));
    const colFields = colDims.map((d) => fieldOf(model, d));
    const kept = applyFilters(model, facts, spec.filters);

    const cells = new Map();
    const rowSet = new Map();
    const colSet = new Map();
    let grand = 0;
    kept.forEach((f) => {
      const rk = keyOf(f, rowFields);
      const ck = keyOf(f, colFields);
      const v = Number(f.Value) || 0;
      cells.set(rk + "|" + ck, (cells.get(rk + "|" + ck) || 0) + v);
      if (!rowSet.has(rk)) { rowSet.set(rk, rowFields.map((x) => String(f[x]))); }
      if (!colSet.has(ck)) { colSet.set(ck, colFields.map((x) => String(f[x]))); }
      grand += v;
    });

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

    const rowTotals = new Map();
    const colTotals = new Map();
    cells.forEach((v, k) => {
      const [rk, ck] = k.split("|");
      rowTotals.set(rk, (rowTotals.get(rk) || 0) + v);
      colTotals.set(ck, (colTotals.get(ck) || 0) + v);
    });

    const flat = [];
    rowKeys.forEach((r) => colKeys.forEach((c) => {
      const v = cells.get(r.join(SEP) + "|" + c.join(SEP));
      if (v === undefined) { return; }
      const row = {};
      rowDims.forEach((d, i) => { row[d] = r[i]; });
      colDims.forEach((d, i) => { row[d] = c[i]; });
      row.Value = v;
      flat.push(row);
    }));

    return {
      rowDims, colDims, rowKeys, colKeys, flat, grand,
      cell: (r, c) => cells.get(r.join(SEP) + "|" + c.join(SEP)),
      rowTotal: (r) => rowTotals.get(r.join(SEP)) || 0,
      colTotal: (c) => colTotals.get(c.join(SEP)) || 0
    };
  }

  return { SEP, BUILTIN, fieldOf, labelOf, applyFilters, distinct, order, aggregate };
});
