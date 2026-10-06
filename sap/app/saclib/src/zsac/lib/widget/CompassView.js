/**
 * HTML and SVG for a Compass simulation (see core/Compass): the probability curve with its three cases, the numbers, the
 * drivers table and the influence of each driver. Plain strings so a test can check them.
 */
sap.ui.define(["../core/Format"], function (Format) {
  "use strict";

  const esc = Format.esc;
  const num = (v, unit) => (v === null || v === undefined ? "n/a" : Format.compact(v) + (unit ? " " + unit : ""));
  const pct = (p) => (p * 100 >= 10 || p === 0 ? (p * 100).toFixed(0) : (p * 100).toFixed(1)) + "%";

  /**
   * The curve of the first result with the area of each case under it, a line for each case boundary and for the baseline; further
   * results (other scenarios) as dashed curves. results = [{ name, result }]
   */
  function chartSvg(results, opts) {
    const o = Object.assign({ w: 640, h: 230 }, opts);
    const main = results[0].result;
    if (!main || !main.bins.length) { return '<div class="zsacVMsg">Nothing to show: no valid result.</div>'; }
    const m = { l: 12, r: 12, t: 24, b: 24 };
    const iw = o.w - m.l - m.r; const ih = o.h - m.t - m.b;
    const lo = Math.min.apply(null, results.map((r) => r.result.min)); const hi = Math.max.apply(null, results.map((r) => r.result.max));
    const span = hi - lo || 1;
    const maxP = Math.max.apply(null, results.map((r) => Math.max.apply(null, r.result.curve))) || 1;
    const x = (v) => m.l + ((v - lo) / span) * iw;
    const y = (p) => m.t + ih - (p / maxP) * ih;
    const center = (b) => (b.from + b.to) / 2;
    let out = "";
    for (let i = 0; i <= 4; i++) {
      const v = lo + (span * i) / 4;
      out += '<line class="zsacGrid" x1="' + x(v).toFixed(1) + '" x2="' + x(v).toFixed(1) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '"/>'
        + '<text class="zsacSvgMuted" x="' + Math.min(o.w - 14, Math.max(14, x(v))).toFixed(1) + '" y="' + (o.h - 7) + '" text-anchor="middle">' + Format.compact(v) + "</text>";
    }
    out += '<line class="zsacAxis" x1="' + m.l + '" x2="' + (o.w - m.r) + '" y1="' + (m.t + ih) + '" y2="' + (m.t + ih) + '"/>';
    main.cases.forEach((c) => {
      const pts = main.bins.map((b, i) => ({ cx: center(b), p: main.curve[i] })).filter((q) => q.cx >= c.from && q.cx <= c.to);
      if (!pts.length) { return; }
      const d = "M" + x(c.from).toFixed(1) + "," + y(0).toFixed(1) + pts.map((q) => " L" + x(q.cx).toFixed(1) + "," + y(q.p).toFixed(1)).join("") + " L" + x(c.to).toFixed(1) + "," + y(0).toFixed(1) + " Z";
      out += '<path class="zsacCp zsacCp-' + c.id + '" d="' + d + '"><title>' + esc(c.label + ": " + pct(c.p) + ", " + num(c.from) + " to " + num(c.to)) + "</title></path>";
    });
    const line = (r, cls) => '<path class="' + cls + '" fill="none" d="' + r.bins.map((b, i) => (i ? "L" : "M") + x(center(b)).toFixed(1) + "," + y(r.curve[i]).toFixed(1)).join(" ") + '"/>';
    out += line(main, "zsacCpCurve");
    results.slice(1).forEach((r, i) => { if (r.result && r.result.bins.length) { out += line(r.result, "zsacCpCurve zsacCpOther zsacCpOther" + (i % 3)); } });
    main.cases.slice(0, 2).forEach((c) => {
      out += '<line class="zsacCpBound" x1="' + x(c.to).toFixed(1) + '" x2="' + x(c.to).toFixed(1) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '"/>'
        + '<text class="zsacSvgMuted" x="' + x(c.to).toFixed(1) + '" y="' + (m.t - 6) + '" text-anchor="middle">' + Format.compact(c.to) + "</text>";
    });
    if (main.baseline !== null && main.baseline >= lo && main.baseline <= hi) {
      out += '<line class="zsacCpBase" x1="' + x(main.baseline).toFixed(1) + '" x2="' + x(main.baseline).toFixed(1) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '"><title>Baseline ' + esc(num(main.baseline)) + "</title></line>"
        + '<text class="zsacSvgText zsacCpBaseLbl" x="' + (x(main.baseline) + 5).toFixed(1) + '" y="' + (m.t + 8) + '">Baseline</text>';
    }
    if (results.length > 1) {
      out += '<g transform="translate(' + (o.w - m.r - 120) + ',' + (m.t + 4) + ')">' + results.map((r, i) => '<g transform="translate(0,' + (i * 14) + ')"><line class="zsacCpCurve' + (i ? " zsacCpOther zsacCpOther" + ((i - 1) % 3) : "") + '" x1="0" x2="16" y1="5" y2="5"/><text class="zsacSvgText" x="20" y="9">' + esc(Format.truncate(r.name, 14)) + "</text></g>").join("") + "</g>";
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" class="zsacSvg zsacCompassSvg" width="' + o.w + '" height="' + o.h + '" style="max-width:100%;height:auto" viewBox="0 0 ' + o.w + " " + o.h + '" role="img">' + out + "</svg>";
  }

  function casesHtml(r, unit) {
    if (!r.cases.length) { return ""; }
    return '<div class="zsacCpCases">' + r.cases.map((c) => '<div class="zsacCpCase zsacCpCase-' + c.id + '" title="' + esc(c.label + ": " + pct(c.p) + " of the results") + '"><span class="zsacCpCaseHead"><span class="zsacCpDot zsacCp-' + c.id + '"></span>' + esc(c.label.replace(/ case$/i, "")) + '</span><span class="zsacCpCaseP">' + pct(c.p) + '</span><span class="zsacCpCaseR">' + esc(num(c.from, unit) + " \u2013 " + num(c.to, unit)) + "</span></div>").join("") + "</div>";
  }

  /** The numbers: baseline, average, spread and the chance of reaching the baseline or a value of the planner's choice. */
  function statsHtml(r, unit, threshold, extra) {
    if (!r.n) { return '<div class="zsacVMsg">Every iteration was invalid (a division by zero): check the ranges of the drivers.</div>'; }
    const cell = (cap, val, tip) => '<div class="zsacCpKpi" title="' + esc(tip || "") + '"><span class="zsacVCap">' + esc(cap) + '</span><span class="zsacCpKpiV">' + esc(val) + "</span></div>";
    let h = '<div class="zsacCpKpis">' + cell("Baseline", num(r.baseline, unit), "The target with every driver at its booked value")
      + cell("Average of the simulation", num(r.mean, unit)) + cell("Spread (standard deviation)", num(r.sd, unit));
    if (r.baseline !== null) { h += cell("Chance of reaching the baseline or more", pct(r.probAtLeast(r.baseline)), "Share of the simulated results at or above the baseline"); }
    if (threshold !== undefined && threshold !== null && threshold !== "" && isFinite(Number(threshold))) { h += cell("Chance of reaching " + Format.compact(Number(threshold)) + " or more", pct(r.probAtLeast(Number(threshold)))); }
    h += (extra || "") + "</div>";
    return h + (r.noRandomness ? '<div class="zsacVMsg">No driver has a range, so every result equals the baseline. Enter a minimum and a maximum for the drivers you are unsure about.</div>' : "")
      + (r.invalid ? '<div class="zsacVMsg">' + r.invalid + " of " + r.iterations + " iterations were left out (division by zero).</div>" : "");
  }

  function influenceHtml(r) {
    if (!r.influence.length) { return ""; }
    return '<div class="zsacCpInfl"><div class="zsacCpH">What moves the target</div>' + r.influence.map((i) =>
      '<div class="zsacVRow zsacCpIRow" title="' + esc("Correlation with the target: " + i.r.toFixed(2)) + '"><span class="zsacVLabel">' + esc(Format.truncate(i.label, 28)) + '</span><span class="zsacVBarWrap"><span class="zsacVBar ' + (i.r < 0 ? "zsacVb-bad" : "zsacVb-good") + '" style="width:' + Math.max(1, Math.round(i.share * 100)) + '%"></span></span><span class="zsacVNum">'
      + pct(i.share) + '</span><span class="zsacVShare">' + (i.r < 0 ? "lowers" : "raises") + "</span></div>").join("") + "</div>";
  }

  /** Inputs for min, max, distribution and on/off of every driver; data-d = driver id, data-f = field. */
  function driversHtml(drivers, settings, unit) {
    const val = (d, f) => { const s = (settings || {})[d.id]; return s && s[f] !== undefined && s[f] !== "" && s[f] !== null ? s[f] : (f === "min" || f === "max" ? (d[f] === null ? "" : Number(Number(d[f]).toPrecision(7))) : ""); };
    let h = '<div class="zsacCpDGrid"><div class="zsacCpDHead"></div><div class="zsacCpDHead">Driver</div><div class="zsacCpDHead zsacCpR">Baseline</div><div class="zsacCpDHead zsacCpR">Minimum</div><div class="zsacCpDHead zsacCpR">Maximum</div>'
      + '<div class="zsacCpDHead zsacCpR" title="Or a share of the baseline: 10 fills 10% below and above">\u00b1 %</div><div class="zsacCpDHead">Distribution</div>';
    drivers.forEach((d) => {
      const on = (settings || {})[d.id] ? (settings[d.id].active !== false) : true;
      const uniform = val(d, "dist") === "uniform" || (!val(d, "dist") && d.dist === "uniform");
      h += '<div class="zsacCpDRow' + (d.valid ? "" : " zsacCpBad") + (on ? "" : " zsacCpOff") + '"' + (d.valid ? "" : ' title="The minimum is above the maximum"') + ">"
        + '<label class="zsacCpOn" title="Include this driver in the simulation"><input type="checkbox" data-d="' + esc(d.id) + '" data-f="active"' + (on ? " checked" : "") + "></label>"
        + '<div class="zsacCpName" title="' + esc(d.label) + '">' + esc(Format.truncate(d.label, 30)) + '</div><div class="zsacCpR zsacCpBase">' + esc(num(d.baseline, unit)) + "</div>"
        + '<input type="number" step="any" data-d="' + esc(d.id) + '" data-f="min" value="' + esc(val(d, "min")) + '" placeholder="\u2013">'
        + '<input type="number" step="any" data-d="' + esc(d.id) + '" data-f="max" value="' + esc(val(d, "max")) + '" placeholder="\u2013">'
        + '<input type="number" step="any" min="0" data-d="' + esc(d.id) + '" data-f="pct" value="" placeholder="%">'
        + '<select data-d="' + esc(d.id) + '" data-f="dist"><option value="normal"' + (uniform ? "" : " selected") + '>Normal</option><option value="uniform"' + (uniform ? " selected" : "") + ">Uniform</option></select></div>";
    });
    return h + "</div>";
  }

  return { chartSvg, casesHtml, statsHtml, influenceHtml, driversHtml, pct };
});
