/**
 * Data Action engine (pure). The ABAP twin is ZCL_SAC_DATAACT_ENGINE; both follow the same semantics so a
 * mock run and a server run give the same numbers.
 *
 * action = { Id, ModelId, Name, Steps: [{ StepNo, StepType, SrcVersion, TgtVersion, Filter, Factor, TargetDim, TargetMembers }] }
 *   COPY      facts of SrcVersion matching Filter -> TgtVersion, value * Factor (default 1)
 *   SCALE     facts of TgtVersion matching Filter  -> value * Factor
 *   DELETE    facts of TgtVersion matching Filter are removed
 *   ALLOCATE  the sum of SrcVersion facts matching Filter, per period/measure/other dims, is spread equally
 *             over TargetMembers of TargetDim in TgtVersion (existing facts there are replaced)
 *
 * params.Filter is the "data filter parameter": it narrows the Filter of every step, so a planner runs the
 * action on the same slice that is filtered in the story.
 */
sap.ui.define(["../core/QueryEngine", "../core/FilterEngine"], function (QueryEngine, FilterEngine) {
  "use strict";

  const keyOf = (f) => [f.ModelId, f.VersionId, f.Period, f.Measure, f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].join("|");
  const clean = (f) => Object.assign({ Dim1: "", Dim2: "", Dim3: "", Dim4: "", Dim5: "" }, f);
  const round = (v) => Math.round(v * 100) / 100;

  /**
   * @param {object} model   model definition (dimensions)
   * @param {object[]} facts all facts of the model (not mutated)
   * @param {object} action
   * @param {object} [params] { Filter }
   * @returns {{facts: object[], changed: number, log: string[]}}
   */
  function run(model, facts, action, params) {
    const work = new Map();
    facts.forEach((f) => work.set(keyOf(f), clean(f)));
    const log = [];
    let changed = 0;

    (action.Steps || []).slice().sort((a, b) => a.StepNo - b.StepNo).forEach((step) => {
      const filter = FilterEngine.merge(step.Filter || {}, (params && params.Filter) || {});
      const all = Array.from(work.values());
      const factor = step.Factor === undefined || step.Factor === null || step.Factor === "" ? 1 : Number(step.Factor);
      const inScope = (version) => QueryEngine.applyFilters(model, all.filter((f) => f.VersionId === version), filter);
      let n = 0;

      switch (step.StepType) {
        case "COPY":
          inScope(step.SrcVersion).forEach((f) => {
            const t = Object.assign({}, f, { VersionId: step.TgtVersion, Value: round(f.Value * factor) });
            work.set(keyOf(t), t);
            n++;
          });
          break;
        case "SCALE":
          inScope(step.TgtVersion).forEach((f) => { f.Value = round(f.Value * factor); n++; });
          break;
        case "DELETE":
          inScope(step.TgtVersion).forEach((f) => { work.delete(keyOf(f)); n++; });
          break;
        case "ALLOCATE": {
          const field = QueryEngine.fieldOf(model, step.TargetDim);
          const members = step.TargetMembers || [];
          if (!members.length) { log.push("Step " + step.StepNo + ": no target members"); break; }
          const groups = new Map();
          const keyFields = ["Period", "Measure", "Dim1", "Dim2", "Dim3", "Dim4", "Dim5"];
          inScope(step.SrcVersion).forEach((f) => {
            const g = keyFields.map((x) => (x === field ? "" : f[x])).join("|");
            const cur = groups.get(g) || { sample: f, sum: 0 };
            cur.sum += f.Value;
            groups.set(g, cur);
          });
          groups.forEach((g) => {
            members.forEach((m) => {
              const t = Object.assign({}, g.sample, { VersionId: step.TgtVersion, [field]: m, Value: round(g.sum / members.length) });
              work.set(keyOf(t), t);
              n++;
            });
          });
          break;
        }
        default:
          log.push("Step " + step.StepNo + ": unknown type " + step.StepType);
      }
      changed += n;
      log.push("Step " + step.StepNo + " " + step.StepType + ": " + n + " value" + (n === 1 ? "" : "s"));
    });

    return { facts: Array.from(work.values()), changed, log };
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
