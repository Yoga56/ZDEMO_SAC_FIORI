/**
 * Version life cycle (pure; ABAP twin is ZCL_SAC_VERSION_ENGINE).
 *   private -> publish -> public version (e.g. BUD). Publishing replaces the public version's facts.
 */
sap.ui.define(["./DataActionEngine"], function (DataActionEngine) {
  "use strict";

  const keyOf = DataActionEngine.keyOf;

  /** Copy every fact of `from` into a new private version. */
  function copyVersion(facts, from, to) {
    return facts.filter((f) => f.VersionId === from).map((f) => Object.assign({}, f, { VersionId: to }));
  }

  /** Facts after publishing `source` over `target`: target is cleared, then filled from source. */
  function publish(facts, source, target) {
    const kept = facts.filter((f) => f.VersionId !== target);
    const copied = copyVersion(facts, source, target);
    return kept.concat(copied);
  }

  function revert(facts, version) {
    return facts.filter((f) => f.VersionId !== version);
  }

  /** Variance of version `a` against `b`: a - b per key. */
  function variance(facts, a, b) {
    const base = new Map(facts.filter((f) => f.VersionId === b).map((f) => [keyOf(Object.assign({}, f, { VersionId: "" })), f.Value]));
    return facts.filter((f) => f.VersionId === a).map((f) => {
      const k = keyOf(Object.assign({}, f, { VersionId: "" }));
      return Object.assign({}, f, { Value: Math.round((f.Value - (base.get(k) || 0)) * 100) / 100 });
    });
  }

  return { copyVersion, publish, revert, variance };
});
