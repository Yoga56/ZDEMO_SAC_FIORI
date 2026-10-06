/**
 * Copy of plan values from one model into another (pure): the data of a multi action's "Copy to another Model" step.
 *
 *   ModelCopy.build(sourceModel, targetModel, facts, { targetVersion, fixed: { DIM: member } }) -> { facts, skipped, problems }
 *
 * Dimensions are matched by id: a dimension of the target that the source also has takes the member of the fact; one the source does not
 * have takes the fixed member given for it. Measures are matched by id. What the target cannot hold is left out and counted: a measure
 * the target does not have, a month outside its periods, a member that is not one of its members. Values that land on the same target
 * cell (the source has dimensions the target has not) are added up.
 *
 *   ModelCopy.parseFixed(text) -> { DIM: member }       "REGION=EMEA; CHANNEL=Direct"
 *   ModelCopy.check(sourceModel, targetModel, fixed) -> [problem]   what stops the copy before any data is read
 */
sap.ui.define([], function () {
  "use strict";

  const round = (v) => Math.round(v * 100) / 100;

  function parseFixed(text) {
    const out = {};
    String(text || "").split(/[;\n]/).forEach((part) => {
      const i = part.indexOf("=");
      if (i > 0 && part.slice(i + 1).trim()) { out[part.slice(0, i).trim().toUpperCase()] = part.slice(i + 1).trim(); }
    });
    return out;
  }

  function check(src, tgt, fixed) {
    const problems = [];
    const srcDims = new Set((src.Dimensions || []).map((d) => d.DimId));
    (tgt.Dimensions || []).forEach((d) => {
      if (srcDims.has(d.DimId)) { return; }
      const m = (fixed || {})[d.DimId];
      if (!m) { problems.push("The target dimension " + d.DimId + " is not in the source model: give it a fixed member (" + d.DimId + "=member)"); }
      else if (!(d.Members || []).some((x) => x.Id === m)) { problems.push(m + " is not a member of " + d.DimId + " in the target model"); }
    });
    const tgtDims = new Set((tgt.Dimensions || []).map((d) => d.DimId));
    Object.keys(fixed || {}).forEach((k) => { if (!tgtDims.has(k)) { problems.push("Fixed member for " + k + ": the target model has no such dimension"); } });
    const shared = (src.Measures || []).filter((m) => (tgt.Measures || []).some((x) => x.MeasureId === m.MeasureId));
    if (!shared.length) { problems.push("The models share no measure id, so nothing can be copied"); }
    return problems;
  }

  function build(src, tgt, facts, opts) {
    const fixed = (opts && opts.fixed) || {};
    const problems = check(src, tgt, fixed);
    const result = { facts: [], skipped: { measures: [], periods: 0, members: 0 }, problems };
    if (problems.length) { return result; }
    const measures = new Set((tgt.Measures || []).map((m) => m.MeasureId));
    const members = new Map((tgt.Dimensions || []).map((d) => [d.DimId, new Set((d.Members || []).map((m) => m.Id))]));
    const srcSlot = new Map((src.Dimensions || []).map((d) => [d.DimId, d.Slot]));
    const out = new Map();
    const lostMeasures = new Set();
    facts.forEach((f) => {
      if (!measures.has(f.Measure)) { lostMeasures.add(f.Measure); return; }
      if (f.Period < tgt.PeriodFrom || f.Period > tgt.PeriodTo) { result.skipped.periods++; return; }
      const t = { ModelId: tgt.ModelId, VersionId: (opts && opts.targetVersion) || f.VersionId, Period: f.Period, Measure: f.Measure, Dim1: "", Dim2: "", Dim3: "", Dim4: "", Dim5: "", Value: f.Value };
      for (const d of tgt.Dimensions || []) {
        const m = srcSlot.has(d.DimId) ? f["Dim" + srcSlot.get(d.DimId)] : fixed[d.DimId];
        if (!members.get(d.DimId).has(m)) { result.skipped.members++; return; }
        t["Dim" + d.Slot] = m;
      }
      const k = [t.VersionId, t.Period, t.Measure, t.Dim1, t.Dim2, t.Dim3, t.Dim4, t.Dim5].join("|");
      if (out.has(k)) { out.get(k).Value = round(out.get(k).Value + t.Value); } else { out.set(k, t); }
    });
    result.skipped.measures = Array.from(lostMeasures);
    result.facts = Array.from(out.values());
    return result;
  }

  return { parseFixed, check, build };
});
