/**
 * SVG builders (pure functions returning markup) for the chart widgets: bar, line, donut, funnel, gauge, sankey.
 * Each takes (data, width, height) and returns an SVG string; colors come from CSS classes zsac-fill-N / zsac-stroke-N
 * which map to the theme's ordered chart colors. A VizFrame based widget can be registered under the same widget
 * types without touching anything else (see WidgetRegistry).
 */
sap.ui.define(["../core/Format"], function (Format) {
  "use strict";

  const { esc, compact, truncate, niceScale } = Format;
  const COLORS = 10;
  const fill = (i) => "zsac-fill-" + (i % COLORS);
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
          Math.max(0, Math.abs(zero - f.y(v))).toFixed(1) + '" rx="2"><title>' + esc(c + (n > 1 ? " / " + s.name : "") + ": " + Format.full(v)) + "</title></rect>";
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
          '"><title>' + esc(c + " / " + s.name + ": " + Format.full(v)) + "</title></rect>";
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
      out += '<rect class="zsacWf-' + s.kind + '" x="' + x.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="2"><title>' +
        esc(s.label + ": " + (s.kind === "total" ? "" : s.delta >= 0 ? "+" : "-") + Format.full(Math.abs(s.delta))) + "</title></rect>";
      out += '<text class="zsacSvgText" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y0 - 4).toFixed(1) + '" text-anchor="middle">' + (s.kind === "total" ? "" : s.delta >= 0 ? "+" : "-") + compact(Math.abs(s.delta)) + "</text>";
      if (i < steps.length - 1) {
        const ly = f.y(s.end).toFixed(1);
        out += '<line class="zsacWfLink" x1="' + (x + bw).toFixed(1) + '" x2="' + (x + band).toFixed(1) + '" y1="' + ly + '" y2="' + ly + '"/>';
      }
    });
    return svg(w, h, out + categoryLabels(steps.map((s) => s.label), f, w, h, band));
  }

  function line(data, w, h) {
    if (!data.categories.length) { return empty(w, h); }
    const f = frame(data, w, h);
    const band = f.iw / data.categories.length;
    let paths = "";
    data.series.forEach((s, si) => {
      const pts = s.values.map((v, i) => (v === null || v === undefined ? null : [f.m.l + band * i + band / 2, f.y(v), i]));
      let run = [];
      const flush = () => {
        if (run.length > 1) { paths += '<polyline class="zsacLine ' + stroke(si) + '" fill="none" points="' + run.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ") + '"/>'; }
        run = [];
      };
      pts.forEach((p) => { if (p) { run.push(p); } else { flush(); } });
      flush();
      paths += pts.filter(Boolean).map((p) => '<circle class="' + fill(si) + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3"><title>' +
        esc(data.categories[p[2]] + (data.series.length > 1 ? " / " + s.name : "") + ": " + Format.full(s.values[p[2]])) + "</title></circle>").join("");
    });
    return svg(w, h, f.out + paths + categoryLabels(data.categories, f, w, h, band) +
      (f.multi ? legend(data.series.map((s) => s.name), w, 6) : ""));
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
    const r0 = r1 * 0.62;
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
    out += '<text class="zsacSvgBig" x="' + cx + '" y="' + (cy + 6) + '" text-anchor="middle">' + compact(total) + "</text>";
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
      '<text class="zsacSvgBig" x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle">' + (pct * 100).toFixed(0) + "%</text>" +
      '<text class="zsacSvgMuted" x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle">' + esc(data.label || (compact(data.value) + " of " + compact(max))) + "</text>");
  }

  function sankey(data, w, h) {
    const nodes = data.nodes;
    const links = data.links.filter((l) => l.value > 0);
    if (!nodes.length || !links.length) { return empty(w, h); }
    const padX = 90; const nodeW = 12; const gap = 8; const top = 8;
    const sides = [0, 1].map((s) => nodes.filter((n) => n.side === s));
    const totals = new Map(nodes.map((n) => [n.id, 0]));
    links.forEach((l) => { totals.set(l.source, totals.get(l.source) + l.value); totals.set(l.target, totals.get(l.target) + l.value); });
    const avail = h - top * 2;
    const scale = Math.min.apply(null, sides.map((col) => {
      const sum = col.reduce((a, n) => a + totals.get(n.id), 0);
      return sum > 0 ? (avail - gap * (col.length - 1)) / sum : Infinity;
    }));
    const pos = new Map();
    sides.forEach((col, s) => {
      let y = top;
      col.forEach((n) => {
        const hh = Math.max(2, totals.get(n.id) * scale);
        pos.set(n.id, { x: s === 0 ? padX : w - padX - nodeW, y, h: hh, used: 0, side: s });
        y += hh + gap;
      });
    });
    let out = "";
    const colorOf = new Map(sides[0].map((n, i) => [n.id, i]));
    links.slice().sort((a, b) => b.value - a.value).forEach((l) => {
      const s = pos.get(l.source); const t = pos.get(l.target);
      const lh = Math.max(1, l.value * scale);
      const sy = s.y + s.used + lh / 2; const ty = t.y + t.used + lh / 2;
      s.used += lh; t.used += lh;
      const x0 = s.x + nodeW; const x1 = t.x; const mx = (x0 + x1) / 2;
      out += '<path class="zsacLink ' + stroke(colorOf.get(l.source) || 0) + '" fill="none" stroke-width="' + lh.toFixed(1) + '" d="M' + x0 + "," + sy + " C" + mx + "," + sy + " " + mx + "," + ty + " " + x1 + "," + ty + '"><title>' +
        esc(l.sourceLabel + " to " + l.targetLabel + ": " + Format.full(l.value)) + "</title></path>";
    });
    nodes.forEach((n, i) => {
      const p = pos.get(n.id);
      const left = p.side === 0;
      out += '<rect class="' + (left ? fill(colorOf.get(n.id) || 0) : "zsacNode") + '" x="' + p.x + '" y="' + p.y + '" width="' + nodeW + '" height="' + p.h + '" rx="2"/>' +
        '<text class="zsacSvgText" x="' + (left ? p.x - 6 : p.x + nodeW + 6) + '" y="' + (p.y + p.h / 2 + 4) + '" text-anchor="' + (left ? "end" : "start") + '">' + esc(truncate(n.label, 14)) + "</text>";
    });
    return svg(w, h, out);
  }

  return { bar, line, donut, funnel, gauge, sankey, waterfall, empty };
});
