/**
 * Disaggregation (pure): the value a planner types into an aggregated cell is spread over the facts below it.
 *   SUM        proportional to the current values (equal parts when they add up to zero); rounding goes to the largest fact
 *   AVG MIN MAX every fact takes the typed value (so the cell shows exactly that)
 */
sap.ui.define([], function () {
  "use strict";

  const round = (v) => Math.round(v * 100) / 100;

  /** @returns {object[]} the facts whose value changes, with their new Value */
  function spread(aggregation, scopeFacts, target) {
    const t = round(target);
    if (!scopeFacts.length) { return []; }
    if (aggregation === "AVG" || aggregation === "MIN" || aggregation === "MAX") {
      return scopeFacts.filter((f) => f.Value !== t).map((f) => Object.assign({}, f, { Value: t }));
    }
    const sum = scopeFacts.reduce((a, f) => a + f.Value, 0);
    let values;
    if (sum === 0) {
      values = scopeFacts.map(() => round(t / scopeFacts.length));
    } else {
      values = scopeFacts.map((f) => round((f.Value * t) / sum));
    }
    const diff = round(t - values.reduce((a, b) => a + b, 0));
    if (diff !== 0) {
      let big = 0;
      scopeFacts.forEach((f, i) => { if (Math.abs(values[i]) > Math.abs(values[big])) { big = i; } });
      values[big] = round(values[big] + diff);
    }
    return scopeFacts.map((f, i) => (f.Value === values[i] ? null : Object.assign({}, f, { Value: values[i] }))).filter(Boolean);
  }

  return { spread, round };
});
