/**
 * Data action engine (pure). A data action is a sequence of steps over the facts of a model; the whole sequence runs in memory
 * and nothing is written unless every step succeeds (the provider then writes the difference).
 *
 *   COPY      selected facts are copied onto other members (copy rules: dimension From -> To, such as version ACT -> BUD or year 2025 -> 2026),
 *             optionally aggregated onto one member (Aggregate To), times a factor, overwriting or adding to what is there
 *   SCALE     the selected facts are multiplied by a factor
 *   DELETE    the selected facts are removed
 *   CONVERT   values are multiplied by a conversion rate: from the currency of a member (the CURRENCY attribute of a dimension) or one
 *             currency, into another, optionally into another version or measure; a missing rate stops the action
 *   ALLOCATE  the sum of the selected facts, per period/measure/other members, is spread over members of a dimension: equally, in proportion
 *             to the values already there, or in proportion to a reference version; overwriting or adding; optionally clearing the source
 *   EMBED     another data action of the model runs with its own parameters
 *
 * Parameters ("@Name" in filters, rules, factors, targets) take their values from params.Values (defaults otherwise). params.Filter is an extra
 * narrowing applied to every step (used by the story trigger widget).
 *
 * @returns {{status: "S"|"E", error?: string, facts: object[], changed: number, log: string[], steps: object[]}}
 *   steps: [{ no, name, type, active, touched, created, updated, deleted, message, samples: [{key, old, new}] }]
 */
sap.ui.define([
  "../core/QueryEngine", "../core/FilterEngine", "../core/HierarchyEngine", "./DataActionSchema"
], function (QueryEngine, FilterEngine, HierarchyEngine, Schema) {
  "use strict";

  const FIELDS = ["ModelId", "VersionId", "Period", "Measure", "Dim1", "Dim2", "Dim3", "Dim4", "Dim5"];
  const keyOf = (f) => FIELDS.map((x) => f[x]).join("|");
  const clean = (f) => Object.assign({ Dim1: "", Dim2: "", Dim3: "", Dim4: "", Dim5: "" }, f);
  const round = (v) => Math.round(v * 100) / 100;
  const SAMPLE_LIMIT = 15;

  const quarterOf = (p) => p.slice(0, 4) + "-Q" + (Math.floor((+p.slice(5) - 1) / 3) + 1);

  /** Does a copy rule's From member cover this member? A year or quarter covers its months. */
  function covers(dimId, member, from) {
    if (dimId === "PERIOD") {
      if (/^\d{4}$/.test(from)) { return member.slice(0, 4) === from; }
      if (/^\d{4}-Q[1-4]$/.test(from)) { return quarterOf(member) === from; }
    }
    return member === from;
  }

  /** The member a fact moves to: years keep their month (2025-03 with 2025 -> 2026 becomes 2026-03), quarters keep their month in the quarter. */
  function moved(dimId, member, from, to) {
    if (dimId === "PERIOD") {
      if (/^\d{4}$/.test(from) && /^\d{4}$/.test(to)) { return to + member.slice(4); }
      if (/^\d{4}-Q[1-4]$/.test(from) && /^\d{4}-Q[1-4]$/.test(to)) {
        const m = (+to.slice(6) - 1) * 3 + ((+member.slice(5) - 1) % 3) + 1;
        return to.slice(0, 4) + "-" + String(m).padStart(2, "0");
      }
    }
    return to;
  }

  function execute(model, work, action, P, ctx, depth, extra, out, prefix) {
    if (depth > 5) { throw new Error("Embedded data actions are nested too deep"); }
    const locked = ctx.locked;

    const list = (vals) => {
      const res = [];
      (vals || []).forEach((v) => {
        if (Schema.isRef(v)) {
          const p = P[Schema.refName(v)];
          if (Array.isArray(p)) { p.forEach((x) => res.push(String(x))); } else if (p !== undefined && Number.isFinite(p)) { res.push(String(p)); }
        } else { res.push(String(v)); }
      });
      return res;
    };
    const one = (v) => (Schema.isRef(v) ? (list([v])[0] || "") : (v === undefined || v === null ? "" : String(v)));
    const number = (v, step) => {
      const n = Schema.isRef(v) ? Number(P[Schema.refName(v)]) : Number(v);
      if (!Number.isFinite(n)) { throw new Error(step.Name + ": the factor is not a number"); }
      return n;
    };
    const filterOf = (step) => {
      const f = {};
      Object.keys(step.Filter || {}).forEach((d) => { const l = list(step.Filter[d]); if (l.length) { f[d] = l; } });
      return FilterEngine.merge(f, extra || {});
    };
    const select = (step) => QueryEngine.applyFilters(model, Array.from(work.values()), filterOf(step));
    // a node of a hierarchy stands for the leaves below it
    const leaves = (dimId, members) => {
      const dim = (model.Dimensions || []).find((d) => d.DimId === dimId);
      const res = new Set();
      members.forEach((m) => {
        let any = false;
        ((dim && dim.Hierarchies) || []).forEach((h) => {
          const b = HierarchyEngine.build(dim, h.Id);
          const below = b.descendants(m).filter((x) => b.isLeaf(x));
          if (below.length) { any = true; below.forEach((x) => res.add(x)); }
        });
        if (!any) { res.add(m); }
      });
      return Array.from(res);
    };

    (action.Steps || []).forEach((step) => {
      const entry = { no: prefix ? prefix.no : step.StepNo, name: (prefix ? prefix.name + " > " : "") + step.Name, type: step.StepType, active: step.Active,
        touched: 0, created: 0, updated: 0, deleted: 0, message: "", samples: [] };
      out.push(entry);
      if (!step.Active) { entry.message = "Skipped (not active)"; return; }

      const before = new Map(work);
      let touched = 0;

      switch (step.StepType) {
        case "COPY": {
          const factor = number(step.Factor, step);
          const rules = (step.Rules || []).map((r) => ({ dim: r.Dim, field: QueryEngine.fieldOf(model, r.Dim), from: one(r.From), to: one(r.To) }));
          const aggs = (step.AggregateTo || []).map((a) => ({ field: QueryEngine.fieldOf(model, a.Dim), member: one(a.Member) })).filter((a) => a.member);
          const target = new Map();
          select(step).forEach((f) => {
            const t = Object.assign({}, f);
            for (const r of rules) {
              if (r.from && !covers(r.dim, f[r.field], r.from)) { return; }
              if (r.to) { t[r.field] = moved(r.dim, f[r.field], r.from, r.to); }
            }
            aggs.forEach((a) => { t[a.field] = a.member; });
            const k = keyOf(t);
            const cur = target.get(k);
            t.Value = (cur ? cur.Value : 0) + f.Value * factor;
            target.set(k, t);
          });
          const append = step.WriteMode === "APPEND";
          target.forEach((t, k) => {
            const old = work.get(k);
            work.set(k, Object.assign({}, t, { Value: round((append && old ? old.Value : 0) + t.Value) }));
            touched++;
          });
          break;
        }
        case "CONVERT": {
          const parsed = Schema.parseRates(step.Rates);
          const to = one(step.ToCurrency).toUpperCase();
          const fixedFrom = one(step.FromCurrency).toUpperCase();
          const dim = step.CurrencyDim ? (model.Dimensions || []).find((d) => d.DimId === step.CurrencyDim) : null;
          const currencyOf = new Map(dim ? (dim.Members || []).map((m) => [m.Id, String((m.Props || {}).CURRENCY || "").toUpperCase()]) : []);
          const field = dim ? QueryEngine.fieldOf(model, dim.DimId) : "";
          const tgtVersion = one(step.TgtVersion);
          const tgtMeasure = one(step.TgtMeasure);
          const target = new Map();
          select(step).forEach((f) => {
            const from = dim ? currencyOf.get(f[field]) : fixedFrom;
            if (!from) { throw new Error(step.Name + ": " + (dim ? f[field] + " of " + dim.Label + " has no currency" : "no currency to convert from")); }
            const rate = Schema.rateFor(parsed.rates, from, to, f.Period);
            if (rate === null) { throw new Error(step.Name + ": no rate from " + from + " to " + to + (f.Period ? " for " + f.Period : "")); }
            const t = Object.assign({}, f, { Value: round(f.Value * rate) });
            if (tgtVersion) { t.VersionId = tgtVersion; }
            if (tgtMeasure) { t.Measure = tgtMeasure; }
            target.set(keyOf(t), t);
          });
          target.forEach((t, k) => { work.set(k, t); touched++; });
          break;
        }
        case "SCALE": {
          const factor = number(step.Factor, step);
          select(step).forEach((f) => { work.set(keyOf(f), Object.assign({}, f, { Value: round(f.Value * factor) })); touched++; });
          break;
        }
        case "DELETE":
          select(step).forEach((f) => { work.delete(keyOf(f)); touched++; });
          break;
        case "ALLOCATE": {
          const field = QueryEngine.fieldOf(model, step.TargetDim);
          const members = leaves(step.TargetDim, list(step.TargetMembers));
          if (!members.length) { entry.message = "No target members"; break; }
          const tgtVersion = one(step.TgtVersion);
          const driverVersion = one(step.DriverVersion);
          const groupFields = FIELDS.filter((x) => x !== field && x !== "ModelId");
          const source = select(step);
          const groups = new Map();
          source.forEach((f) => {
            const g = groupFields.map((x) => f[x]).join("|");
            const cur = groups.get(g) || { sample: f, sum: 0 };
            cur.sum += f.Value;
            groups.set(g, cur);
          });
          if (step.ClearSource) { source.forEach((f) => { work.delete(keyOf(f)); touched++; }); }
          const append = step.WriteMode === "APPEND";
          groups.forEach((g) => {
            const version = tgtVersion || g.sample.VersionId;
            const at = (member, ver) => work.get(keyOf(Object.assign({}, g.sample, { VersionId: ver, [field]: member })));
            let weights = members.map(() => 1);
            if (step.Driver === "PROPORTIONAL") { weights = members.map((m) => { const f = at(m, version); return f ? Math.abs(f.Value) : 0; }); }
            if (step.Driver === "REFERENCE") { weights = members.map((m) => { const f = at(m, driverVersion || version); return f ? Math.abs(f.Value) : 0; }); }
            let total = weights.reduce((a, b) => a + b, 0);
            if (total === 0) { weights = members.map(() => 1); total = members.length; }
            const shares = weights.map((w) => round((g.sum * w) / total));
            const rest = round(g.sum - shares.reduce((a, b) => a + b, 0));
            if (rest !== 0) { let big = 0; weights.forEach((w, i) => { if (w > weights[big]) { big = i; } }); shares[big] = round(shares[big] + rest); }
            members.forEach((m, i) => {
              const t = Object.assign({}, g.sample, { VersionId: version, [field]: m });
              const old = work.get(keyOf(t));
              work.set(keyOf(t), Object.assign(t, { Value: round((append && old ? old.Value : 0) + shares[i]) }));
              touched++;
            });
          });
          break;
        }
        case "EMBED": {
          const child = ctx.actions.get(step.ActionId);
          if (!child) { throw new Error(step.Name + ": data action " + step.ActionId + " does not exist"); }
          const supplied = {};
          Object.keys(step.ParamMap || {}).forEach((k) => {
            const v = step.ParamMap[k];
            const cp = (child.Parameters || []).find((p) => p.Id === k);
            supplied[k] = cp && cp.Type === "NUMBER" ? number(Array.isArray(v) ? v[0] : v, step) : list(Array.isArray(v) ? v : [v]);
          });
          execute(model, work, child, Schema.resolveValues(child, supplied), ctx, depth + 1, extra, out, { no: step.StepNo, name: step.Name });
          entry.message = "Ran " + child.Name;
          break;
        }
        default: throw new Error(step.Name + ": unknown step type " + step.StepType);
      }

      // what the step changed, and the check that no locked version was touched
      const after = work;
      before.forEach((f, k) => {
        const n = after.get(k);
        if (!n) { entry.deleted++; if (entry.samples.length < SAMPLE_LIMIT) { entry.samples.push({ key: sampleKey(f), old: f.Value, new: null }); } }
        else if (n.Value !== f.Value) { entry.updated++; if (entry.samples.length < SAMPLE_LIMIT) { entry.samples.push({ key: sampleKey(n), old: f.Value, new: n.Value }); } }
      });
      after.forEach((f, k) => { if (!before.has(k)) { entry.created++; if (entry.samples.length < SAMPLE_LIMIT) { entry.samples.push({ key: sampleKey(f), old: null, new: f.Value }); } } });
      const hit = Array.from(after.values()).concat(Array.from(before.values())).find((f) => locked.has(f.VersionId) && (before.get(keyOf(f)) || {}).Value !== (after.get(keyOf(f)) || {}).Value);
      if (hit) { throw new Error(step.Name + ": version " + hit.VersionId + " is locked"); }
      entry.touched = touched;
      if (!entry.message) { entry.message = touched + (touched === 1 ? " value" : " values") + " (" + entry.created + " new, " + entry.updated + " changed, " + entry.deleted + " deleted)"; }
    });
  }

  function sampleKey(f) { return [f.VersionId, f.Period, f.Measure, f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].filter(Boolean).join(" / "); }

  /**
   * @param {object} model
   * @param {object[]} facts all facts of the model (not changed)
   * @param {object} action
   * @param {{Values?: object, Filter?: object}} [params]
   * @param {{versions?: object[], actions?: Map<string, object>}} [ctx]
   */
  function run(model, facts, action, params, ctx) {
    const c = ctx || {};
    const actions = new Map();
    (c.actions ? Array.from(c.actions.values()) : []).forEach((a) => actions.set(a.Id, Schema.normalizeAction(a)));
    const A = Schema.normalizeAction(action);
    const work = new Map();
    facts.forEach((f) => { const x = clean(f); work.set(keyOf(x), x); });
    const result = { status: "S", facts: null, changed: 0, log: [], steps: [] };
    try {
      execute(model, work, A, Schema.resolveValues(A, params && params.Values), { locked: new Set((c.versions || []).filter((v) => v.Locked).map((v) => v.VersionId)), actions },
        0, params && params.Filter, result.steps, null);
      result.facts = Array.from(work.values());
      result.steps.forEach((s) => { result.changed += s.touched; result.log.push("Step " + s.no + " " + s.name + " (" + s.type + "): " + s.message); });
    } catch (e) {
      result.status = "E";
      result.error = e.message;
      result.facts = facts.map(clean);
      result.steps.forEach((s) => result.log.push("Step " + s.no + " " + s.name + " (" + s.type + "): " + s.message));
      result.log.push("Failed: " + e.message);
    }
    return result;
  }

  /** Difference between two fact sets as { upserts, deletes } so a provider writes only what moved. */
  function diff(before, after) {
    const b = new Map(before.map((f) => [keyOf(f), f]));
    const a = new Map(after.map((f) => [keyOf(f), f]));
    const upserts = [];
    const deletes = [];
    a.forEach((f, k) => { if (!b.has(k) || b.get(k).Value !== f.Value) { upserts.push(f); } });
    b.forEach((f, k) => { if (!a.has(k)) { deletes.push(f); } });
    return { upserts, deletes };
  }

  return { run, diff, keyOf };
});
