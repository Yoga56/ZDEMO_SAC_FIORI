/**
 * Editable planning grid for one model, version and measure: one row per dimension combination, one column
 * per period, totals on both axes. Cells of a locked version are read only.
 *
 *   table.setData({ model, version, measure, facts, locked })
 * With data.hierarchy = { slot, h } (slot of a dimension, h from HierarchyEngine.build) the rows are grouped under the hierarchy nodes of
 * that dimension: parent nodes are read only subtotal rows that can be collapsed, leaf rows stay editable.
 * Events: cellChange { fact }     (fact = the full fact row with the new Value)
 *         addRowRequest {}        (the app opens its own member picker, then calls table.addRow(members))
 */
sap.ui.define(["sap/ui/core/Control", "../core/Format", "../core/QueryEngine"], function (Control, Format, QueryEngine) {
  "use strict";

  const esc = Format.esc;
  const num = (s) => { const n = Number(String(s).replace(/,/g, "")); return isFinite(n) ? n : NaN; };

  function months(from, to) {
    const out = [];
    let y = +from.slice(0, 4); let m = +from.slice(5);
    const ey = +to.slice(0, 4); const em = +to.slice(5);
    while (y < ey || (y === ey && m <= em)) { out.push(y + "-" + String(m).padStart(2, "0")); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }

  return Control.extend("zsac.lib.planning.PlanningTable", {
    metadata: {
      properties: { data: { type: "object", defaultValue: null }, decimals: { type: "int", defaultValue: 0 } },
      events: { cellChange: { parameters: { fact: { type: "object" } } }, addRowRequest: {} }
    },

    renderer: {
      apiVersion: 2,
      render(rm, t) {
        rm.openStart("div", t).class("zsacPlan").openEnd();
        rm.unsafeHtml(t._html());
        rm.close("div");
      }
    },

    setData(data) {
      this.setProperty("data", data, true);
      this._index(data);
      this.invalidate();
      return this;
    },

    _index(data) {
      this._cells = new Map();
      this._rows = [];
      this._periods = [];
      if (!data) { return; }
      const m = data.model;
      this._periods = months(m.PeriodFrom || "2026-01", m.PeriodTo || "2026-12");
      const rowKeys = new Map();
      data.facts.forEach((f) => {
        const rk = [f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].slice(0, m.Dimensions.length).join("\u0001");
        rowKeys.set(rk, rk.split("\u0001"));
        this._cells.set(rk + "|" + f.Period, f);
      });
      this._rows = Array.from(rowKeys.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    },

    /** Adds an all-zero row for the chosen members so cells can be typed in. */
    addRow(members) {
      const data = this.getData();
      const m = data.model;
      const rk = members.join("\u0001");
      if (this._rows.some((r) => r[0] === rk)) { return false; }
      this._periods.forEach((p) => {
        const f = { ModelId: m.ModelId, VersionId: data.version, Period: p, Measure: data.measure,
          Dim1: members[0] || "", Dim2: members[1] || "", Dim3: members[2] || "", Dim4: members[3] || "", Dim5: members[4] || "", Value: 0 };
        this._cells.set(rk + "|" + p, f);
        data.facts.push(f);
        this.fireCellChange({ fact: f });
      });
      this._rows.push([rk, members]);
      this._rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
      this.invalidate();
      return true;
    },

    /** Rows of the tree mode: one entry per node (and other-dimension combination), with the leaf rows below it. */
    _tree(data) {
      const s = data.hierarchy.slot - 1;
      const h = data.hierarchy.h;
      const groups = new Map();
      this._rows.forEach(([rk, members], idx) => {
        const other = members.filter((x, i) => i !== s);
        const gk = other.join("\u0001");
        (groups.get(gk) || groups.set(gk, { other, leaves: [] }).get(gk)).leaves.push({ idx, node: members[s] });
      });
      const entries = [];
      Array.from(groups.keys()).sort().forEach((gk) => {
        const g = groups.get(gk);
        const nodes = new Set();
        g.leaves.forEach((l) => h.path(l.node).forEach((n) => nodes.add(n)));
        Array.from(nodes).sort((a, b) => h.position(a) - h.position(b)).forEach((node) => {
          const sub = new Set([node].concat(h.descendants(node)));
          const own = g.leaves.find((l) => l.node === node);
          entries.push({ gk, other: g.other, node, depth: h.depth(node), own: own ? own.idx : -1,
            leafIdx: g.leaves.filter((l) => sub.has(l.node)).map((l) => l.idx), parent: h.parent(node), hasChildren: !h.isLeaf(node) && h.descendants(node).some((d) => nodes.has(d)) });
        });
      });
      return entries;
    },

    _treeHtml(data, dec, edit) {
      const m = data.model;
      const s = data.hierarchy.slot - 1;
      const entries = (this._entries = this._tree(data));
      this._closed = this._closed || new Set();
      const key = (e) => e.gk + "|" + e.node;
      const byKey = new Map(entries.map((e) => [e.gk + "|" + e.node, e]));
      const visible = (e) => { let p = e.parent; while (p !== undefined) { const pe = byKey.get(e.gk + "|" + p); if (!pe) { break; } if (this._closed.has(key(pe))) { return false; } p = pe.parent; } return true; };
      let h = '<table class="zsacGrid2 zsacPlanGrid"><thead><tr>';
      m.Dimensions.forEach((d) => { h += "<th>" + esc(d.Label) + "</th>"; });
      this._periods.forEach((p) => { h += '<th class="num">' + esc(p.slice(2)) + "</th>"; });
      h += '<th class="num total">Total</th></tr></thead><tbody>';
      this._subs = [];
      const colTotals = this._periods.map(() => 0);
      let grand = 0;
      entries.forEach((e, ei) => {
        const own = e.own >= 0;
        e.visible = visible(e);
        if (!e.visible) { return; }
        const leafSum = (c) => e.leafIdx.reduce((a, idx) => { const f = this._cells.get(this._rows[idx][0] + "|" + this._periods[c]); return a + (f ? f.Value : 0); }, 0);
        let o = 0;
        h += '<tr' + (own ? "" : ' class="zsacSubtotal"') + ">";
        m.Dimensions.forEach((d, i) => {
          if (i === s) {
            const tog = e.hasChildren ? '<span class="zsacTog" data-e="' + ei + '">' + (this._closed.has(key(e)) ? "\u25B8" : "\u25BE") + "</span>" : '<span class="zsacTogGap"></span>';
            h += '<td class="zsacNode" style="padding-left:' + (0.6 + (e.depth - 1) * 1.1) + 'rem">' + tog + esc(e.node) + "</td>";
          } else {
            h += "<td>" + esc(e.other[i > s ? i - 1 : i]) + "</td>";
          }
        });
        let total = 0;
        this._periods.forEach((p, c) => {
          if (own) {
            const f = this._cells.get(this._rows[e.own][0] + "|" + p);
            const v = f ? f.Value : 0;
            total += v;
            h += '<td class="num"><input class="zsacCell2' + (f ? "" : " zsacMissing") + '" data-r="' + e.own + '" data-c="' + c + '" value="' + Format.full(v, dec) + '"' + (edit ? "" : " disabled") + "></td>";
          } else {
            const v = leafSum(c);
            total += v;
            h += '<td class="num" data-sc="' + ei + "-" + c + '">' + Format.full(v, dec) + "</td>";
          }
        });
        h += (own ? '<td class="num total" data-rt="' + e.own + '">' : '<td class="num total" data-srt="' + ei + '">') + Format.full(total, dec) + "</td></tr>";
        if (!own) { this._subs.push({ ei, leafIdx: e.leafIdx }); }
      });
      // column totals count leaf rows once
      this._rows.forEach(([rk]) => this._periods.forEach((p, c) => { const f = this._cells.get(rk + "|" + p); const v = f ? f.Value : 0; colTotals[c] += v; grand += v; }));
      h += '<tr class="grand"><td colspan="' + m.Dimensions.length + '">Total</td>';
      colTotals.forEach((v, c) => { h += '<td class="num" data-ct="' + c + '">' + Format.full(v, dec) + "</td>"; });
      h += '<td class="num total" data-gt="1">' + Format.full(grand, dec) + "</td></tr></tbody></table>";
      return h;
    },

    _html() {
      const data = this.getData();
      if (!data) { return '<div class="zsacCardMsg">Choose a model, a version and a measure</div>'; }
      const m = data.model;
      const dec = this.getDecimals();
      const edit = !data.locked;
      if (data.hierarchy && this._rows.length) { return this._treeHtml(data, dec, edit); }
      this._subs = [];
      let h = '<table class="zsacGrid2 zsacPlanGrid"><thead><tr>';
      m.Dimensions.forEach((d) => { h += "<th>" + esc(d.Label) + "</th>"; });
      this._periods.forEach((p) => { h += '<th class="num">' + esc(p.slice(2)) + "</th>"; });
      h += '<th class="num total">Total</th></tr></thead><tbody>';
      if (!this._rows.length) { h += '<tr><td colspan="' + (m.Dimensions.length + this._periods.length + 1) + '" class="zsacCardMsg">No rows in this version yet</td></tr>'; }
      const colTotals = this._periods.map(() => 0);
      let grand = 0;
      this._rows.forEach(([rk, members], r) => {
        let total = 0;
        h += '<tr data-r="' + r + '">';
        members.forEach((v) => { h += "<td>" + esc(v) + "</td>"; });
        this._periods.forEach((p, c) => {
          const f = this._cells.get(rk + "|" + p);
          const v = f ? f.Value : 0;
          total += v; colTotals[c] += v;
          h += '<td class="num"><input class="zsacCell2' + (f ? "" : " zsacMissing") + '" data-r="' + r + '" data-c="' + c + '" value="' + Format.full(v, dec) + '"' + (edit ? "" : " disabled") + "></td>";
        });
        grand += total;
        h += '<td class="num total" data-rt="' + r + '">' + Format.full(total, dec) + "</td></tr>";
      });
      h += '<tr class="grand"><td colspan="' + m.Dimensions.length + '">Total</td>';
      colTotals.forEach((v, c) => { h += '<td class="num" data-ct="' + c + '">' + Format.full(v, dec) + "</td>"; });
      h += '<td class="num total" data-gt="1">' + Format.full(grand, dec) + "</td></tr></tbody></table>";
      return h;
    },

    onAfterRendering() {
      const root = this.getDomRef();
      if (root._zsacBound) { return; }
      root._zsacBound = true;
      root.addEventListener("change", (e) => this._onEdit(e));
      root.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || !e.target.matches("input.zsacCell2")) { return; }
        // next cell down (up with shift) in the same column, in the order the rows are shown
        const column = Array.from(root.querySelectorAll('input.zsacCell2[data-c="' + e.target.dataset.c + '"]'));
        const next = column[column.indexOf(e.target) + (e.shiftKey ? -1 : 1)];
        if (next) { next.focus(); next.select(); }
      });
      root.addEventListener("click", (e) => {
        const t = e.target.closest(".zsacTog");
        if (!t || t.getAttribute("data-e") === null) { return; }
        const entry = this._entries[Number(t.getAttribute("data-e"))];
        const k = entry.gk + "|" + entry.node;
        if (this._closed.has(k)) { this._closed.delete(k); } else { this._closed.add(k); }
        this.invalidate();
      });
      root.addEventListener("focusin", (e) => { if (e.target.matches("input.zsacCell2")) { e.target.select(); } });
    },

    _onEdit(e) {
      const input = e.target;
      if (!input.matches("input.zsacCell2")) { return; }
      const r = +input.dataset.r; const c = +input.dataset.c;
      const [rk, members] = this._rows[r];
      const p = this._periods[c];
      const v = num(input.value);
      const old = this._cells.get(rk + "|" + p);
      if (isNaN(v)) { input.value = Format.full(old ? old.Value : 0, this.getDecimals()); return; }
      const data = this.getData();
      let fact = old;
      if (!fact) {
        fact = { ModelId: data.model.ModelId, VersionId: data.version, Period: p, Measure: data.measure,
          Dim1: members[0] || "", Dim2: members[1] || "", Dim3: members[2] || "", Dim4: members[3] || "", Dim5: members[4] || "", Value: 0 };
        this._cells.set(rk + "|" + p, fact);
        data.facts.push(fact);
        input.classList.remove("zsacMissing");
      }
      fact.Value = Math.round(v * 100) / 100;
      input.value = Format.full(fact.Value, this.getDecimals());
      this._totals();
      this.fireCellChange({ fact: Object.assign({}, fact) });
    },

    _totals() {
      const root = this.getDomRef();
      const dec = this.getDecimals();
      let grand = 0;
      const col = this._periods.map(() => 0);
      this._rows.forEach(([rk], r) => {
        let t = 0;
        this._periods.forEach((p, c) => { const f = this._cells.get(rk + "|" + p); const v = f ? f.Value : 0; t += v; col[c] += v; });
        grand += t;
        const cell = root.querySelector('[data-rt="' + r + '"]');
        if (cell) { cell.textContent = Format.full(t, dec); }
      });
      col.forEach((v, c) => { const cell = root.querySelector('[data-ct="' + c + '"]'); if (cell) { cell.textContent = Format.full(v, dec); } });
      const g = root.querySelector("[data-gt]");
      if (g) { g.textContent = Format.full(grand, dec); }
      (this._subs || []).forEach(({ ei, leafIdx }) => {
        let t = 0;
        this._periods.forEach((p, c) => {
          const v = leafIdx.reduce((a, idx) => { const f = this._cells.get(this._rows[idx][0] + "|" + p); return a + (f ? f.Value : 0); }, 0);
          t += v;
          const cell = root.querySelector('[data-sc="' + ei + "-" + c + '"]');
          if (cell) { cell.textContent = Format.full(v, dec); }
        });
        const cell = root.querySelector('[data-srt="' + ei + '"]');
        if (cell) { cell.textContent = Format.full(t, dec); }
      });
    }
  });
});
