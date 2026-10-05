/**
 * Statistical forecast of a monthly series (pure). Not Smart Predict: plain time series methods that a planner can follow.
 *
 *   LINEAR            straight line through the observed months (least squares), continued
 *   MOVING_AVERAGE    average of the last `window` observed months, flat
 *   EXP_SMOOTHING     simple exponential smoothing with `alpha`, flat
 *   SEASONAL_NAIVE    the value of the same month a year earlier
 *
 * history = array aligned to the months of the history range, undefined/null where there is no fact.
 * forecast(history, offsets, method, opts) -> numbers for the months that are `offsets[i]` steps after the last history month (1 = the next one),
 * or null where the method cannot say (too little history).
 */
sap.ui.define([], function () {
  "use strict";

  const METHODS = {
    LINEAR: "Linear trend",
    MOVING_AVERAGE: "Moving average",
    EXP_SMOOTHING: "Exponential smoothing",
    SEASONAL_NAIVE: "Same month last year"
  };
  const round = (v) => Math.round(v * 100) / 100;
  const observed = (h) => h.map((v, t) => [t, v]).filter(([, v]) => v !== undefined && v !== null && Number.isFinite(v));

  function forecast(history, offsets, method, opts) {
    const o = Object.assign({ window: 3, alpha: 0.3 }, opts);
    const obs = observed(history);
    const n = history.length;
    if (!obs.length) { return offsets.map(() => null); }
    switch (method) {
      case "LINEAR": {
        if (obs.length < 2) { return offsets.map(() => null); }
        const mt = obs.reduce((s, [t]) => s + t, 0) / obs.length;
        const my = obs.reduce((s, [, y]) => s + y, 0) / obs.length;
        const sxx = obs.reduce((s, [t]) => s + (t - mt) * (t - mt), 0);
        const slope = sxx === 0 ? 0 : obs.reduce((s, [t, y]) => s + (t - mt) * (y - my), 0) / sxx;
        return offsets.map((k) => round(my + slope * (n - 1 + k - mt)));
      }
      case "MOVING_AVERAGE": {
        const last = obs.slice(-Math.max(1, Math.floor(o.window)));
        const avg = round(last.reduce((s, [, y]) => s + y, 0) / last.length);
        return offsets.map(() => avg);
      }
      case "EXP_SMOOTHING": {
        let level = obs[0][1];
        obs.slice(1).forEach(([, y]) => { level = o.alpha * y + (1 - o.alpha) * level; });
        return offsets.map(() => round(level));
      }
      case "SEASONAL_NAIVE":
        return offsets.map((k) => {
          // the same month of the latest year that has data: step back whole years from n - 1 + k
          let t = n - 1 + k - 12;
          while (t >= n) { t -= 12; }
          const v = t >= 0 ? history[t] : undefined;
          return v === undefined || v === null ? null : round(v);
        });
      default:
        throw new Error("Unknown forecast method " + method);
    }
  }

  /** Months held back for a back-test: a quarter of the history, between 1 and 3. */
  const holdoutFor = (n) => Math.max(1, Math.min(3, Math.floor(n / 4)));

  /**
   * Back-test of a method on one series: forecast the last `holdout` months from the months before them and compare with what happened.
   * @returns {{abs:number, actual:number, n:number}|null} summed absolute error, summed absolute actuals, months compared; null when the series is too short
   */
  function backtest(history, method, opts, holdout) {
    const n = history.length;
    const h = holdout || holdoutFor(n);
    const train = history.slice(0, n - h);
    if (observed(train).length < 2) { return null; }
    const predicted = forecast(train, Array.from({ length: h }, (_, i) => i + 1), method, opts);
    let abs = 0; let actual = 0; let count = 0;
    predicted.forEach((p, i) => {
      const a = history[n - h + i];
      if (p === null || a === undefined || a === null || !Number.isFinite(a)) { return; }
      abs += Math.abs(p - a); actual += Math.abs(a); count++;
    });
    return count ? { abs, actual, n: count } : null;
  }

  return { METHODS, forecast, backtest, holdoutFor };
});
