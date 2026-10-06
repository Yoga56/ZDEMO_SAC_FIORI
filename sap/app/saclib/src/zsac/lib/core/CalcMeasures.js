/**
 * Calculated measures (pure): a measure worked out from other measures with a formula, after the data has been aggregated.
 *
 *   model.CalcMeasures = [{ MeasureId, Label, Formula, Percent, Unit, Decimals }]
 *   Formula  arithmetic over measure ids (see planning/FormulaEngine): REVENUE - COST, (REVENUE - COST) / REVENUE
 *   Percent  the result is multiplied by 100 and shown as a percentage
 *
 * Because the formula runs on the aggregated numbers of each cell, a margin of a total is the margin of the totals, not the sum of margins.
 * A cell where the formula cannot be worked out (division by zero, no data for any of its measures) is empty.
 *
 *   CalcMeasures.normalize(list)            every property filled
 *   CalcMeasures.find(model, id)            the calculated measure with this id (any case) or null
 *   CalcMeasures.all(model)                 the measures of the model and the calculated ones (a pickable list: { MeasureId, Label, Calculated })
 *   CalcMeasures.baseIds(model, ids)        the stored measures the ids need (calculated ids replaced by what they are made of)
 *   CalcMeasures.validate(model, list)      [problem text]
 */
sap.ui.define(["../planning/FormulaEngine"], function (FormulaEngine) {
  "use strict";

  const up = (s) => String(s || "").toUpperCase();
  const compile = (f) => FormulaEngine.compile("=" + String(f || "").replace(/^\s*=/, ""));

  function normalize(list) {
    return (Array.isArray(list) ? list : []).map((c) => ({
      MeasureId: String(c.MeasureId || "").trim(),
      Label: c.Label || c.MeasureId || "",
      Formula: String(c.Formula || "").trim().replace(/^=/, ""),
      Percent: !!c.Percent,
      Unit: c.Unit || "",
      Decimals: Number.isInteger(Number(c.Decimals)) && c.Decimals !== "" && c.Decimals !== null && c.Decimals !== undefined ? Number(c.Decimals) : (c.Percent ? 1 : 2)
    })).filter((c) => c.MeasureId);
  }

  const find = (model, id) => (model && model.CalcMeasures || []).find((c) => up(c.MeasureId) === up(id)) || null;

  function all(model) {
    return ((model && model.Measures) || []).map((m) => ({ MeasureId: m.MeasureId, Label: m.Label || m.MeasureId, Calculated: false }))
      .concat(((model && model.CalcMeasures) || []).map((c) => ({ MeasureId: c.MeasureId, Label: c.Label || c.MeasureId, Calculated: true })));
  }

  /** The id as the model spells it: a stored measure or a calculated one, any case. */
  function resolve(model, name) {
    const m = ((model && model.Measures) || []).find((x) => up(x.MeasureId) === up(name));
    if (m) { return { id: m.MeasureId, calc: null }; }
    const c = find(model, name);
    return c ? { id: c.MeasureId, calc: c } : null;
  }

  function baseIds(model, ids, depth) {
    const out = new Set();
    (ids || []).forEach((id) => {
      const c = find(model, id);
      if (!c || (depth || 0) > 8) { out.add(id); return; }
      compile(c.Formula).names.forEach((n) => { const r = resolve(model, n); if (r) { baseIds(model, [r.id], (depth || 0) + 1).forEach((x) => out.add(x)); } });
    });
    return Array.from(out);
  }

  function validate(model, list) {
    const problems = [];
    const seen = new Set();
    const stored = new Set(((model && model.Measures) || []).map((m) => up(m.MeasureId)));
    list.forEach((c, i) => {
      const n = "Calculation " + (i + 1) + (c.MeasureId ? " (" + c.MeasureId + ")" : "");
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(c.MeasureId || "")) { problems.push(n + ": the id is letters, digits and _, starting with a letter"); return; }
      if (stored.has(up(c.MeasureId)) || seen.has(up(c.MeasureId))) { problems.push(n + ": the id is already used by a measure"); }
      seen.add(up(c.MeasureId));
      const f = compile(c.Formula);
      if (f.error) { problems.push(n + ": " + f.error); return; }
      if (!f.names.length) { problems.push(n + ": the formula uses no measure"); }
      f.names.forEach((name) => {
        const isStored = stored.has(up(name));
        const earlier = list.slice(0, i).some((x) => up(x.MeasureId) === up(name));
        if (!isStored && !earlier) { problems.push(n + ": " + name + " is not a measure of the model" + (list.some((x) => up(x.MeasureId) === up(name)) ? " defined before this one" : "")); }
      });
    });
    return problems;
  }

  return { normalize, find, all, resolve, baseIds, validate, compile };
});
