/**
 * Where a cell comment belongs (pure). A comment is attached to the coordinates of a cell:
 *   { ModelId, VersionId, Period, Measure, Dims: { DIMID: member } }
 * Period is the member the cell shows (a month, a quarter or a year); Dims holds every dimension of the model the cell fixes.
 */
sap.ui.define([], function () {
  "use strict";

  /** Same cell, same key; independent of the order of Dims. */
  function keyOf(model, c) {
    return [c.VersionId || "", c.Period || "", c.Measure || ""].concat((model.Dimensions || []).map((d) => (c.Dims || {})[d.DimId] || "")).join("|");
  }

  /** Map key -> comments, for the quick lookup of a cell. */
  function index(model, comments) {
    const out = new Map();
    (comments || []).forEach((c) => {
      if (c.ModelId !== model.ModelId) { return; }
      const k = keyOf(model, c);
      (out.get(k) || out.set(k, []).get(k)).push(c);
    });
    return out;
  }

  return { keyOf, index };
});
