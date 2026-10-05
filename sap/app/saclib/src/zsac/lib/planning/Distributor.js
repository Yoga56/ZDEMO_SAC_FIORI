/**
 * Distribute Values (pure): split one value over a set of cells.
 *
 *   EQUAL         every cell the same share
 *   PROPORTIONAL  in proportion to the cells' current values (equal shares when they are all zero)
 *   REFERENCE     in proportion to reference values of the same cells, for example last year's actuals (equal when all zero)
 *
 * cells = [{ value: number|undefined, weight: number|undefined }]   weight is the reference value for REFERENCE
 * The shares add up to the value exactly (rounding to `decimals` places, the remainder goes to the heaviest cell).
 * With onlyEmpty, cells that already hold a non-zero value are skipped (their share is null).
 */
sap.ui.define([], function () {
  "use strict";

  function distribute(cells, total, opts) {
    const o = Object.assign({ method: "EQUAL", onlyEmpty: false, decimals: 2 }, opts);
    const f = Math.pow(10, o.decimals);
    const round = (v) => Math.round(v * f) / f;
    const shares = cells.map(() => null);
    const targets = [];
    cells.forEach((c, i) => { if (!o.onlyEmpty || !c.value) { targets.push(i); } });
    if (!targets.length) { return shares; }

    let weights = targets.map((i) => (o.method === "PROPORTIONAL" ? Math.abs(cells[i].value || 0) : o.method === "REFERENCE" ? Math.abs(cells[i].weight || 0) : 1));
    let sum = weights.reduce((a, b) => a + b, 0);
    if (sum === 0) { weights = targets.map(() => 1); sum = targets.length; }

    let given = 0;
    targets.forEach((i, k) => { shares[i] = round((total * weights[k]) / sum); given += shares[i]; });
    const rest = round(total - given);
    if (rest !== 0) {
      let heavy = 0;
      weights.forEach((w, k) => { if (w > weights[heavy]) { heavy = k; } });
      shares[targets[heavy]] = round(shares[targets[heavy]] + rest);
    }
    return shares;
  }

  return { distribute };
});
