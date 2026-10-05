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
  "./PlanEditor"
], function (Control, MessageToast, Format, QueryEngine, PlanEditor) {
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
        rm.openStart("div", grid).class("zsacPlan").openEnd();
        rm.unsafeHtml(grid._html());
        rm.close("div");
      }
    },

    setContext(ctx) {
      if (this._ctx && this._ctx.plan) { this._ctx.plan.detachChange(this._onPlan); }
      this._ctx = ctx;
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

      const dec = o.decimals >= 0 ? o.decimals : ((r.measure || (c.model.Measures || [])[0] || {}).Decimals || 0);
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
            h += '<td class="num"><input class="zsacCell2' + (aggregated ? " zsacAggCell" : "") + (dirty ? " zsacDirtyCell" : "") + (v === undefined ? " zsacMissing" : "") + '" data-ri="' + ri + '" data-ci="' + ci + '" value="' + text + '"></td>';
          } else {
            h += '<td class="num' + (aggregated ? " zsacAggCell" : "") + (dirty ? " zsacDirtyCell" : "") + '"' + (o.editable && state.reason ? ' title="' + esc(state.reason) + '"' : "") + ">" + text + "</td>";
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
      if (root._zsacBound) { return; }
      root._zsacBound = true;
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
      if (c.plan) { c.plan.apply(out.changes, lookup); }
    }
  });
});
