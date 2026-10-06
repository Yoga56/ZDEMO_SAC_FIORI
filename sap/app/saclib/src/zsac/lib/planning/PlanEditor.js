/**
 * Rules for typing into a cell of a planning table (pure): is the cell editable, and which facts change when a value is entered.
 *
 * ctx = { model, spec: { rows, columns, filters, hierarchies }, versions: [{VersionId, Locked, Category}], editable, lock: { compiled, user } }
 * lock (optional) is LockEngine.compile(model) and the user: cells in locked or restricted regions are not editable.
 * result = QueryEngine.aggregate(...) of the facts the table shows (unpublished changes already applied)
 */
sap.ui.define(["../core/QueryEngine", "./Spreader", "./LockEngine"], function (QueryEngine, Spreader, LockEngine) {
  "use strict";

  /** The single member a coordinate has in this cell: from the row or column key, else from a one-member filter. */
  function valueFor(ctx, result, r, c, dimId) {
    const ri = (ctx.spec.rows || []).indexOf(dimId);
    if (ri >= 0) { return r[ri]; }
    const ci = (ctx.spec.columns || []).indexOf(dimId);
    if (ci >= 0) { return c[ci]; }
    const f = (ctx.spec.filters || {})[dimId];
    return f && f.length === 1 ? f[0] : undefined;
  }

  function cellState(ctx, result, r, c) {
    const no = (reason) => ({ editable: false, reason });
    if (!ctx.editable) { return no("This table is read only"); }
    if (!ctx.model.PlanningEnabled) { return no("Planning is not enabled for this model"); }
    const version = valueFor(ctx, result, r, c, "VERSION");
    if (!version) { return no("Choose a single version for the table"); }
    const v = (ctx.versions || []).find((x) => x.VersionId === version);
    if (!v) { return no("Unknown version " + version); }
    if (v.Locked) { return no("Version " + version + " is locked"); }
    const measure = valueFor(ctx, result, r, c, "MEASURE");
    if (!measure) { return no("Choose a single measure for the table"); }
    const spec = (ctx.model.Measures || []).find((m) => m.MeasureId === measure);
    if (!spec) { return no("Unknown measure " + measure); }
    if (spec.Aggregation === "COUNT") { return no("A count cannot be planned"); }
    if (spec.ExceptionAggregation) { return no("A measure with an exception aggregation cannot be planned"); }
    const out = { editable: true, version, measure, measureSpec: spec, lock: "OPEN" };
    if (ctx.lock && ctx.lock.compiled && ctx.lock.compiled.enabled && v.Category !== "PRIVATE") {
      // the facts below the cell, or the fact a new value would create
      const scope = result.cellFacts(r, c);
      const facts = scope.length ? scope : [template(ctx, result, r, c, out)].filter(Boolean);
      const l = LockEngine.cellState(ctx.lock.compiled, facts, ctx.lock.user);
      out.lock = l.state;
      if (!l.ok) { return Object.assign(no(l.reason), { lock: l.state }); }
    }
    return out;
  }

  /** The fact a new value would create when the cell has no facts yet: every dimension needs one leaf member. */
  function template(ctx, result, r, c, state) {
    const fact = { ModelId: ctx.model.ModelId, VersionId: state.version, Measure: state.measure, Dim1: "", Dim2: "", Dim3: "", Dim4: "", Dim5: "", Value: 0 };
    const period = valueFor(ctx, result, r, c, "PERIOD");
    if (!/^\d{4}-\d{2}$/.test(period || "")) { return null; }
    fact.Period = period;
    for (const d of ctx.model.Dimensions) {
      const m = valueFor(ctx, result, r, c, d.DimId);
      if (m === undefined || m === "") { return null; }
      const nodes = new Set();
      const hid = (ctx.spec.hierarchies || {})[d.DimId];
      const h = (d.Hierarchies || []).find((x) => x.Id === hid);
      if (h) { Object.keys(h.Parents || {}).forEach((k) => { if (h.Parents[k]) { nodes.add(h.Parents[k]); } }); }
      if (nodes.has(m)) { return null; }
      fact["Dim" + d.Slot] = m;
    }
    return fact;
  }

  /**
   * @returns {{changes: object[]}|{error: string}} facts to write (new value in `Value`)
   */
  function edit(ctx, result, r, c, value) {
    const state = cellState(ctx, result, r, c);
    if (!state.editable) { return { error: state.reason }; }
    const n = Number(value);
    if (!Number.isFinite(n)) { return { error: "Enter a number" }; }
    const scope = result.cellFacts(r, c);
    if (scope.length) {
      const changes = Spreader.spread(state.measureSpec.Aggregation, scope, n);
      return { changes };
    }
    const fact = template(ctx, result, r, c, state);
    if (!fact) { return { error: "This cell has no data yet. Add the row first, or choose single members for every dimension." }; }
    fact.Value = Spreader.round(n);
    return { changes: [fact] };
  }

  /**
   * Zero facts for a new combination of members: one per period, skipping facts that exist.
   * members = { DIM_ID: member } for every model dimension
   */
  function newRows(model, version, measure, members, periods, existing) {
    const have = new Set(existing.map((f) => [f.VersionId, f.Period, f.Measure, f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].join("|")));
    const out = [];
    periods.forEach((p) => {
      const f = { ModelId: model.ModelId, VersionId: version, Period: p, Measure: measure, Dim1: "", Dim2: "", Dim3: "", Dim4: "", Dim5: "", Value: 0 };
      model.Dimensions.forEach((d) => { f["Dim" + d.Slot] = members[d.DimId] || ""; });
      if (!have.has([f.VersionId, f.Period, f.Measure, f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].join("|"))) { out.push(f); }
    });
    return out;
  }

  const keyOfFact = (f) => [f.ModelId, f.VersionId, f.Period, f.Measure, f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].join("|");

  return { cellState, edit, newRows, valueFor, keyOfFact, QueryEngine };
});
