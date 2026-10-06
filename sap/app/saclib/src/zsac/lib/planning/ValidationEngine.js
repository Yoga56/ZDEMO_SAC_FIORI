/**
 * Validation rules for plan data (pure): limits a value must keep, checked when it is typed, pasted, written by an action or published.
 *
 *   model.ValidationRules = [{ Id, Name, Measure, Filter: { DIM: [members] }, Min, Max, Level: "ERROR" | "WARNING", Message }]
 *
 * A rule covers the facts of its measure (empty: every measure) inside its Filter (empty: everywhere; hierarchy nodes, quarters and
 * years stand for what is below them, as in lock regions). A value below Min or above Max breaks the rule. ERROR refuses the value,
 * WARNING lets it through and says so.
 *
 *   ValidationEngine.compile(model) -> compiled
 *   ValidationEngine.check(compiled, fact) -> [{ rule, problem }]   the rules the fact's value breaks
 *   ValidationEngine.run(model, facts, isPrivate) -> { errors: [{fact, rule, problem}], warnings: [...] }
 *   ValidationEngine.message(list) -> text for the planner
 *   ValidationEngine.normalize(rules) / validate(model, rules)
 */
sap.ui.define(["../core/QueryEngine"], function (QueryEngine) {
  "use strict";

  const num = (v) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

  function normalize(rules) {
    return (rules || []).map((r, i) => ({
      Id: r.Id || "V" + (i + 1),
      Name: r.Name || "Rule " + (i + 1),
      Measure: r.Measure || "",
      Filter: Object.keys(r.Filter || {}).reduce((o, k) => { const m = (r.Filter[k] || []).map(String).filter(Boolean); if (m.length) { o[k] = m; } return o; }, {}),
      Min: num(r.Min),
      Max: num(r.Max),
      Level: r.Level === "WARNING" ? "WARNING" : "ERROR",
      Message: r.Message || ""
    }));
  }

  function compile(model) {
    const rules = normalize(model && model.ValidationRules);
    return rules.map((rule) => {
      const expanded = QueryEngine.expandFilters(model, rule.Filter);
      return { rule, checks: Object.keys(expanded).map((d) => [QueryEngine.fieldOf(model, d), new Set(expanded[d])]) };
    });
  }

  function check(compiled, fact) {
    const out = [];
    compiled.forEach((e) => {
      const r = e.rule;
      if (r.Measure && r.Measure !== fact.Measure) { return; }
      if (!e.checks.every(([field, set]) => set.has(String(fact[field] === undefined ? "" : fact[field])))) { return; }
      if (r.Min !== null && fact.Value < r.Min) { out.push({ rule: r, problem: "below the minimum " + r.Min }); }
      if (r.Max !== null && fact.Value > r.Max) { out.push({ rule: r, problem: "above the maximum " + r.Max }); }
    });
    return out;
  }

  function run(model, facts, isPrivate) {
    const compiled = compile(model);
    const res = { errors: [], warnings: [] };
    if (!compiled.length) { return res; }
    facts.forEach((fact) => {
      if (isPrivate && isPrivate(fact.VersionId)) { return; }
      check(compiled, fact).forEach((b) => (b.rule.Level === "ERROR" ? res.errors : res.warnings).push(Object.assign({ fact }, b)));
    });
    return res;
  }

  function message(list) {
    if (!list.length) { return ""; }
    const by = new Map();
    list.forEach((b) => {
      const k = b.rule.Id + "|" + b.problem;
      if (!by.has(k)) { by.set(k, { b, n: 0, first: b.fact.Value }); }
      by.get(k).n++;
    });
    return Array.from(by.values()).map((e) => (e.b.rule.Message || e.b.rule.Name) + ": " + e.n + (e.n === 1 ? " value is " : " values are ") + e.b.problem + (e.n === 1 ? " (" + e.first + ")" : "")).join("; ");
  }

  function validate(model, rules) {
    const errors = [];
    const dims = new Set((model.Dimensions || []).map((d) => d.DimId).concat(["VERSION", "PERIOD", "MEASURE"]));
    const measures = new Set((model.Measures || []).map((m) => m.MeasureId));
    const ids = new Set();
    (rules || []).forEach((r, i) => {
      const n = "Rule " + (i + 1) + (r.Name ? " (" + r.Name + ")" : "");
      if (!String(r.Name || "").trim()) { errors.push(n + " needs a name"); }
      if (ids.has(r.Id)) { errors.push(n + ": the id " + r.Id + " is used twice"); }
      ids.add(r.Id);
      if (r.Measure && !measures.has(r.Measure)) { errors.push(n + ": " + r.Measure + " is not a measure of the model"); }
      if (num(r.Min) === null && num(r.Max) === null) { errors.push(n + " needs a minimum, a maximum or both"); }
      if (num(r.Min) !== null && num(r.Max) !== null && num(r.Min) > num(r.Max)) { errors.push(n + ": the minimum is above the maximum"); }
      Object.keys(r.Filter || {}).forEach((k) => { if (!dims.has(k)) { errors.push(n + ": " + k + " is not a dimension of the model"); } });
    });
    return errors;
  }

  return { normalize, compile, check, run, message, validate };
});
