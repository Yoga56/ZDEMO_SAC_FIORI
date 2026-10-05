/**
 * Editable planning grid for one model, version and measure: one row per dimension combination, one column
 * per period, totals on both axes. Cells of a locked version are read only.
 *
 *   table.setData({ model, version, measure, facts, locked })
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

    _html() {
      const data = this.getData();
      if (!data) { return '<div class="zsacCardMsg">Choose a model, a version and a measure</div>'; }
      const m = data.model;
      const dec = this.getDecimals();
      const edit = !data.locked;
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
        const next = root.querySelector('input[data-r="' + (+e.target.dataset.r + (e.shiftKey ? -1 : 1)) + '"][data-c="' + e.target.dataset.c + '"]');
        if (next) { next.focus(); next.select(); }
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
    }
  });
});
