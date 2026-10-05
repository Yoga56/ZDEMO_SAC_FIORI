/**
 * "Why did it change?" (pure): explains the difference of a measure between two slices of the data, for example Actual against Budget
 * or this quarter against last quarter, by the members of every dimension.
 *
 *   VarianceEngine.explain(model, facts, spec) -> result
 *   spec = { measure, base: {DIM: [members]}, compare: {DIM: [members]}, filters: {DIM: [members]}, lowerIsBetter, labels: {base, compare}, dims: [DimId] }
 *     base      the slice that is the reference (for example { VERSION: ["BUD"] })
 *     compare   the slice that is explained, same shape (for example { VERSION: ["ACT"] })
 *     filters   restrictions common to both: the drill path (REGION: ["EMEA"]) and anything the page filters
 *     dims      dimensions to break down by (default: every dimension of the model and PERIOD)
 *     noNarrative  skip the sentences (they are the costly part: they explain the drill path as well)
 *
 * result = { measure, base, compare, delta, pct, favorable, dims: [{ dimId, label, rows, sumAbs, topShare }], narrative: { text, path }, error? }
 *   rows: [{ member, base, compare, delta, share, pct, favorable }] ordered by size of the change; share = delta / the sum of all changes of the
 *   dimension taken without sign (-1 to 1, so it stays meaningful where changes cancel out); topShare = the biggest share without sign;
 *   up / down = the sums of the increases and of the decreases.
 *
 * Only measures that add up (aggregation SUM, no exception aggregation) can be explained: the contributions of the members must sum to the total.
 */
sap.ui.define(["./QueryEngine", "./Format"], function (QueryEngine, Format) {
  "use strict";

  const round = (v) => Math.round(v * 100) / 100;
  const MAX_DEPTH = 3;
  const sameMembers = (a, b) => JSON.stringify((a || []).slice().sort()) === JSON.stringify((b || []).slice().sort());

  /** Filter of one side: the common filters, then the side's own (which win). */
  const side = (filters, own) => Object.assign({}, filters || {}, own || {});

  /** Dimensions that make sense to break down by: not the one the two sides differ in, not one with a single member. */
  function candidates(model, spec, baseFilter, compareFilter, baseFacts, compareFacts) {
    const all = (model.Dimensions || []).map((d) => ({ id: d.DimId, label: d.Label || d.DimId })).concat([{ id: "PERIOD", label: "Date" }]);
    const wanted = spec.dims ? all.filter((d) => spec.dims.indexOf(d.id) >= 0) : all;
    return wanted.filter((d) => {
      if (!sameMembers(baseFilter[d.id], compareFilter[d.id])) { return false; }
      const field = QueryEngine.fieldOf(model, d.id);
      const seen = new Set();
      baseFacts.concat(compareFacts).forEach((f) => seen.add(String(f[field])));
      return seen.size > 1;
    });
  }

  function breakdown(model, dim, baseFacts, compareFacts, lowerIsBetter) {
    const field = QueryEngine.fieldOf(model, dim.id);
    const map = new Map();
    const add = (facts, key) => facts.forEach((f) => {
      const m = String(f[field]);
      if (!map.has(m)) { map.set(m, { member: m, base: 0, compare: 0 }); }
      map.get(m)[key] += f.Value;
    });
    add(baseFacts, "base"); add(compareFacts, "compare");
    const memberDim = (model.Dimensions || []).find((d) => d.DimId === dim.id);
    const text = new Map(((memberDim && memberDim.Members) || []).map((x) => [x.Id, x.Text]));
    const entries = Array.from(map.values()).map((r) => Object.assign(r, { delta: r.compare - r.base }));
    const sumAbs = entries.reduce((s, r) => s + Math.abs(r.delta), 0);
    const rows = entries.map((r) => {
      const delta = r.delta;
      return {
        member: r.member, label: dim.id === "PERIOD" ? Format.period(r.member) : (text.get(r.member) && text.get(r.member) !== r.member ? text.get(r.member) : r.member),
        base: round(r.base), compare: round(r.compare), delta: round(delta),
        share: sumAbs ? delta / sumAbs : null, pct: r.base ? Math.round((delta / Math.abs(r.base)) * 1e6) / 1e4 : null,
        favorable: delta === 0 ? null : (delta > 0) !== !!lowerIsBetter
      };
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || String(a.member).localeCompare(String(b.member)));
    const up = rows.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0);
    const down = rows.filter((r) => r.delta < 0).reduce((s, r) => s + r.delta, 0);
    return { dimId: dim.id, label: dim.label, rows, sumAbs: round(sumAbs), up: round(up), down: round(down), topShare: sumAbs ? Math.abs(rows[0].delta) / sumAbs : 0 };
  }

  /** The measure of the model, or the reason it cannot be explained. */
  function check(model, measureId) {
    const m = (model.Measures || []).find((x) => x.MeasureId === measureId);
    if (!m) { return "Unknown measure " + measureId; }
    if (m.Aggregation !== "SUM" || m.ExceptionAggregation) { return "The measure " + (m.Label || measureId) + " does not add up (" + (m.ExceptionAggregation ? "exception aggregation" : m.Aggregation.toLowerCase()) + "), so its change cannot be shared out over members."; }
    return "";
  }

  function explain(model, facts, spec) {
    const problem = check(model, spec.measure);
    const measure = (model.Measures || []).find((x) => x.MeasureId === spec.measure) || { MeasureId: spec.measure, Label: spec.measure };
    const empty = { measure: spec.measure, base: 0, compare: 0, delta: 0, pct: null, favorable: null, dims: [], narrative: { text: "", path: [] } };
    if (problem) { return Object.assign(empty, { error: problem }); }
    const own = facts.filter((f) => f.Measure === spec.measure);
    const baseFilter = side(spec.filters, spec.base);
    const compareFilter = side(spec.filters, spec.compare);
    const baseFacts = QueryEngine.applyFilters(model, own, baseFilter);
    const compareFacts = QueryEngine.applyFilters(model, own, compareFilter);
    const sum = (list) => round(list.reduce((s, f) => s + f.Value, 0));
    const base = sum(baseFacts);
    const compare = sum(compareFacts);
    const delta = round(compare - base);
    const lower = !!spec.lowerIsBetter;
    const dims = candidates(model, spec, baseFilter, compareFilter, baseFacts, compareFacts)
      .map((d) => breakdown(model, d, baseFacts, compareFacts, lower))
      .sort((a, b) => b.topShare - a.topShare);
    const result = {
      measure: spec.measure, base, compare, delta, pct: base ? Math.round((delta / Math.abs(base)) * 1e6) / 1e4 : null,
      favorable: delta === 0 ? null : (delta > 0) !== lower, dims, facts: { base: baseFacts.length, compare: compareFacts.length }
    };
    result.narrative = spec.noNarrative ? { text: "", path: [] } : narrative(model, facts, spec, measure, result);
    return result;
  }

  const signed = (v) => (v >= 0 ? "+" : "-") + Format.compact(Math.abs(v));

  /**
   * One or two sentences: the size of the change, then the biggest driver and, inside it, the next one (up to three levels, as long as one member
   * clearly leads). path lists the drill steps so a view can open at the same place.
   */
  function narrative(model, facts, spec, measure, top) {
    const labels = Object.assign({ base: "the reference", compare: "the comparison" }, spec.labels);
    const name = measure.Label || measure.MeasureId;
    if (!top.facts.base && !top.facts.compare) { return { text: "There is no " + name + " in either slice.", path: [] }; }
    const moved = top.dims.length && top.dims[0].sumAbs > 0;
    if (!top.delta && !moved) { return { text: name + " is the same in " + labels.compare + " and " + labels.base + ".", path: [] }; }
    const pct = top.pct === null ? "" : " (" + (top.pct >= 0 ? "+" : "-") + Math.abs(top.pct).toFixed(1) + "%)";
    const parts = [top.delta
      ? name + " in " + labels.compare + " is " + Format.compact(Math.abs(top.delta)) + pct + (top.delta > 0 ? " above " : " below ") + labels.base + "."
      : name + " adds up to the same in " + labels.compare + " and " + labels.base + ", but its parts differ."];
    const gross = top.dims.length ? top.dims[0] : null;
    if (top.delta && gross && gross.sumAbs > 3 * Math.abs(top.delta)) { parts.push("The net change is small because movements cancel out: " + signed(gross.up) + " up and " + signed(gross.down) + " down."); }
    const path = [];
    let current = top;
    let filters = Object.assign({}, spec.filters || {});
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      // a driver clearly leads: a real share of the movement and noticeably more than the runner-up
      const lead = current.dims.find((d) => d.topShare >= 0.4 && d.rows.length > 1 && Math.abs(d.rows[0].delta) >= 1.25 * Math.abs(d.rows[1].delta));
      if (!lead) { break; }
      const row = lead.rows[0];
      const share = row.share === null ? null : Math.round(Math.abs(row.share) * 100);
      path.push({ dimId: lead.dimId, label: lead.label, member: row.member, memberLabel: row.label, delta: row.delta, share });
      const against = lead.rows.slice(1).find((r) => r.delta !== 0 && Math.sign(r.delta) !== Math.sign(current.delta));
      parts.push((depth === 0 ? "The biggest driver is " : "Within it, ") + lead.label + " " + row.label + " (" + signed(row.delta) + (share !== null ? ", " + share + "% of the movement" : "") + ")"
        + (depth === 0 && against ? "; " + lead.label + " " + against.label + " moves the other way (" + signed(against.delta) + ")" : "") + ".");
      filters = Object.assign({}, filters, { [lead.dimId]: [row.member] });
      current = explain(model, facts, Object.assign({}, spec, { filters, noNarrative: true }));
      if (current.error || !current.delta) { break; }
    }
    return { text: parts.join(" "), path };
  }

  /**
   * Two versions rarely cover the same months (actuals stop in September, the budget runs to December). Where the two sides differ in the
   * months they have data for, the fair comparison is on the months both have: returns { periods, note } with the months in common, or
   * { periods: [], note: "" } when the sides cover the same months (or when the sides are defined by months themselves).
   */
  function commonPeriods(model, facts, spec) {
    if ((spec.base || {}).PERIOD || (spec.compare || {}).PERIOD || (spec.filters || {}).PERIOD) { return { periods: [], note: "" }; }
    const own = facts.filter((f) => f.Measure === spec.measure);
    const months = (filters) => new Set(QueryEngine.applyFilters(model, own, side(spec.filters, filters)).map((f) => f.Period));
    const a = months(spec.base); const b = months(spec.compare);
    const both = Array.from(a).filter((p) => b.has(p)).sort();
    if (!both.length || (both.length === a.size && both.length === b.size)) { return { periods: [], note: "" }; }
    return { periods: both, note: "The two sides cover different months, so only the months both have are compared (" + Format.period(both[0]) + " to " + Format.period(both[both.length - 1]) + ")." };
  }

  /**
   * The filter that reads every fact either side needs: for each dimension the members of both sides together, nothing where one side
   * is not restricted. Drilling down only restricts further, so one read serves the whole analysis.
   */
  function loadFilter(spec) {
    const out = {};
    const keys = new Set(Object.keys(spec.base || {}).concat(Object.keys(spec.compare || {}), Object.keys(spec.filters || {})));
    keys.forEach((d) => {
      const pick = (own) => ((own && own[d] && own[d].length) ? own[d] : ((spec.filters || {})[d] || []));
      const a = pick(spec.base); const b = pick(spec.compare);
      if (a.length && b.length) { out[d] = Array.from(new Set(a.concat(b))); }
    });
    return out;
  }

  return { explain, check, loadFilter, commonPeriods };
});
