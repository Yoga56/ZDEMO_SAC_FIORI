/**
 * Data locking by region (pure): which slices of the plan data planners may change.
 *
 * A model with Data Locking switched on has lock regions. A region is a slice of the data (members of any dimensions, versions and
 * periods; a year, a quarter or a hierarchy node stands for everything below it) with a state:
 *   OPEN        everyone who may plan can change the numbers
 *   RESTRICTED  only the region's owners can change them
 *   LOCKED      nobody can change them
 * Data outside every region has the model's default state (LockDefault, normally OPEN). A fact that lies in several regions takes the
 * strictest rule: one LOCKED region locks it, and every RESTRICTED region must name the user.
 *
 *   model.DataLocking, model.LockDefault, model.LockRegions = [{ Id, Name, State, Owners: [user], Filter: { DIM: [members] } }]
 *
 *   LockEngine.compile(model) -> compiled     (do this once, then ask many times)
 *   LockEngine.check(compiled, fact, user) -> { state, ok, region }
 *   LockEngine.cellState(compiled, facts, user) -> { state: OPEN|RESTRICTED|LOCKED|MIXED, ok, reason }   for a cell that spans these facts
 *   LockEngine.blocked(model, facts, user, isPrivate) -> [{ fact, state, region }]  the facts the user may not write
 *   LockEngine.message(blocked) -> text for the planner
 *   LockEngine.validate(model, regions) -> [error text]
 *   LockEngine.normalize(regions) -> regions with every property filled
 *
 * Private versions are the planner's own copy and are not locked (publishing them to a public version is).
 */
sap.ui.define(["../core/QueryEngine", "../core/Format"], function (QueryEngine, Format) {
  "use strict";

  const STATES = { OPEN: { label: "Open", rank: 0 }, RESTRICTED: { label: "Restricted", rank: 1 }, LOCKED: { label: "Locked", rank: 2 } };
  const up = (s) => String(s || "").toUpperCase();

  function normalize(regions) {
    return (regions || []).map((r, i) => ({
      Id: r.Id || "R" + (i + 1),
      Name: r.Name || r.Id || "Region " + (i + 1),
      State: STATES[r.State] ? r.State : "LOCKED",
      Owners: (Array.isArray(r.Owners) ? r.Owners : String(r.Owners || "").split(/[,;\s]+/)).map(up).filter(Boolean),
      Filter: Object.keys(r.Filter || {}).reduce((o, k) => { const m = (r.Filter[k] || []).map(String).filter(Boolean); if (m.length) { o[k] = m; } return o; }, {})
    }));
  }

  function compile(model) {
    const enabled = !!(model && model.DataLocking);
    const regions = normalize(model && model.LockRegions);
    const def = STATES[model && model.LockDefault] ? model.LockDefault : "OPEN";
    const compiled = { enabled, model, def, regions: [] };
    if (!enabled) { return compiled; }
    regions.forEach((region) => {
      const expanded = QueryEngine.expandFilters(model, region.Filter);
      const checks = Object.keys(expanded).map((dimId) => [QueryEngine.fieldOf(model, dimId), new Set(expanded[dimId])]);
      compiled.regions.push({ region, checks });
    });
    return compiled;
  }

  const inside = (entry, fact) => entry.checks.every(([field, set]) => set.has(String(fact[field] === undefined ? "" : fact[field])));

  /** The rule for one fact. ok: the user may change it. */
  function check(compiled, fact, user) {
    if (!compiled || !compiled.enabled) { return { state: "OPEN", ok: true, region: null }; }
    const hits = compiled.regions.filter((e) => inside(e, fact));
    if (!hits.length) {
      const state = compiled.def;
      return { state, ok: state === "OPEN", region: null };
    }
    let worst = hits[0];
    hits.forEach((e) => { if (STATES[e.region.State].rank > STATES[worst.region.State].rank) { worst = e; } });
    if (worst.region.State === "LOCKED") { return { state: "LOCKED", ok: false, region: worst.region }; }
    const restricting = hits.filter((e) => e.region.State === "RESTRICTED");
    if (!restricting.length) { return { state: "OPEN", ok: true, region: worst.region }; }
    const u = up(user);
    const refusing = restricting.find((e) => e.region.Owners.indexOf(u) < 0 && e.region.Owners.indexOf("*") < 0);
    return { state: "RESTRICTED", ok: !refusing, region: (refusing || restricting[0]).region };
  }

  /** The lock state a cell shows: the facts below it all share one state, or the cell is MIXED. ok only when every fact may be changed. */
  function cellState(compiled, facts, user) {
    if (!compiled || !compiled.enabled || !facts.length) { return { state: "OPEN", ok: true, reason: "" }; }
    const seen = new Map();
    let ok = true;
    let firstBad = null;
    facts.forEach((f) => {
      const c = check(compiled, f, user);
      seen.set(c.state, c);
      if (!c.ok) { ok = false; firstBad = firstBad || c; }
    });
    const state = seen.size > 1 ? "MIXED" : Array.from(seen.keys())[0];
    if (ok) { return { state, ok, reason: "" }; }
    const where = firstBad.region ? "region " + firstBad.region.Name : "the default of the model";
    const why = firstBad.state === "LOCKED" ? "locked by " + where : "restricted by " + where + " to " + (firstBad.region && firstBad.region.Owners.length ? firstBad.region.Owners.join(", ") : "its owners");
    return { state, ok, reason: "Data is " + why + (state === "MIXED" ? " (some of the values below this cell)" : "") };
  }

  /** The facts of `facts` that `user` may not write. isPrivate(versionId) leaves out the private versions. */
  function blocked(model, facts, user, isPrivate) {
    const compiled = compile(model);
    if (!compiled.enabled) { return []; }
    const out = [];
    facts.forEach((fact) => {
      if (isPrivate && isPrivate(fact.VersionId)) { return; }
      const c = check(compiled, fact, user);
      if (!c.ok) { out.push({ fact, state: c.state, region: c.region }); }
    });
    return out;
  }

  function message(list) {
    if (!list.length) { return ""; }
    const by = new Map();
    list.forEach((b) => {
      const k = (b.region ? b.region.Name : "the model default") + "|" + b.state;
      if (!by.has(k)) { by.set(k, { region: b.region, state: b.state, n: 0, periods: new Set() }); }
      const e = by.get(k);
      e.n++;
      e.periods.add(b.fact.Period);
    });
    const parts = Array.from(by.values()).map((e) => e.n + (e.n === 1 ? " value" : " values") + " in "
      + (e.region ? "region " + e.region.Name : "the default of the model") + " (" + (e.state === "LOCKED" ? "locked" : e.state === "RESTRICTED" ? "restricted to " + (e.region.Owners.join(", ") || "its owners") : "not open") + ")");
    return "Data locking stops this change: " + parts.join("; ") + ".";
  }

  function validate(model, regions) {
    const errors = [];
    const ids = new Set();
    const dimIds = new Set((model.Dimensions || []).map((d) => d.DimId).concat(["VERSION", "PERIOD", "MEASURE"]));
    (regions || []).forEach((r, i) => {
      const n = "Region " + (i + 1) + (r.Name ? " (" + r.Name + ")" : "");
      if (!String(r.Name || "").trim()) { errors.push(n + " needs a name"); }
      if (!STATES[r.State]) { errors.push(n + ": the state is Open, Restricted or Locked"); }
      if (ids.has(r.Id)) { errors.push(n + ": the id " + r.Id + " is used twice"); }
      ids.add(r.Id);
      Object.keys(r.Filter || {}).forEach((k) => { if (!dimIds.has(k)) { errors.push(n + ": " + k + " is not a dimension of the model"); } });
      if (r.State === "RESTRICTED" && !normalize([r])[0].Owners.length) { errors.push(n + " is restricted but names no owner"); }
    });
    return errors;
  }

  /** One line for a region's slice: "Region EMEA, APAC · Q1 2026". */
  function describeFilter(model, filter) {
    const keys = Object.keys(filter || {});
    if (!keys.length) { return "All data"; }
    return keys.map((k) => QueryEngine.labelOf(model, k) + " " + filter[k].map((m) => (k === "PERIOD" ? Format.period(m) : m)).join(", ")).join(" · ");
  }

  return { STATES, compile, check, cellState, blocked, message, validate, normalize, describeFilter };
});
