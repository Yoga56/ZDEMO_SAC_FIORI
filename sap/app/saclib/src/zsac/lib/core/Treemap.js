/**
 * Squarified treemap layout (pure): rectangles with an area proportional to the value, as close to squares as possible
 * (Bruls, Huizing, van Wijk). Items with a value of zero or less get no rectangle.
 *
 *   Treemap.layout(items, x, y, w, h) -> [{ item, x, y, w, h }]     items = [{ value, ... }]
 *   Treemap.nest(groups, w, h, pad, head) -> [{ group, x, y, w, h, children: [{ item, x, y, w, h }] }]
 *     groups = [{ label, items: [{ label, value }] }]; each group has a header band of `head` pixels and `pad` around its children
 */
sap.ui.define([], function () {
  "use strict";

  function worst(row, side) {
    const sum = row.reduce((s, r) => s + r.area, 0);
    const max = Math.max.apply(null, row.map((r) => r.area));
    const min = Math.min.apply(null, row.map((r) => r.area));
    const s2 = side * side;
    return Math.max((s2 * max) / (sum * sum), (sum * sum) / (s2 * min));
  }

  function layout(items, x, y, w, h) {
    const pos = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
    const total = pos.reduce((s, i) => s + i.value, 0);
    if (!pos.length || !(w > 0) || !(h > 0)) { return []; }
    const scale = (w * h) / total;
    const queue = pos.map((item) => ({ item, area: item.value * scale }));
    const out = [];
    let rx = x; let ry = y; let rw = w; let rh = h;
    while (queue.length) {
      const side = Math.min(rw, rh);
      const row = [queue.shift()];
      while (queue.length && worst(row.concat([queue[0]]), side) <= worst(row, side)) { row.push(queue.shift()); }
      const sum = row.reduce((s, r) => s + r.area, 0);
      if (rw >= rh) { // the row is a column on the left
        const cw = sum / rh; let cy = ry;
        row.forEach((r) => { const ch = r.area / cw; out.push({ item: r.item, x: rx, y: cy, w: cw, h: ch }); cy += ch; });
        rx += cw; rw -= cw;
      } else { // the row is a band on the top
        const bh = sum / rw; let cx = rx;
        row.forEach((r) => { const bw = r.area / bh; out.push({ item: r.item, x: cx, y: ry, w: bw, h: bh }); cx += bw; });
        ry += bh; rh -= bh;
      }
    }
    return out;
  }

  function nest(groups, w, h, pad, head) {
    const sums = groups.map((g) => ({ group: g, value: g.items.reduce((s, i) => s + Math.max(0, i.value), 0) }));
    return layout(sums, 0, 0, w, h).map((r) => {
      const inner = layout(r.item.group.items, r.x + pad, r.y + head, r.w - 2 * pad, r.h - head - pad);
      return { group: r.item.group, x: r.x, y: r.y, w: r.w, h: r.h, children: inner };
    });
  }

  return { layout, nest };
});
