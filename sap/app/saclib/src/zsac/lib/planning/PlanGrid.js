/**
 * Editable cross-tab for planning (SAC's planning table): any dimensions on rows and columns, hierarchies with expand and
 * collapse (the Date dimension as year > quarter > month), attribute columns, and typing into any cell.
 *
 *   grid.setContext({ model, facts, versions, plan, spec: { rows, columns, filters, hierarchies },
 *                     options: { editable, expandRows, expandCols, attributes, decimals, showTotals } })
 *
 * Typing into a leaf cell writes that fact; typing into an aggregated cell (a parent node, a year, a quarter) spreads the value over
 * the facts below it (see Spreader). Edits go to the PlanBuffer (unpublished, undoable); the grid shows facts with the buffer applied.
 */
sap.ui.define([
  "sap/ui/core/Control",
  "sap/m/MessageToast",
  "../core/Format",
  "../core/QueryEngine",
  "./PlanEditor",
  "./GridText"
], function (Control, MessageToast, Format, QueryEngine, PlanEditor, GridText) {
  "use strict";

  const SEP = "\u0001";
  const esc = Format.esc;
  const num = (s) => Number(String(s).replace(/,/g, "").trim());

  return Control.extend("zsac.lib.planning.PlanGrid", {
    metadata: { events: { rejected: { parameters: { reason: { type: "string" } } } } },

    init() {
      this._rowOpen = new Map();
      this._colOpen = new Map();
      this._onPlan = () => this.invalidate();
    },

    exit() {
      if (this._ctx && this._ctx.plan) { this._ctx.plan.detachChange(this._onPlan); }
    },

    renderer: {
      apiVersion: 2,
      render(rm, grid) {
        rm.openStart("div", grid).class("zsacPlan").attr("tabindex", "0").openEnd();
        rm.unsafeHtml(grid._html());
        rm.close("div");
      }
    },

    setContext(ctx) {
      if (this._ctx && this._ctx.plan) { this._ctx.plan.detachChange(this._onPlan); }
      this._ctx = ctx;
      this._sel = null;
      this._base = new Map(ctx.facts.map((f) => [[f.ModelId, f.VersionId, f.Period, f.Measure, f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].join("|"), f.Value]));
      if (ctx.plan) { ctx.plan.attachChange(this._onPlan); }
      this.invalidate();
      return this;
    },

    /** Facts as the table shows them: stored facts with the unpublished changes applied. */
    getFacts() { return this._ctx.plan ? this._ctx.plan.overlay(this._ctx.facts) : this._ctx.facts; },
    getResult() { return this._result; },

    // ---- rendering ---------------------------------------------------------------------------
    _html() {
      const c = this._ctx;
      if (!c) { return '<div class="zsacCardMsg">No data</div>'; }
      const o = Object.assign({ editable: true, expandRows: 3, expandCols: 2, attributes: [], decimals: -1, showTotals: true }, c.options);
      const spec = c.spec;
      const r = (this._result = QueryEngine.aggregate(c.model, this.getFacts(), { rows: spec.rows, columns: spec.columns, filters: spec.filters, hierarchies: spec.hierarchies }));
      this._o = o;
      if (!r.rowKeys.length || !r.colKeys.length) { return '<div class="zsacCardMsg">No data for this selection. ' + (o.editable ? "Use Add row to start planning." : "") + "</div>"; }

      const keyStr = (k) => k.join(SEP);
      const visible = (keys, info, map, level) => (info ? keys.filter((k) => {
        let p = info(k).parent;
        while (p) {
          const ks = keyStr(p);
          const open = map.has(ks) ? map.get(ks) : info(p).depth < level;
          if (!open) { return false; }
          p = info(p).parent;
        }
        return true;
      }) : keys);
      const rows = (this._rows = visible(r.rowKeys, r.rowInfo, this._rowOpen, o.expandRows));
      const cols = (this._cols = visible(r.colKeys, r.colInfo, this._colOpen, o.expandCols));
      this._rowIndex = new Map(r.rowKeys.map((k, i) => [keyStr(k), i]));
      this._colIndex = new Map(r.colKeys.map((k, i) => [keyStr(k), i]));
      const isOpen = (map, info, k, level) => (map.has(keyStr(k)) ? map.get(keyStr(k)) : info(k).depth < level);

      const dec = (this._dec = o.decimals >= 0 ? o.decimals : ((r.measure || (c.model.Measures || [])[0] || {}).Decimals || 0));
      const dimLabel = (id) => QueryEngine.labelOf(c.model, id);
      const member = (id, v) => (id === "PERIOD" ? Format.period(v) : v);
      const attrs = (o.attributes || []).map((id) => {
        const dim = c.model.Dimensions.find((d) => spec.rows.indexOf(d.DimId) >= 0 && (d.Attributes || []).some((a) => a.Id === id));
        return dim ? { id, dim: dim.DimId, label: dim.Attributes.find((a) => a.Id === id).Label || id, idx: spec.rows.indexOf(dim.DimId), lookup: new Map((dim.Members || []).map((m) => [m.Id, (m.Props || {})[id] || ""])) } : null;
      }).filter(Boolean);
      const lead = Math.max(1, spec.rows.length) + attrs.length;
      const totals = o.showTotals && !r.rowInfo && !r.colInfo;

      let h = '<table class="zsacGrid2 zsacPlanGrid"><thead>';
      const kc = spec.columns.length;
      spec.columns.forEach((cd, i) => {
        h += "<tr>";
        if (i < kc - 1) {
          h += '<th colspan="' + lead + '" class="zsacHdrLabel">' + esc(dimLabel(cd)) + "</th>";
        } else {
          spec.rows.forEach((rd) => { h += "<th>" + esc(dimLabel(rd)) + "</th>"; });
          if (!spec.rows.length) { h += "<th></th>"; }
          attrs.forEach((a) => { h += "<th>" + esc(a.label) + "</th>"; });
        }
        let n = 0;
        while (n < cols.length) {
          let span = 1;
          while (n + span < cols.length && cols[n + span].slice(0, i + 1).join(SEP) === cols[n].slice(0, i + 1).join(SEP)) { span++; }
          const k = cols[n];
          const info = r.colInfo ? r.colInfo(k) : null;
          let cell = esc(member(cd, k[i]));
          let cls = "num";
          if (info && info.index === i) {
            const tog = info.hasChildren ? '<span class="zsacTog" data-c="' + this._colIndex.get(keyStr(k)) + '">' + (isOpen(this._colOpen, r.colInfo, k, o.expandCols) ? "▾" : "▸") + "</span>" : "";
            cell = tog + cell;
            cls += " zsacColNode";
          }
          h += '<th class="' + cls + '" colspan="' + span + '">' + cell + "</th>";
          n += span;
        }
        if (totals && i === 0) { h += '<th class="num total" rowspan="' + kc + '">Total</th>'; }
        h += "</tr>";
      });
      h += "</thead><tbody>";

      this._cellKeys = [];
      let prev = [];
      rows.forEach((rk, ri) => {
        const info = r.rowInfo ? r.rowInfo(rk) : null;
        h += "<tr>";
        rk.forEach((m, i) => {
          if (info && i === info.index) {
            const tog = info.hasChildren ? '<span class="zsacTog" data-r="' + this._rowIndex.get(keyStr(rk)) + '">' + (isOpen(this._rowOpen, r.rowInfo, rk, o.expandRows) ? "▾" : "▸") + "</span>" : '<span class="zsacTogGap"></span>';
            h += '<td class="zsacNode" style="padding-left:' + (0.6 + (info.depth - 1) * 1.1) + 'rem">' + tog + esc(member(spec.rows[i], m)) + "</td>";
            return;
          }
          const same = prev.slice(0, i + 1).join(SEP) === rk.slice(0, i + 1).join(SEP);
          h += "<td" + (same ? ' class="repeat"' : "") + ">" + (same ? "" : esc(member(spec.rows[i], m))) + "</td>";
        });
        if (!spec.rows.length) { h += "<td>All</td>"; }
        attrs.forEach((a) => { h += "<td>" + esc(a.lookup.get(rk[a.idx]) || "") + "</td>"; });
        prev = rk;
        cols.forEach((ck, ci) => {
          const v = r.cell(rk, ck);
          const state = o.editable ? PlanEditor.cellState({ model: c.model, spec, versions: c.versions, editable: true }, r, rk, ck) : { editable: false };
          const aggregated = (info && info.hasChildren) || (r.colInfo && r.colInfo(ck).hasChildren);
          const dirty = r.cellFacts(rk, ck).some((f) => c.plan && c.plan.has(f));
          const text = v === undefined ? "" : Format.full(v, dec);
          if (state.editable) {
            h += '<td class="num" data-ri="' + ri + '" data-ci="' + ci + '"><input class="zsacCell2' + (aggregated ? " zsacAggCell" : "") + (dirty ? " zsacDirtyCell" : "") + (v === undefined ? " zsacMissing" : "") + '" data-ri="' + ri + '" data-ci="' + ci + '" value="' + text + '"></td>';
          } else {
            h += '<td data-ri="' + ri + '" data-ci="' + ci + '" class="num' + (aggregated ? " zsacAggCell" : "") + (dirty ? " zsacDirtyCell" : "") + '"' + (o.editable && state.reason ? ' title="' + esc(state.reason) + '"' : "") + ">" + text + "</td>";
          }
        });
        if (totals) { h += '<td class="num total">' + Format.full(r.rowTotal(rk), dec) + "</td>"; }
        h += "</tr>";
      });
      if (totals && rows.length > 1) {
        h += '<tr class="grand"><td colspan="' + lead + '">Total</td>';
        cols.forEach((ck) => { h += '<td class="num">' + Format.full(r.colTotal(ck), dec) + "</td>"; });
        h += '<td class="num total">' + Format.full(r.grand, dec) + "</td></tr>";
      }
      return h + "</tbody></table>";
    },

    // ---- interaction -------------------------------------------------------------------------
    onAfterRendering() {
      const root = this.getDomRef();
      if (this._focusNext) {
        const t = root.querySelector('input[data-ri="' + this._focusNext.ri + '"][data-ci="' + this._focusNext.ci + '"]');
        if (t) { t.focus(); t.select(); }
        this._focusNext = null;
      }
      this._paint();
      if (root._zsacBound) { return; }
      root._zsacBound = true;
      this._bindSelection(root);
      root.addEventListener("change", (e) => { if (e.target.matches("input.zsacCell2")) { this._onEdit(e.target); } });
      root.addEventListener("focusin", (e) => { if (e.target.matches("input.zsacCell2")) { e.target.select(); } });
      root.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || !e.target.matches("input.zsacCell2")) { return; }
        this._focusNext = { ri: Number(e.target.dataset.ri) + (e.shiftKey ? -1 : 1), ci: Number(e.target.dataset.ci) };
        e.target.blur();      // commits the value through the change event; the re-render then moves the focus
        this.invalidate();
      });
      root.addEventListener("click", (e) => {
        const t = e.target.closest(".zsacTog");
        if (!t) { return; }
        const r = this._result;
        if (t.hasAttribute("data-r")) {
          const k = r.rowKeys[Number(t.getAttribute("data-r"))].join(SEP);
          this._rowOpen.set(k, !(this._rowOpen.has(k) ? this._rowOpen.get(k) : r.rowInfo(r.rowKeys[Number(t.getAttribute("data-r"))]).depth < this._o.expandRows));
        } else {
          const ck = r.colKeys[Number(t.getAttribute("data-c"))];
          const k = ck.join(SEP);
          this._colOpen.set(k, !(this._colOpen.has(k) ? this._colOpen.get(k) : r.colInfo(ck).depth < this._o.expandCols));
        }
        this.invalidate();
      });
    },

    // ---- selection, copy, paste, distribute ------------------------------------------------
    /** Shift+click (or drag) selects a block of cells; Copy, Paste and Distribute Values work on it. */
    _bindSelection(root) {
      const cellOf = (e) => { const td = e.target.closest ? e.target.closest("td[data-ri]") : null; return td ? { ri: Number(td.dataset.ri), ci: Number(td.dataset.ci) } : null; };
      const touch = () => { this._paint(); if (this._ctx.plan) { this._ctx.plan.notifySelection(this); } };
      root.addEventListener("mousedown", (e) => {
        const c = cellOf(e);
        if (this._ctx && this._ctx.plan) { this._ctx.plan.active = this; }
        if (!c) { return; }
        if (e.shiftKey && this._sel) { this._sel.b = c; e.preventDefault(); touch(); return; }
        this._sel = { a: c, b: c };
        this._dragging = true;
        touch();
      });
      root.addEventListener("mouseover", (e) => {
        if (!this._dragging || e.buttons !== 1) { return; }
        const c = cellOf(e);
        if (c && this._sel && (c.ri !== this._sel.b.ri || c.ci !== this._sel.b.ci)) { this._sel.b = c; touch(); }
      });
      document.addEventListener("mouseup", () => { this._dragging = false; });
      root.addEventListener("copy", (e) => {
        if (this.selectionInfo().count < 2) { return; }          // one cell: the input's own copy works
        e.clipboardData.setData("text/plain", this.copySelection());
        e.preventDefault();
      });
      root.addEventListener("paste", (e) => {
        const text = e.clipboardData.getData("text/plain");
        if (!/[\t\n]/.test(text.trim()) && this.selectionInfo().count < 2) { return; }   // one value into one cell: the input's own paste, then Enter
        e.preventDefault();
        this.paste(text);
      });
    },

    _range() {
      if (!this._sel) { return null; }
      const { a, b } = this._sel;
      const maxR = this._rows ? this._rows.length - 1 : 0;
      const maxC = this._cols ? this._cols.length - 1 : 0;
      return { r0: Math.min(a.ri, b.ri), r1: Math.min(maxR, Math.max(a.ri, b.ri)), c0: Math.min(a.ci, b.ci), c1: Math.min(maxC, Math.max(a.ci, b.ci)) };
    },

    _paint() {
      const root = this.getDomRef();
      if (!root) { return; }
      const g = this._range();
      root.querySelectorAll("td[data-ri]").forEach((td) => {
        const ri = Number(td.dataset.ri); const ci = Number(td.dataset.ci);
        td.classList.toggle("zsacSel", !!g && ri >= g.r0 && ri <= g.r1 && ci >= g.c0 && ci <= g.c1);
      });
    },

    clearSelection() { this._sel = null; this._paint(); if (this._ctx && this._ctx.plan) { this._ctx.plan.notifySelection(this); } },

    _stateOf(rk, ck) {
      const c = this._ctx;
      return PlanEditor.cellState({ model: c.model, spec: c.spec, versions: c.versions, editable: !!(this._o && this._o.editable) }, this._result, rk, ck);
    },

    /** @returns {{ri, ci, rk, ck, value, state}[]} the selected cells in reading order */
    getSelectedCells() {
      const g = this._range();
      if (!g || !this._rows) { return []; }
      const out = [];
      for (let ri = g.r0; ri <= g.r1; ri++) {
        for (let ci = g.c0; ci <= g.c1; ci++) {
          const rk = this._rows[ri]; const ck = this._cols[ci];
          if (rk && ck) { out.push({ ri, ci, rk, ck, value: this._result.cell(rk, ck), state: this._stateOf(rk, ck) }); }
        }
      }
      return out;
    },

    selectionInfo() {
      const cells = this.getSelectedCells();
      return { count: cells.length, editable: cells.filter((x) => x.state.editable).length };
    },

    getDecimals() { return this._dec || 0; },
    getModelId() { return this._ctx ? this._ctx.model.ModelId : ""; },

    _cellLabel(rk, ck) {
      const spec = this._ctx.spec;
      const part = (dims, key) => key.map((m, i) => (dims[i] === "PERIOD" ? Format.period(m) : m)).join(" / ");
      return [part(spec.rows, rk), part(spec.columns, ck)].filter(Boolean).join(" \u00B7 ");
    },

    /** Versions (other than the table's) whose values can serve as the reference for Distribute Values. */
    getReferenceVersions() {
      const c = this._ctx;
      if (!c.readReference || !this._rows || !this._rows.length) { return []; }
      const own = PlanEditor.valueFor({ spec: c.spec }, this._result, this._rows[0], this._cols[0], "VERSION");
      if (!own || (c.spec.rows || []).concat(c.spec.columns || []).indexOf("VERSION") >= 0) { return []; }
      return (c.versions || []).filter((v) => v.VersionId !== own);
    },

    /** Values of the selected cells in another version, aligned with `cells` (undefined where the reference has no value). */
    async getReferenceValues(versionId, cells) {
      const c = this._ctx;
      const own = PlanEditor.valueFor({ spec: c.spec }, this._result, this._rows[0], this._cols[0], "VERSION");
      const facts = (await c.readReference(versionId)).map((f) => Object.assign({}, f, { VersionId: own }));
      const r = QueryEngine.aggregate(c.model, facts, { rows: c.spec.rows, columns: c.spec.columns, filters: c.spec.filters, hierarchies: c.spec.hierarchies });
      return cells.map((x) => r.cell(x.rk, x.ck));
    },

    /** The selection (or the focused cell) as tab separated text; also kept in the plan session for the Paste button. */
    copySelection() {
      const g = this._range();
      if (!g) { return ""; }
      const matrix = [];
      for (let ri = g.r0; ri <= g.r1; ri++) {
        const row = [];
        for (let ci = g.c0; ci <= g.c1; ci++) { const v = this._rows[ri] && this._cols[ci] ? this._result.cell(this._rows[ri], this._cols[ci]) : undefined; row.push(v === undefined ? v : Math.round(v * 1e6) / 1e6); }
        matrix.push(row);
      }
      const text = GridText.format(matrix);
      if (this._ctx.plan) { this._ctx.plan.clipboard = text; }
      return text;
    },

    /** pasteText plus the message to the planner. */
    paste(text) {
      const out = this.pasteText(text);
      this._report(out);
      return out;
    },

    /** Pastes tab separated text with its top left corner on the selection's top left (or the focused cell). One value fills the whole selection. */
    pasteText(text) {
      const matrix = GridText.parse(text);
      if (!matrix.length) { return { cells: 0, skipped: 0, reason: "Nothing to paste" }; }
      const g = this._range();
      const focus = this.getDomRef() && this.getDomRef().querySelector("input.zsacCell2:focus");
      const start = g ? { ri: g.r0, ci: g.c0 } : focus ? { ri: Number(focus.dataset.ri), ci: Number(focus.dataset.ci) } : null;
      if (!start) { return { cells: 0, skipped: 0, reason: "Select a cell first" }; }
      const items = [];
      let skipped = 0;
      const single = matrix.length === 1 && matrix[0].length === 1;
      const place = (ri, ci, v) => {
        if (v === null) { return; }
        if (Number.isNaN(v)) { skipped++; return; }
        if (!this._rows[ri] || !this._cols[ci]) { skipped++; return; }
        items.push({ ri, ci, value: v });
      };
      if (single && g && (g.r1 > g.r0 || g.c1 > g.c0)) {
        for (let ri = g.r0; ri <= g.r1; ri++) { for (let ci = g.c0; ci <= g.c1; ci++) { place(ri, ci, matrix[0][0]); } }
      } else {
        matrix.forEach((row, i) => row.forEach((v, j) => place(start.ri + i, start.ci + j, v)));
      }
      const out = this.applyCellValues(items, "Paste into " + items.length + (items.length === 1 ? " cell" : " cells"));
      out.skipped += skipped;
      return out;
    },

    /**
     * Sets several cells in one undoable step. Each value goes through the same rules as typing it (leaf write, spread, refusal).
     * Cells of one block are independent; mixing a total and the numbers below it in one block gives the order of the block.
     * @returns {{cells: number, skipped: number, reason: string}}
     */
    applyCellValues(items, label) {
      const c = this._ctx;
      const ctx = { model: c.model, spec: c.spec, versions: c.versions, editable: true };
      const changes = new Map();
      let cells = 0; let skipped = 0; let reason = "";
      items.forEach((it) => {
        const out = PlanEditor.edit(ctx, this._result, this._rows[it.ri], this._cols[it.ci], it.value);
        if (out.error) { skipped++; reason = reason || out.error; return; }
        cells++;
        out.changes.forEach((f) => changes.set(PlanEditor.keyOfFact(f), f));
      });
      if (changes.size && c.plan) {
        c.plan.apply(Array.from(changes.values()), (f) => { const v = this._base.get([f.ModelId, f.VersionId, f.Period, f.Measure, f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].join("|")); return v === undefined ? null : v; },
          label || "Edit " + cells + " cells");
      }
      return { cells, skipped, reason };
    },

    _report(out) {
      if (out.reason && !out.cells) { MessageToast.show(out.reason); return; }
      MessageToast.show(out.cells + (out.cells === 1 ? " cell" : " cells") + " changed" + (out.skipped ? ", " + out.skipped + " skipped" + (out.reason ? " (" + out.reason + ")" : "") : ""));
    },

    _onEdit(input) {
      const c = this._ctx;
      const rk = this._rows[Number(input.dataset.ri)];
      const ck = this._cols[Number(input.dataset.ci)];
      const value = num(input.value);
      const out = PlanEditor.edit({ model: c.model, spec: c.spec, versions: c.versions, editable: true }, this._result, rk, ck, value);
      if (out.error) {
        MessageToast.show(out.error);
        this.fireRejected({ reason: out.error });
        this.invalidate();
        return;
      }
      if (!out.changes.length) { this.invalidate(); return; }
      const lookup = (f) => { const v = this._base.get([f.ModelId, f.VersionId, f.Period, f.Measure, f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].join("|")); return v === undefined ? null : v; };
      if (c.plan) { c.plan.apply(out.changes, lookup, "Typed " + Format.full(value, this._dec) + " into " + this._cellLabel(rk, ck)); }
    }
  });
});
