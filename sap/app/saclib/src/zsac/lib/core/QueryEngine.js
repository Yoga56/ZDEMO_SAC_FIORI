/**
 * Pure aggregation engine shared by every data provider.
 *
 * Facts are flat rows {ModelId, VersionId, Period, Measure, Dim1..Dim5, Value}. A model maps dimension
 * ids (REGION, PRODUCT ...) to the slot fields Dim1..Dim5; VERSION, PERIOD and MEASURE are built in.
 *
 * spec = { rows: [dimId], columns: [dimId], filters: { dimId: [members] }, hierarchies: { dimId: hierarchyId } }
 *
 * A dimension listed in `hierarchies` is expanded to the nodes of that hierarchy: every fact counts for its own member and for each
 * ancestor, so a parent node holds the total of its subtree. Grand and axis totals still count every fact once.
 */
sap.ui.define(["./HierarchyEngine"], function (HierarchyEngine) {
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

  /** Months of the model plus any period the facts carry, so no fact falls out of the Date hierarchy. */
  function periodList(model, facts) {
    const set = new Set(HierarchyEngine.monthRange(model && model.PeriodFrom, model && model.PeriodTo));
    facts.forEach((f) => set.add(f.Period));
    return Array.from(set);
  }

  /** Filters with every hierarchy node (and year or quarter) replaced by its whole subtree, for providers that filter by plain members. */
  function expandFilters(model, filters) {
    const out = {};
    Object.keys(filters || {}).forEach((dimId) => {
      const members = (filters[dimId] || []).map(String);
      if (!members.length) { return; }
      const set = new Set(members);
      if (dimId === "PERIOD") {
        const time = HierarchyEngine.buildTime(periodList(model, []));
        members.forEach((id) => time.descendants(id).forEach((x) => set.add(x)));
        // a node is not a stored period: keep only months, plus ids that are not nodes at all
        out[dimId] = Array.from(set).filter((id) => !/^\d{4}$|^\d{4}-Q[1-4]$/.test(id) || !time.children(id).length);
        return;
      }
      const dim = ((model && model.Dimensions) || []).find((d) => d.DimId === dimId);
      ((dim && dim.Hierarchies) || []).forEach((h) => {
        const built = HierarchyEngine.build(dim, h.Id);
        members.forEach((id) => built.descendants(id).forEach((x) => set.add(x)));
      });
      out[dimId] = Array.from(set);
    });
    return out;
  }

  /** Rows that pass every filter (a dimension with an empty or missing list passes everything). */
  function applyFilters(model, facts, filters) {
    const active = Object.keys(filters || {}).filter((k) => filters[k] && filters[k].length);
    if (!active.length) { return facts.slice(); }
    // selecting a hierarchy node selects its whole subtree, in every hierarchy of the dimension
    const withSubtree = (dimId) => {
      const set = new Set(filters[dimId].map(String));
      if (dimId === "PERIOD") {   // a year or a quarter selects its months
        const time = HierarchyEngine.buildTime(periodList(model, facts));
        Array.from(set).forEach((id) => time.descendants(id).forEach((x) => set.add(x)));
        return set;
      }
      const dim = ((model && model.Dimensions) || []).find((d) => d.DimId === dimId);
      ((dim && dim.Hierarchies) || []).forEach((h) => {
        const built = HierarchyEngine.build(dim, h.Id);
        Array.from(set).forEach((id) => built.descendants(id).forEach((x) => set.add(x)));
      });
      return set;
    };
    const checks = active.map((dimId) => [fieldOf(model, dimId), withSubtree(dimId)]);
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

    const hier = {};
    Object.keys(spec.hierarchies || {}).forEach((dimId) => {
      if (dimId === "PERIOD") {
        if (spec.hierarchies.PERIOD === "TIME") { hier.PERIOD = HierarchyEngine.buildTime(periodList(model, facts)); }
        return;
      }
      const dim = ((model && model.Dimensions) || []).find((d) => d.DimId === dimId);
      if (dim && spec.hierarchies[dimId]) { hier[dimId] = HierarchyEngine.build(dim, spec.hierarchies[dimId]); }
    });
    // every key (member list) a fact contributes to on one axis: with a hierarchy, the member and all its ancestors
    const keysFor = (f, dims, fields) => {
      let combos = [[]];
      dims.forEach((d, i) => {
        const v = String(f[fields[i]]);
        const list = hier[d] ? hier[d].path(v) : [v];
        const next = [];
        combos.forEach((c) => list.forEach((x) => next.push(c.concat(x))));
        combos = next;
      });
      return combos;
    };

    const cells = new Map();
    const rowGroups = new Map();
    const colGroups = new Map();
    const rowSet = new Map();
    const colSet = new Map();
    const measures = new Set();
    kept.forEach((f) => {
      const rowCombos = keysFor(f, rowDims, rowFields);
      const colCombos = keysFor(f, colDims, colFields);
      rowCombos.forEach((rc) => {
        const rk = rc.join(SEP);
        (rowGroups.get(rk) || rowGroups.set(rk, []).get(rk)).push(f);
        if (!rowSet.has(rk)) { rowSet.set(rk, rc); }
      });
      colCombos.forEach((cc) => {
        const ck = cc.join(SEP);
        (colGroups.get(ck) || colGroups.set(ck, []).get(ck)).push(f);
        if (!colSet.has(ck)) { colSet.set(ck, cc); }
      });
      rowCombos.forEach((rc) => colCombos.forEach((cc) => {
        const k = rc.join(SEP) + "|" + cc.join(SEP);
        (cells.get(k) || cells.set(k, []).get(k)).push(f);
      }));
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
        if (hier[dims[i]]) { return hier[dims[i]].position(a[i]) - hier[dims[i]].position(b[i]); }
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

    // for the first hierarchical dimension of an axis: depth, children and the key of the parent node
    const infoFor = (dims) => {
      const idx = dims.findIndex((d) => hier[d]);
      if (idx < 0) { return null; }
      const h = hier[dims[idx]];
      return (key) => {
        const id = key[idx];
        const p = h.parent(id);
        return { index: idx, depth: h.depth(id), hasChildren: !h.isLeaf(id), parent: p === undefined ? null : key.map((x, i) => (i === idx ? p : x)) };
      };
    };

    const single = measures.size === 1 ? ((model && model.Measures) || []).find((m) => m.MeasureId === Array.from(measures)[0]) || null : null;
    return {
      rowDims, colDims, rowKeys, colKeys, flat, grand, measure: single,
      rowInfo: infoFor(rowDims), colInfo: infoFor(colDims),
      cell: (r, c) => values.get(r.join(SEP) + "|" + c.join(SEP)),
      cellFacts: (r, c) => cells.get(r.join(SEP) + "|" + c.join(SEP)) || [],
      rowTotal: (r) => rowTotals.get(r.join(SEP)) || 0,
      colTotal: (c) => colTotals.get(c.join(SEP)) || 0
    };
  }

  return { SEP, BUILTIN, fieldOf, labelOf, applyFilters, expandFilters, distinct, order, aggregate, reduce };
});
