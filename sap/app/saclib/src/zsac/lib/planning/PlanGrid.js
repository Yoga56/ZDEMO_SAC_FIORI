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
  "./GridText",
  "./FormulaEngine"
], function (Control, MessageToast, Format, QueryEngine, PlanEditor, GridText, FormulaEngine) {
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
      if (this._ctx && this._ctx.plan) { this._ctx.plan.detachChange(this._onPlan); if (this._onSel) { this._ctx.plan.detachSelection(this._onSel); } }
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
      if (this._ctx && this._ctx.plan) { this._ctx.plan.detachChange(this._onPlan); if (this._onSel) { this._ctx.plan.detachSelection(this._onSel); } }
      this._ctx = ctx;
      this._sel = null;
      this._base = new Map(ctx.facts.map((f) => [[f.ModelId, f.VersionId, f.Period, f.Measure, f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].join("|"), f.Value]));
      if (ctx.plan) { ctx.plan.attachChange(this._onPlan); this._onSel = this._onSel || (() => this._syncBar()); ctx.plan.attachSelection(this._onSel); }
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

      let h = '<div class="zsacFxBar"><span class="zsacFxName">No cell selected</span><span class="zsacFxSym">fx</span>'
        + '<input class="zsacFx" placeholder="Value or formula, for example 1200, *1.1, +500, -10%, =ACT*1.05" spellcheck="false"></div>';
      h += '<table class="zsacGrid2 zsacPlanGrid"><thead>';
      const kc = spec.columns.length;
      spec.columns.forEach((cd, i) => {
        h += "<tr>";
        if (i < kc - 1) {
          h += '<th colspan="' + lead + '" class="zsacHdrLabel" data-all="1">' + esc(dimLabel(cd)) + "</th>";
        } else {
          spec.rows.forEach((rd) => { h += '<th data-all="1">' + esc(dimLabel(rd)) + "</th>"; });
          if (!spec.rows.length) { h += '<th data-all="1"></th>'; }
          attrs.forEach((a) => { h += '<th data-all="1">' + esc(a.label) + "</th>"; });
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
          h += '<th class="' + cls + '" colspan="' + span + '" data-hc="' + n + "-" + (n + span - 1) + '">' + cell + "</th>";
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
            h += '<td class="zsacNode" data-hr="' + ri + '" style="padding-left:' + (0.6 + (info.depth - 1) * 1.1) + 'rem">' + tog + esc(member(spec.rows[i], m)) + "</td>";
            return;
          }
          const same = prev.slice(0, i + 1).join(SEP) === rk.slice(0, i + 1).join(SEP);
          h += '<td data-hr="' + ri + '"' + (same ? ' class="repeat"' : "") + ">" + (same ? "" : esc(member(spec.rows[i], m))) + "</td>";
        });
        if (!spec.rows.length) { h += '<td data-hr="' + ri + '">All</td>'; }
        attrs.forEach((a) => { h += '<td data-hr="' + ri + '">' + esc(a.lookup.get(rk[a.idx]) || "") + "</td>"; });
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
        // headers select a whole row, whole columns (a spanning header selects all its columns) or everything; totals are left out when acting on them
        const lastR = this._rows ? this._rows.length - 1 : 0;
        const lastC = this._cols ? this._cols.length - 1 : 0;
        if (!c && lastR >= 0 && !e.target.closest(".zsacTog")) {
          const hr = e.target.closest("[data-hr]");
          const hc = e.target.closest("[data-hc]");
          const all = e.target.closest("[data-all]");
          if (hr) {
            const r = Number(hr.dataset.hr);
            if (e.shiftKey && this._sel && this._sel.byRow) { this._sel.b = { ri: r, ci: lastC }; } else { this._sel = { a: { ri: r, ci: 0 }, b: { ri: r, ci: lastC }, byRow: true, leafOnly: true }; }
            e.preventDefault(); touch(); return;
          }
          if (hc) {
            const [c0, c1] = hc.dataset.hc.split("-").map(Number);
            if (e.shiftKey && this._sel && this._sel.byCol) { this._sel.b = { ri: lastR, ci: c1 >= this._sel.a.ci ? c1 : c0 }; } else { this._sel = { a: { ri: 0, ci: c0 }, b: { ri: lastR, ci: c1 }, byCol: true, leafOnly: true }; }
            e.preventDefault(); touch(); return;
          }
          if (all) { this._sel = { a: { ri: 0, ci: 0 }, b: { ri: lastR, ci: lastC }, leafOnly: true }; e.preventDefault(); touch(); return; }
        }
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
      root.addEventListener("keydown", (e) => {
        if (!e.target.matches("input.zsacFx")) { return; }
        if (e.key === "Enter") { e.preventDefault(); this._applyFormula(e.target.value); } else if (e.key === "Escape") { this._syncBar(); }
      });
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
      const fullCols = !!g && g.c0 === 0 && g.c1 === (this._cols ? this._cols.length - 1 : 0);
      const fullRows = !!g && g.r0 === 0 && g.r1 === (this._rows ? this._rows.length - 1 : 0);
      root.querySelectorAll("[data-hr]").forEach((el) => { const ri = Number(el.dataset.hr); el.classList.toggle("zsacSelHdr", fullCols && ri >= g.r0 && ri <= g.r1); });
      root.querySelectorAll("th[data-hc]").forEach((el) => { const [a, b] = el.dataset.hc.split("-").map(Number); el.classList.toggle("zsacSelHdr", fullRows && a >= g.c0 && b <= g.c1); });
      this._syncBar();
    },

    /** The formula bar shows the selected cell (its label and plain value) when it is switched on and this is the grid the planner works in. */
    _syncBar() {
      const root = this.getDomRef();
      if (!root) { return; }
      const plan = this._ctx && this._ctx.plan;
      const on = !!(plan && plan.formulaBar && plan.active === this);
      root.classList.toggle("zsacFxOn", on);
      if (!on) { return; }
      const name = root.querySelector(".zsacFxName");
      const input = root.querySelector("input.zsacFx");
      if (!name || !input) { return; }
      const cells = this.getSelectedCells();
      const editable = cells.filter((x) => x.state.editable);
      input.disabled = !editable.length;
      if (!cells.length) { name.textContent = "No cell selected"; input.value = ""; return; }
      if (cells.length === 1) {
        name.textContent = this._cellLabel(cells[0].rk, cells[0].ck);
        input.value = cells[0].value === undefined ? "" : String(Math.round(cells[0].value * 1e6) / 1e6);
      } else {
        name.textContent = cells.length + " cells" + (editable.length < cells.length ? " (" + editable.length + " plannable)" : "");
        input.value = "";
      }
    },

    /** Applies a value or formula to every plannable selected cell, as one undoable step. */
    _applyFormula(text) {
      const cells = this.getSelectedCells().filter((x) => x.state.editable);
      if (!cells.length) { MessageToast.show("Select the cells to change first"); return Promise.resolve(); }
      return this._formulaFor(cells, text);
    },

    async _formulaFor(cells, text) {
      const t = String(text).trim();
      if (!t) { return; }
      const f = FormulaEngine.compile(FormulaEngine.isFormula(t) || /^=/.test(t) ? t : "=" + t);
      if (f.error) { MessageToast.show(f.error); this.invalidate(); return; }
      const ids = (this._ctx.versions || []).map((v) => v.VersionId);
      const usable = this.getReferenceVersions().map((v) => v.VersionId);
      const refs = {};
      for (const name of f.names) {
        const id = ids.find((x) => x.toUpperCase() === name.toUpperCase());
        if (!id) { MessageToast.show("Unknown name " + name + ". Use current or a version id: " + ids.join(", ")); this.invalidate(); return; }
        if (usable.indexOf(id) < 0) { MessageToast.show("Version " + id + " cannot be used in this table"); this.invalidate(); return; }
        refs[name] = await this.getReferenceValues(id, cells);
      }
      const items = [];
      let bad = 0;
      cells.forEach((c, i) => {
        try {
          const env = { current: c.value || 0, refs: {} };
          Object.keys(refs).forEach((n) => { env.refs[n] = refs[n][i] || 0; });
          const v = f.evaluate(env);
          if (Number.isFinite(v)) { items.push({ ri: c.ri, ci: c.ci, value: v }); } else { bad++; }
        } catch (e) { bad++; }
      });
      const out = this.applyCellValues(items, "Formula " + t + " on " + items.length + (items.length === 1 ? " cell" : " cells"));
      out.skipped += bad;
      this._report(out);
      this.invalidate();
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
      // a row, column or the whole table picked by its header acts on the numbers, not on the totals in between: along an axis that
      // holds several cells the aggregated ones (parent nodes, years, quarters) are left out
      const r = this._result;
      if (!(this._sel && this._sel.leafOnly)) { return out; }
      const rg = this._range();
      const rowAgg = (rk) => !!(r.rowInfo && r.rowInfo(rk).hasChildren);
      const colAgg = (ck) => !!(r.colInfo && r.colInfo(ck).hasChildren);
      return out.filter((x) => (rg.r1 === rg.r0 || !rowAgg(x.rk)) && (rg.c1 === rg.c0 || !colAgg(x.ck)));
    },

    selectionInfo() {
      const cells = this.getSelectedCells();
      return { count: cells.length, editable: cells.filter((x) => x.state.editable).length, leafOnly: !!(this._sel && this._sel.leafOnly) };
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
      if (FormulaEngine.isFormula(input.value)) {
        this._formulaFor([{ ri: Number(input.dataset.ri), ci: Number(input.dataset.ci), rk, ck, value: this._result.cell(rk, ck), state: this._stateOf(rk, ck) }], input.value);
        return;
      }
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
