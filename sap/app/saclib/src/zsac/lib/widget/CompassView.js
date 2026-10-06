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
    const o = Object.assign({ w: 640, h: 260 }, opts);
    const main = results[0].result;
    if (!main || !main.bins.length) { return '<div class="zsacVMsg">Nothing to show: no valid result.</div>'; }
    const m = { l: 40, r: 12, t: 22, b: 26 };
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
        + '<text class="zsacSvgMuted" x="' + x(v).toFixed(1) + '" y="' + (o.h - 8) + '" text-anchor="middle">' + Format.compact(v) + "</text>";
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
        + '<text class="zsacSvgText" x="' + (x(main.baseline) + 4).toFixed(1) + '" y="' + (m.t + 10) + '">Baseline</text>';
    }
    if (results.length > 1) {
      out += '<g transform="translate(' + (o.w - m.r - 120) + ',' + (m.t + 4) + ')">' + results.map((r, i) => '<g transform="translate(0,' + (i * 14) + ')"><line class="zsacCpCurve' + (i ? " zsacCpOther zsacCpOther" + ((i - 1) % 3) : "") + '" x1="0" x2="16" y1="5" y2="5"/><text class="zsacSvgText" x="20" y="9">' + esc(Format.truncate(r.name, 14)) + "</text></g>").join("") + "</g>";
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" class="zsacSvg zsacCompassSvg" width="' + o.w + '" height="' + o.h + '" viewBox="0 0 ' + o.w + " " + o.h + '" role="img">' + out + "</svg>";
  }

  function casesHtml(r, unit) {
    if (!r.cases.length) { return ""; }
    return '<table class="zsacCpTable"><tr><th></th><th>Case</th><th>Probability</th><th>Target between</th></tr>'
      + r.cases.map((c) => '<tr><td><span class="zsacCpDot zsacCp-' + c.id + '"></span></td><td>' + esc(c.label) + "</td><td>" + pct(c.p) + "</td><td>" + esc(num(c.from, unit) + " to " + num(c.to, unit)) + "</td></tr>").join("") + "</table>";
  }

  /** The numbers: baseline, average, spread and the chance of reaching the baseline or a value of the planner's choice. */
  function statsHtml(r, unit, threshold) {
    if (!r.n) { return '<div class="zsacVMsg">Every iteration was invalid (a division by zero): check the ranges of the drivers.</div>'; }
    const cell = (cap, val, tip) => '<div title="' + esc(tip || "") + '"><span class="zsacVCap">' + esc(cap) + '</span><span class="zsacVBig">' + esc(val) + "</span></div>";
    let h = '<div class="zsacVSummary">' + cell("Baseline", num(r.baseline, unit), "The target with every driver at its booked value")
      + cell("Average of the simulation", num(r.mean, unit)) + cell("Spread (standard deviation)", num(r.sd, unit));
    if (r.baseline !== null) { h += cell("Chance of reaching the baseline or more", pct(r.probAtLeast(r.baseline)), "Share of the simulated results at or above the baseline"); }
    if (threshold !== undefined && threshold !== null && threshold !== "" && isFinite(Number(threshold))) { h += cell("Chance of reaching " + Format.compact(Number(threshold)) + " or more", pct(r.probAtLeast(Number(threshold)))); }
    h += "</div>";
    return h + (r.noRandomness ? '<div class="zsacVMsg">No driver has a range, so every result equals the baseline. Enter a minimum and a maximum for the drivers you are unsure about.</div>' : "")
      + (r.invalid ? '<div class="zsacVMsg">' + r.invalid + " of " + r.iterations + " iterations were left out (division by zero).</div>" : "");
  }

  function influenceHtml(r) {
    if (!r.influence.length) { return ""; }
    return '<div class="zsacCpInfl"><div class="zsacVCap">What moves the target</div>' + r.influence.map((i) =>
      '<div class="zsacVRow" title="' + esc("Correlation with the target: " + i.r.toFixed(2)) + '"><span class="zsacVLabel">' + esc(Format.truncate(i.label, 28)) + '</span><span class="zsacVBarWrap"><span class="zsacVBar ' + (i.r < 0 ? "zsacVb-bad" : "zsacVb-good") + '" style="width:' + Math.max(1, Math.round(i.share * 100)) + '%"></span></span><span class="zsacVNum">'
      + pct(i.share) + '</span><span class="zsacVShare">' + (i.r < 0 ? "lowers" : "raises") + "</span></div>").join("") + "</div>";
  }

  /** Inputs for min, max, distribution and on/off of every driver; data-d = driver id, data-f = field. */
  function driversHtml(drivers, settings, unit) {
    const val = (d, f) => { const s = (settings || {})[d.id]; return s && s[f] !== undefined && s[f] !== "" && s[f] !== null ? s[f] : (f === "min" || f === "max" ? (d[f] === null ? "" : Number(Number(d[f]).toPrecision(7))) : ""); };
    let h = '<table class="zsacCpDrivers"><tr><th>Driver</th><th>Baseline</th><th>Minimum</th><th>Maximum</th><th title="Or a share of the baseline: 10 fills 10% below and above">± %</th><th>Distribution</th><th>On</th></tr>';
    drivers.forEach((d) => {
      const on = (settings || {})[d.id] ? (settings[d.id].active !== false) : true;
      h += "<tr" + (d.valid ? "" : ' class="zsacCpBad" title="The minimum is above the maximum"') + "><td>" + esc(Format.truncate(d.label, 30)) + "</td><td>" + esc(num(d.baseline, unit)) + "</td>"
        + '<td><input type="number" step="any" data-d="' + esc(d.id) + '" data-f="min" value="' + esc(val(d, "min")) + '"></td>'
        + '<td><input type="number" step="any" data-d="' + esc(d.id) + '" data-f="max" value="' + esc(val(d, "max")) + '"></td>'
        + '<td><input type="number" step="any" min="0" data-d="' + esc(d.id) + '" data-f="pct" value=""></td>'
        + '<td><select data-d="' + esc(d.id) + '" data-f="dist"><option value="normal"' + (val(d, "dist") !== "uniform" && d.dist !== "uniform" ? " selected" : "") + '>Normal</option><option value="uniform"' + (val(d, "dist") === "uniform" || (!val(d, "dist") && d.dist === "uniform") ? " selected" : "") + ">Uniform</option></select></td>"
        + '<td><input type="checkbox" data-d="' + esc(d.id) + '" data-f="active"' + (on ? " checked" : "") + "></td></tr>";
    });
    return h + "</table>";
  }

  return { chartSvg, casesHtml, statsHtml, influenceHtml, driversHtml, pct };
});
