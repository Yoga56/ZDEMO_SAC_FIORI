/** Number and text helpers shared by widgets (pure). */
sap.ui.define([], function () {
  "use strict";

  const esc = (s) => String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /** 1234567 -> "1.23M", 1500 -> "1.5k"; small numbers keep their decimals. */
  function compact(v) {
    const n = Number(v) || 0;
    const a = Math.abs(n);
    if (a >= 1e9) { return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B"; }
    if (a >= 1e6) { return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M"; }
    if (a >= 1e3) { return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k"; }
    return a >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
  }

  function full(v, decimals) {
    const n = Number(v) || 0;
    const d = decimals === undefined ? 0 : decimals;
    return n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function percent(v, decimals) { return (Number(v) || 0).toFixed(decimals === undefined ? 1 : decimals) + "%"; }

  function truncate(s, max) {
    s = String(s);
    return s.length > max ? s.slice(0, Math.max(1, max - 1)) + "…" : s;
  }

  /** "Nice" axis maximum and tick step for 0..max. */
  function niceScale(max, ticks) {
    const n = ticks || 4;
    if (!(max > 0)) { return { max: 1, step: 0.25 }; }
    const raw = max / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    return { max: step * Math.ceil(max / step), step };
  }

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /** Member of the Date dimension for display: "2026" > "Q1 2026" > "Mar 2026"; anything else unchanged. */
  function period(id) {
    const s = String(id);
    let m = /^(\d{4})-Q([1-4])$/.exec(s);
    if (m) { return "Q" + m[2] + " " + m[1]; }
    m = /^(\d{4})-(\d{2})$/.exec(s);
    if (m && +m[2] >= 1 && +m[2] <= 12) { return MONTHS[+m[2] - 1] + " " + m[1]; }
    return s;
  }

  return { esc, compact, full, percent, truncate, niceScale, period };
});
