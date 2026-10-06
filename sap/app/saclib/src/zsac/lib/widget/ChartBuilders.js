/**
 * SVG builders (pure functions returning markup) for the chart widgets: bar, line, donut, funnel, gauge, sankey.
 * Each takes (data, width, height) and returns an SVG string; colors come from CSS classes zsac-fill-N / zsac-stroke-N
 * which map to the theme's ordered chart colors. A VizFrame based widget can be registered under the same widget
 * types without touching anything else (see WidgetRegistry).
 */
sap.ui.define(["../core/Format", "../core/Treemap", "../core/GeoLocations"], function (Format, Treemap, GeoLocations) {
  "use strict";

  const { esc, compact, truncate, niceScale } = Format;
  const COLORS = 10;
  const fill = (i) => "zsac-fill-" + (i % COLORS);
  let gradientSeq = 0;
  const uid = () => "zg" + (++gradientSeq);

  /** A smooth curve through the points (monotone in x, so it never overshoots the data): the "d" of a path. */
  function smooth(pts) {
    const n = pts.length;
    if (n < 2) { return pts.length ? "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1) : ""; }
    const dx = []; const m = []; const t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0] || 1e-6; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) { t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]); }
    let d = "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
    for (let i = 0; i < n - 1; i++) {
      d += " C" + (pts[i][0] + dx[i] / 3).toFixed(1) + "," + (pts[i][1] + (t[i] * dx[i]) / 3).toFixed(1) + " " + (pts[i + 1][0] - dx[i] / 3).toFixed(1) + "," + (pts[i + 1][1] - (t[i + 1] * dx[i]) / 3).toFixed(1) + " " + pts[i + 1][0].toFixed(1) + "," + pts[i + 1][1].toFixed(1);
    }
    return d;
  }
  /** A vertical fade of the colour of series i, for the area under a line. */
  const gradient = (id, i, top) => '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="zsac-stop-' + (i % COLORS) + '" stop-opacity="' + (top || 0.38) + '"/><stop offset="1" class="zsac-stop-' + (i % COLORS) + '" stop-opacity="0.02"/></linearGradient>';
  const stroke = (i) => "zsac-stroke-" + (i % COLORS);
  const svg = (w, h, inner) => '<svg xmlns="http://www.w3.org/2000/svg" class="zsacSvg" width="' + w + '" height="' + h +
    '" viewBox="0 0 ' + w + " " + h + '" role="img">' + inner + "</svg>";
  const empty = (w, h, text) => svg(w, h, '<text class="zsacSvgMuted" x="' + w / 2 + '" y="' + h / 2 + '" text-anchor="middle">' + esc(text || "No data") + "</text>");

  function legend(names, w, y) {
    let x = 0;
    const items = names.map((n, i) => {
      const label = truncate(n, 18);
      const item = '<g transform="translate(' + x + ',0)"><rect class="' + fill(i) + '" width="10" height="10" rx="2"/><text class="zsacSvgText" x="14" y="9">' + esc(label) + "</text></g>";
      x += 14 + label.length * 6.4 + 14;
      return item;
    });
    const start = Math.max(8, (w - x) / 2);
    return '<g transform="translate(' + start + "," + y + ')">' + items.join("") + "</g>";
  }

  /** Axes + gridlines shared by bar and line. */
  function frame(data, w, h) {
    const multi = data.series.length > 1;
    const m = { l: 46, r: 10, t: multi ? 30 : 12, b: 38 };
    const max = Math.max.apply(null, [0].concat(data.series.map((s) => Math.max.apply(null, s.values.map((v) => Math.max(0, v))))));
    const min = Math.min.apply(null, [0].concat(data.series.map((s) => Math.min.apply(null, s.values))));
    const scale = niceScale(max, 4);
    const lo = min < 0 ? -niceScale(-min, 2).max : 0;
    const iw = w - m.l - m.r;
    const ih = h - m.t - m.b;
    const y = (v) => m.t + ih - ((v - lo) / (scale.max - lo)) * ih;
    let out = "";
    for (let v = lo; v <= scale.max + 1e-9; v += scale.step) {
      out += '<line class="zsacGrid" x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
        '<text class="zsacSvgMuted" x="' + (m.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + compact(v) + "</text>";
    }
    return { m, iw, ih, y, out, multi, lo };
  }

  function categoryLabels(cats, f, w, h, bandW) {
    const maxChars = Math.max(3, Math.floor(bandW / 6.2));
    const rotate = maxChars < 9 && cats.length > 6;
    return cats.map((c, i) => {
      const cx = f.m.l + bandW * i + bandW / 2;
      return rotate
        ? '<text class="zsacSvgMuted" transform="translate(' + cx + "," + (h - f.m.b + 14) + ') rotate(-35)" text-anchor="end">' + esc(truncate(c, 12)) + "</text>"
        : '<text class="zsacSvgMuted" x="' + cx + '" y="' + (h - f.m.b + 16) + '" text-anchor="middle">' + esc(truncate(c, maxChars)) + "</text>";
    }).join("");
  }

  /** Stacked bars need the axis to span the sums: frame() gets the stack totals as one series, and a second empty one so it leaves room for the legend. */
  function stackedFrame(data, w, h) {
    const totals = data.categories.map((c, i) => data.series.reduce((s, x) => s + Math.max(0, x.values[i] || 0), 0));
    return frame({ categories: data.categories, series: [{ name: "", values: totals }, { name: "", values: [] }] }, w, h);
  }

  function bar(data, w, h) {
    if (!data.categories.length) { return empty(w, h); }
    if (data.stacked && data.series.length > 1) { return stackedBar(data, w, h); }
    const f = frame(data, w, h);
    const band = f.iw / data.categories.length;
    const n = data.series.length;
    const bw = Math.max(3, Math.min(34, (band * 0.7) / n));
    const zero = f.y(0);
    let bars = "";
    data.categories.forEach((c, i) => {
      data.series.forEach((s, si) => {
        const v = s.values[i] || 0;
        const x = f.m.l + band * i + (band - bw * n) / 2 + bw * si;
        const y = Math.min(f.y(v), zero);
        bars += '<rect class="' + fill(si) + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw - 1).toFixed(1) + '" height="' +
          Math.max(0, Math.abs(zero - f.y(v))).toFixed(1) + '" rx="4"><title>' + esc(c + (n > 1 ? " / " + s.name : "") + ": " + Format.full(v)) + "</title></rect>";
      });
    });
    return svg(w, h, f.out + bars + categoryLabels(data.categories, f, w, h, band) +
      (f.multi ? legend(data.series.map((s) => s.name), w, 6) : ""));
  }

  function stackedBar(data, w, h) {
    const f = stackedFrame(data, w, h);
    const band = f.iw / data.categories.length;
    const bw = Math.max(4, Math.min(48, band * 0.6));
    let bars = "";
    data.categories.forEach((c, i) => {
      let top = f.y(0);
      data.series.forEach((s, si) => {
        const v = Math.max(0, s.values[i] || 0);
        if (!v) { return; }
        const hh = f.y(0) - f.y(v);
        top -= hh;
        bars += '<rect class="' + fill(si) + '" x="' + (f.m.l + band * i + (band - bw) / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, hh).toFixed(1) +
          '" rx="3"><title>' + esc(c + " / " + s.name + ": " + Format.full(v)) + "</title></rect>";
      });
    });
    return svg(w, h, f.out + bars + categoryLabels(data.categories, f, w, h, band) + legend(data.series.map((s) => s.name), w, 6));
  }

  /** Floating bars from step.start to step.end; a connector line joins each end to the next start. */
  function waterfall(data, w, h) {
    const steps = data.steps || [];
    if (!steps.length) { return empty(w, h); }
    const levels = steps.reduce((a, s) => a.concat([s.start, s.end]), [0]);
    const f = frame({ categories: steps.map((s) => s.label), series: [{ name: "", values: levels }] }, w, h);
    const band = f.iw / steps.length;
    const bw = Math.max(6, Math.min(48, band * 0.62));
    let out = f.out;
    steps.forEach((s, i) => {
      const x = f.m.l + band * i + (band - bw) / 2;
      const y0 = f.y(Math.max(s.start, s.end));
      const hh = Math.max(1, Math.abs(f.y(s.start) - f.y(s.end)));
      out += '<rect class="zsacWf-' + s.kind + '" x="' + x.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="3"><title>' +
        esc(s.label + ": " + (s.kind === "total" ? "" : s.delta >= 0 ? "+" : "-") + Format.full(Math.abs(s.delta))) + "</title></rect>";
      out += '<text class="zsacSvgText" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y0 - 4).toFixed(1) + '" text-anchor="middle">' + (s.kind === "total" ? "" : s.delta >= 0 ? "+" : "-") + compact(Math.abs(s.delta)) + "</text>";
      if (i < steps.length - 1) {
        const ly = f.y(s.end).toFixed(1);
        out += '<line class="zsacWfLink" x1="' + (x + bw).toFixed(1) + '" x2="' + (x + band).toFixed(1) + '" y1="' + ly + '" y2="' + ly + '"/>';
      }
    });
    return svg(w, h, out + categoryLabels(steps.map((s) => s.label), f, w, h, band));
  }

  /** The runs of a series that have a value (a gap in the data breaks the line). */
  function runsOf(values, x, y) {
    const runs = []; let run = [];
    values.forEach((v, i) => { if (v === null || v === undefined) { if (run.length) { runs.push(run); run = []; } } else { run.push([x(i), y(v), i]); } });
    if (run.length) { runs.push(run); }
    return runs;
  }

  function line(data, w, h) {
    if (!data.categories.length) { return empty(w, h); }
    const f = frame(data, w, h);
    const band = f.iw / data.categories.length;
    const base = f.y(Math.max(0, f.lo));
    const defs = []; let paths = ""; let dots = "";
    data.series.forEach((s, si) => {
      runsOf(s.values, (i) => f.m.l + band * i + band / 2, f.y).forEach((run) => {
        if (run.length > 1) {
          if (data.series.length === 1 || data.series.length === 2) {
            const id = uid(); defs.push(gradient(id, si, data.series.length === 1 ? 0.32 : 0.16));
            paths += '<path class="zsacArea" fill="url(#' + id + ')" d="' + smooth(run) + " L" + run[run.length - 1][0].toFixed(1) + "," + base.toFixed(1) + " L" + run[0][0].toFixed(1) + "," + base.toFixed(1) + ' Z"/>';
          }
          paths += '<path class="zsacLine ' + stroke(si) + '" fill="none" d="' + smooth(run) + '"/>';
        }
        dots += run.map((p) => '<circle class="zsacDot ' + stroke(si) + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5"><title>' +
          esc(data.categories[p[2]] + (data.series.length > 1 ? " / " + s.name : "") + ": " + Format.full(s.values[p[2]])) + "</title></circle>").join("");
      });
    });
    return svg(w, h, "<defs>" + defs.join("") + "</defs>" + f.out + paths + dots + categoryLabels(data.categories, f, w, h, band) +
      (f.multi ? legend(data.series.map((s) => s.name), w, 6) : ""));
  }

  /** Filled areas under smooth lines; stacked, the series add up and the axis reaches the sum. */
  function area(data, w, h) {
    if (!data.categories.length) { return empty(w, h); }
    const stacked = data.stacked && data.series.length > 1;
    const f = stacked ? stackedFrame(data, w, h) : frame(data, w, h);
    const band = f.iw / data.categories.length;
    const x = (i) => f.m.l + band * i + band / 2;
    const defs = []; let out = "";
    const lower = data.categories.map(() => 0);
    const order = data.series.map((s, i) => i);
    (stacked ? order : order.slice().reverse()).forEach((si) => {
      const s = data.series[si];
      const vals = s.values.map((v, i) => (v === null || v === undefined ? null : (stacked ? Math.max(0, v) + lower[i] : v)));
      const id = uid(); defs.push(gradient(id, si, stacked ? 0.55 : 0.4));
      runsOf(vals, x, f.y).forEach((run) => {
        const under = stacked ? run.map((p) => [p[0], f.y(lower[p[2]])]).reverse() : [[run[run.length - 1][0], f.y(0)], [run[0][0], f.y(0)]];
        out += '<path class="zsacArea" fill="url(#' + id + ')" d="' + smooth(run) + " L" + under.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" L") + ' Z"/>';
        out += '<path class="zsacLine ' + stroke(si) + '" fill="none" d="' + smooth(run) + '"/>';
        out += run.map((p) => '<circle class="zsacDot ' + stroke(si) + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5"><title>' +
          esc(data.categories[p[2]] + " / " + s.name + ": " + Format.full(s.values[p[2]])) + "</title></circle>").join("");
      });
      if (stacked) { vals.forEach((v, i) => { if (v !== null) { lower[i] = v; } }); }
    });
    return svg(w, h, "<defs>" + defs.join("") + "</defs>" + f.out + out + categoryLabels(data.categories, f, w, h, band) + (data.series.length > 1 ? legend(data.series.map((s) => s.name), w, 6) : ""));
  }

  function arc(cx, cy, r0, r1, a0, a1) {
    const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = p(r1, a0); const [x1, y1] = p(r1, a1); const [x2, y2] = p(r0, a1); const [x3, y3] = p(r0, a0);
    return "M" + x0 + "," + y0 + " A" + r1 + "," + r1 + " 0 " + large + " 1 " + x1 + "," + y1 +
      " L" + x2 + "," + y2 + " A" + r0 + "," + r0 + " 0 " + large + " 0 " + x3 + "," + y3 + " Z";
  }

  function donut(data, w, h) {
    const total = data.values.reduce((a, b) => a + Math.max(0, b), 0);
    if (!total) { return empty(w, h); }
    const side = w > 320;
    const size = side ? Math.min(h - 16, w * 0.5) : Math.min(w - 16, h - 70);
    const r1 = size / 2;
    const r0 = r1 * 0.66;
    const cx = side ? 8 + r1 : w / 2;
    const cy = side ? h / 2 : 8 + r1;
    let a = -Math.PI / 2;
    let out = "";
    data.values.forEach((v, i) => {
      if (v <= 0) { return; }
      const sweep = (v / total) * Math.PI * 2;
      const end = a + Math.min(sweep, Math.PI * 2 - 0.0001);
      out += '<path class="' + fill(i) + '" d="' + arc(cx, cy, r0, r1, a, end) + '"><title>' + esc(data.categories[i] + ": " + Format.full(v) + " (" + (v / total * 100).toFixed(1) + "%)") + "</title></path>";
      a += sweep;
    });
    out += '<text class="zsacSvgBig" x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle">' + compact(total) + "</text>"
      + '<text class="zsacSvgMuted" x="' + cx + '" y="' + (cy + 20) + '" text-anchor="middle">Total</text>';
    const rows = data.categories.slice(0, 8).map((c, i) => {
      const lx = side ? cx + r1 + 24 : 12 + (i % 2) * (w / 2);
      const ly = side ? Math.max(12, cy - Math.min(data.categories.length, 8) * 9) + i * 18 : cy + r1 + 22 + Math.floor(i / 2) * 16;
      return '<g transform="translate(' + lx + "," + ly + ')"><rect class="' + fill(i) + '" width="10" height="10" rx="2"/><text class="zsacSvgText" x="14" y="9">' +
        esc(truncate(c, side ? 22 : 14)) + " " + (data.values[i] / total * 100).toFixed(0) + "%</text></g>";
    }).join("");
    return svg(w, h, out + rows);
  }

  function funnel(data, w, h) {
    const items = data.categories.map((c, i) => ({ c, v: Math.max(0, data.values[i] || 0) })).sort((a, b) => b.v - a.v);
    const top = items.length ? items[0].v : 0;
    if (!top) { return empty(w, h); }
    const gap = 4;
    const bh = (h - 16 - gap * (items.length - 1)) / items.length;
    const maxW = w - 16;
    let out = "";
    items.forEach((it, i) => {
      const next = items[i + 1] ? items[i + 1].v : it.v * 0.7;
      const w0 = (it.v / top) * maxW;
      const w1 = (next / top) * maxW;
      const y = 8 + i * (bh + gap);
      const x0 = (w - w0) / 2; const x1 = (w - w1) / 2;
      out += '<path class="' + fill(i) + '" d="M' + x0 + "," + y + " L" + (x0 + w0) + "," + y + " L" + (x1 + w1) + "," + (y + bh) + " L" + x1 + "," + (y + bh) +
        ' Z"><title>' + esc(it.c + ": " + Format.full(it.v) + " (" + (it.v / top * 100).toFixed(0) + "% of top)") + "</title></path>" +
        '<text class="zsacSvgOnColor" x="' + w / 2 + '" y="' + (y + bh / 2 + 4) + '" text-anchor="middle">' + esc(truncate(it.c, 22)) + " " + compact(it.v) + "</text>";
    });
    return svg(w, h, out);
  }

  function gauge(data, w, h) {
    const max = Number(data.max) || 0;
    const pct = max > 0 ? Math.max(0, data.value / max) : 0;
    const r1 = Math.min(w / 2 - 10, h - 34);
    const r0 = r1 * 0.74;
    const cx = w / 2; const cy = Math.min(h - 22, r1 + 12);
    const a1 = Math.PI + Math.PI * Math.min(pct, 1);
    const cls = pct >= 1 ? "zsac-good" : pct >= 0.85 ? "zsac-warn" : "zsac-bad";
    return svg(w, h,
      '<path class="zsacGaugeBg" d="' + arc(cx, cy, r0, r1, Math.PI, Math.PI * 2 - 0.0001) + '"/>' +
      (pct > 0 ? '<path class="' + cls + '" d="' + arc(cx, cy, r0, r1, Math.PI, Math.max(a1, Math.PI + 0.001)) + '"><title>' + esc(Format.full(data.value) + " of " + Format.full(max)) + "</title></path>" : "") +
      // no target: a percentage of nothing says nothing, show the value and what to set
      '<text class="zsacSvgBig" x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle">' + (max > 0 ? (pct * 100).toFixed(0) + "%" : esc(compact(data.value))) + "</text>" +
      '<text class="zsacSvgMuted" x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle">' + (max > 0 ? esc(data.label || (compact(data.value) + " of " + compact(max))) : "No target set") + "</text>");
  }

  const hex = (n) => ("0" + Math.round(n).toString(16)).slice(-2);
  const mix = (a, b, t) => "#" + [0, 2, 4].map((i) => hex(parseInt(a.substr(1 + i, 2), 16) * (1 - t) + parseInt(b.substr(1 + i, 2), 16) * t)).join("");
  const dark = (c) => (0.299 * parseInt(c.substr(1, 2), 16) + 0.587 * parseInt(c.substr(3, 2), 16) + 0.114 * parseInt(c.substr(5, 2), 16)) < 150;

  /** Colour of a heatmap cell: light to blue; when the data has negatives, red below zero and blue above, white at zero. */
  function heatColor(v, min, max) {
    if (v === null || v === undefined) { return "#f5f6f7"; }
    if (min < 0 && max > 0) { return v < 0 ? mix("#ffffff", "#bb0000", Math.min(1, v / min)) : mix("#ffffff", "#0a4a96", Math.min(1, v / max)); }
    const span = max - min;
    return mix("#eaf3fc", "#0a4a96", span ? (v - min) / span : 1);
  }

  function heatmap(data, w, h) {
    if (!data.rows.length || !data.cols.length) { return empty(w, h); }
    const lw = Math.min(130, Math.max(50, Math.max.apply(null, data.rows.map((r) => r.length)) * 6.4));
    const m = { l: lw + 8, t: 30, r: 8, b: 8 };
    const cw = (w - m.l - m.r) / data.cols.length; const ch = (h - m.t - m.b) / data.rows.length;
    let out = "";
    data.cols.forEach((c, j) => { out += '<text class="zsacSvgMuted" x="' + (m.l + cw * j + cw / 2).toFixed(1) + '" y="' + (m.t - 8) + '" text-anchor="middle">' + esc(truncate(c, Math.max(3, Math.floor(cw / 6.2)))) + "</text>"; });
    data.rows.forEach((r, i) => {
      out += '<text class="zsacSvgMuted" x="' + (m.l - 6) + '" y="' + (m.t + ch * i + ch / 2 + 4).toFixed(1) + '" text-anchor="end">' + esc(truncate(r, Math.floor(lw / 6.2))) + "</text>";
      data.cols.forEach((c, j) => {
        const v = data.cells[i][j]; const col = heatColor(v, data.min, data.max);
        out += '<rect class="zsacHeat" x="' + (m.l + cw * j).toFixed(1) + '" y="' + (m.t + ch * i).toFixed(1) + '" width="' + Math.max(0, cw - 1).toFixed(1) + '" height="' + Math.max(0, ch - 1).toFixed(1) + '" fill="' + col + '"><title>' +
          esc(r + " / " + c + ": " + (v === null ? "no data" : Format.full(v))) + "</title></rect>";
        if (v !== null && cw > 38 && ch > 16) {
          out += '<text x="' + (m.l + cw * j + cw / 2).toFixed(1) + '" y="' + (m.t + ch * i + ch / 2 + 4).toFixed(1) + '" text-anchor="middle" font-size="11" fill="' + (dark(col) ? "#ffffff" : "#1d2d3e") + '">' + compact(v) + "</text>";
        }
      });
    });
    return svg(w, h, out);
  }

  function treemap(data, w, h) {
    const flat = !data.groups.length;
    if (flat && !data.items.length) { return empty(w, h, "Nothing above zero to show"); }
    const note = data.skipped ? '<text class="zsacSvgMuted" x="' + (w - 4) + '" y="' + (h - 4) + '" text-anchor="end">' + data.skipped + " value(s) of zero or less left out</text>" : "";
    const box = (r, i, labelText, value, pad) => '<rect class="' + fill(i) + ' zsacTile" x="' + (r.x + pad).toFixed(1) + '" y="' + (r.y + pad).toFixed(1) + '" width="' + Math.max(0, r.w - 2 * pad).toFixed(1) + '" height="' + Math.max(0, r.h - 2 * pad).toFixed(1) +
      '" rx="2"><title>' + esc(labelText + ": " + Format.full(value)) + "</title></rect>";
    const tag = (r, labelText, value, pad) => {
      if (r.w < 46 || r.h < 20) { return ""; }
      return '<text class="zsacTileText" x="' + (r.x + pad + 5).toFixed(1) + '" y="' + (r.y + pad + 15).toFixed(1) + '">' + esc(truncate(labelText, Math.floor((r.w - 12) / 6.2))) + "</text>"
        + (r.h > 38 ? '<text class="zsacTileText zsacTileValue" x="' + (r.x + pad + 5).toFixed(1) + '" y="' + (r.y + pad + 30).toFixed(1) + '">' + compact(value) + "</text>" : "");
    };
    let out = "";
    if (flat) {
      Treemap.layout(data.items, 0, 0, w, h).forEach((r, i) => { out += box(r, i, r.item.label, r.item.value, 1) + tag(r, r.item.label, r.item.value, 1); });
    } else {
      Treemap.nest(data.groups, w, h, 3, 20).forEach((g, gi) => {
        out += '<rect class="' + fill(gi) + ' zsacTileGroup" x="' + g.x.toFixed(1) + '" y="' + g.y.toFixed(1) + '" width="' + Math.max(0, g.w - 1).toFixed(1) + '" height="' + Math.max(0, g.h - 1).toFixed(1) + '" rx="3"/>';
        if (g.w > 40) { out += '<text class="zsacTileText" x="' + (g.x + 6).toFixed(1) + '" y="' + (g.y + 14).toFixed(1) + '">' + esc(truncate(g.group.label, Math.floor((g.w - 12) / 6.2))) + "</text>"; }
        g.children.forEach((r) => { out += '<rect class="zsacTileLeaf" x="' + (r.x + 1).toFixed(1) + '" y="' + (r.y + 1).toFixed(1) + '" width="' + Math.max(0, r.w - 2).toFixed(1) + '" height="' + Math.max(0, r.h - 2).toFixed(1) + '" rx="2"><title>' +
          esc(g.group.label + " / " + r.item.label + ": " + Format.full(r.item.value)) + "</title></rect>" + tag(r, r.item.label, r.item.value, 1); });
      });
    }
    return svg(w, h, out + note);
  }

  function geomap(data, w, h) {
    const mw = Math.min(w, h * 2); const mh = mw / 2; const ox = (w - mw) / 2; const oy = (h - mh) / 2;
    let out = '<rect class="zsacGeoSea" x="' + ox.toFixed(1) + '" y="' + oy.toFixed(1) + '" width="' + mw.toFixed(1) + '" height="' + mh.toFixed(1) + '" rx="4"/>';
    GeoLocations.WORLD.forEach((poly) => {
      out += '<polygon class="zsacGeoLand" points="' + poly.map((pt) => { const q = GeoLocations.project(pt[1], pt[0], mw, mh); return (ox + q.x).toFixed(1) + "," + (oy + q.y).toFixed(1); }).join(" ") + '"/>';
    });
    const max = Math.max.apply(null, [1e-9].concat(data.points.map((p) => Math.abs(p.value))));
    data.points.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).forEach((p, i) => {
      const q = GeoLocations.project(p.lat, p.lon, mw, mh);
      const r = 5 + (mh / 9) * Math.sqrt(Math.abs(p.value) / max);
      out += '<circle class="zsacGeoBubble ' + (p.value < 0 ? "zsacGeoNeg" : "") + '" cx="' + (ox + q.x).toFixed(1) + '" cy="' + (oy + q.y).toFixed(1) + '" r="' + r.toFixed(1) + '"><title>' + esc(p.label + ": " + Format.full(p.value)) + "</title></circle>";
      if (i < 6) { out += '<text class="zsacSvgText" x="' + (ox + q.x).toFixed(1) + '" y="' + (oy + q.y + 4).toFixed(1) + '" text-anchor="middle" font-size="11">' + esc(truncate(p.label, 12)) + "</text>"; }
    });
    if (data.unplaced.length) { out += '<text class="zsacSvgMuted" x="' + (w - 4) + '" y="' + (h - 4) + '" text-anchor="end">Not placed: ' + esc(truncate(data.unplaced.join(", "), 60)) + "</text>"; }
    return svg(w, h, out);
  }

  /** Nodes in columns, one per stage (side = the stage, 0 first); links join neighbouring stages. Two stages is the classic form. */
  function sankey(data, w, h) {
    const nodes = data.nodes;
    const links = data.links.filter((l) => l.value > 0);
    if (!nodes.length || !links.length) { return empty(w, h); }
    const levels = Math.max.apply(null, nodes.map((n) => n.side)) + 1;
    const padX = levels > 2 ? 70 : 90; const nodeW = 12; const gap = 8; const top = 8;
    const sides = []; for (let i = 0; i < levels; i++) { sides.push(nodes.filter((n) => n.side === i)); }
    const totals = new Map(nodes.map((n) => [n.id, 0]));
    // what flows through a node: the larger of what comes in and what goes out
    const inflow = new Map(); const outflow = new Map();
    links.forEach((l) => { outflow.set(l.source, (outflow.get(l.source) || 0) + l.value); inflow.set(l.target, (inflow.get(l.target) || 0) + l.value); });
    nodes.forEach((n) => totals.set(n.id, Math.max(inflow.get(n.id) || 0, outflow.get(n.id) || 0)));
    const avail = h - top * 2;
    const scale = Math.min.apply(null, sides.filter((col) => col.length).map((col) => {
      const sum = col.reduce((a, n) => a + totals.get(n.id), 0);
      return sum > 0 ? (avail - gap * (col.length - 1)) / sum : Infinity;
    }));
    const step = levels > 1 ? (w - padX * 2 - nodeW) / (levels - 1) : 0;
    const pos = new Map();
    sides.forEach((col, s) => {
      let y = top;
      const used = col.reduce((a, n) => a + Math.max(2, totals.get(n.id) * scale), 0) + gap * Math.max(0, col.length - 1);
      y += Math.max(0, (avail - used) / 2);     // each stage is centred, so the flow bends gently
      col.forEach((n) => {
        const hh = Math.max(2, totals.get(n.id) * scale);
        pos.set(n.id, { x: padX + step * s, y, h: hh, usedOut: 0, usedIn: 0, side: s });
        y += hh + gap;
      });
    });
    const index = new Map(); sides.forEach((col) => col.forEach((n, i) => index.set(n.id, i)));
    let out = "";
    links.slice().sort((a, b) => b.value - a.value).forEach((l) => {
      const s = pos.get(l.source); const t = pos.get(l.target);
      const lh = Math.max(1, l.value * scale);
      const sy = s.y + s.usedOut + lh / 2; const ty = t.y + t.usedIn + lh / 2;
      s.usedOut += lh; t.usedIn += lh;
      const x0 = s.x + nodeW; const x1 = t.x; const mx = (x0 + x1) / 2;
      out += '<path class="zsacLink ' + stroke(index.get(l.source) || 0) + '" fill="none" stroke-width="' + lh.toFixed(1) + '" d="M' + x0 + "," + sy + " C" + mx + "," + sy + " " + mx + "," + ty + " " + x1 + "," + ty + '"><title>' +
        esc(l.sourceLabel + " to " + l.targetLabel + ": " + Format.full(l.value)) + "</title></path>";
    });
    nodes.forEach((n) => {
      const p = pos.get(n.id);
      const left = p.side === 0;
      const last = p.side === levels - 1;
      const room = left ? padX - 12 : last ? padX - 12 : step - nodeW - 10;
      const chars = Math.max(4, Math.floor(room / 6.2));
      out += '<rect class="' + (left ? fill(index.get(n.id) || 0) : "zsacNode") + '" x="' + p.x + '" y="' + p.y + '" width="' + nodeW + '" height="' + p.h + '" rx="3"/>' +
        '<text class="zsacSvgText zsacSankeyLbl" x="' + (left ? p.x - 6 : p.x + nodeW + 6) + '" y="' + (p.y + p.h / 2 + 4) + '" text-anchor="' + (left ? "end" : "start") + '">' + esc(truncate(n.label, chars)) + "</text>";
    });
    return svg(w, h, out);
  }

  return { bar, line, area, smooth, donut, funnel, gauge, sankey, waterfall, heatmap, treemap, geomap, heatColor, empty };
});
