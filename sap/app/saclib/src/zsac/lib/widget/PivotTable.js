/** Read-only pivot grid for an aggregate result of QueryEngine: row dimensions left, column keys across, totals optional. */
sap.ui.define(["sap/ui/core/Control", "../core/Format", "../core/QueryEngine", "../core/ModelSchema"], function (Control, Format, QueryEngine, ModelSchema) {
  "use strict";

  const esc = Format.esc;

  return Control.extend("zsac.lib.widget.PivotTable", {
    metadata: {
      properties: {
        result: { type: "object", defaultValue: null },
        showTotals: { type: "boolean", defaultValue: true },
        decimals: { type: "int", defaultValue: -1 }   // -1: the measure's own decimal places
      }
    },

    renderer: {
      apiVersion: 2,
      render(rm, control) {
        rm.openStart("div", control).class("zsacPivot").openEnd();
        rm.unsafeHtml(control._html());
        rm.close("div");
      }
    },

    /** Same grid as CSV text (used by the analyser's export). */
    toCsv() {
      const r = this.getResult();
      if (!r) { return ""; }
      const model = r.model;
      const head = r.rowDims.map((d) => QueryEngine.labelOf(model, d)).concat(r.colKeys.map((c) => c.join(" / ") || "Value"));
      const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
      const lines = [head.map(q).join(",")];
      r.rowKeys.forEach((rk) => lines.push(rk.map(q).concat(r.colKeys.map((ck) => r.cell(rk, ck) || 0)).join(",")));
      return lines.join("\n");
    },

    _html() {
      const r = this.getResult();
      if (!r || !r.rowKeys.length) { return '<div class="zsacCardMsg">No data</div>'; }
      const model = r.model;
      const measure = r.measure;
      const scale = measure && measure.Scale > 1 ? measure.Scale : 1;
      const dec = this.getDecimals() >= 0 ? this.getDecimals() : (measure ? measure.Decimals : 0);
      const num = (v) => Format.full(v / scale, dec);
      const valueHead = measure ? measure.Label + (ModelSchema.unitLabel(measure) ? " (" + ModelSchema.unitLabel(measure) + ")" : "") : "Value";
      const totals = this.getShowTotals();
      const cols = r.colKeys.length ? r.colKeys : [[]];
      let h = measure ? '<div class="zsacSmall zsacPivotCaption">' + esc(measure.Label + (ModelSchema.unitLabel(measure) ? ", " + ModelSchema.unitLabel(measure) : "")) + "</div>" : "";
      h += '<table class="zsacGrid2"><thead><tr>';
      r.rowDims.forEach((d) => { h += "<th>" + esc(QueryEngine.labelOf(model, d)) + "</th>"; });
      if (!r.rowDims.length) { h += "<th></th>"; }
      cols.forEach((c) => { h += '<th class="num">' + esc(c.join(" / ") || valueHead) + "</th>"; });
      if (totals && r.colKeys.length > 1) { h += '<th class="num total">Total</th>'; }
      h += "</tr></thead><tbody>";
      let prev = [];
      (r.rowKeys.length ? r.rowKeys : [[]]).forEach((rk) => {
        h += "<tr>";
        rk.forEach((m, i) => {
          const same = prev.slice(0, i + 1).join("\u0001") === rk.slice(0, i + 1).join("\u0001");
          h += "<td" + (same ? ' class="repeat"' : "") + ">" + (same ? "" : esc(m)) + "</td>";
        });
        if (!rk.length) { h += "<td>All</td>"; }
        cols.forEach((c) => { h += '<td class="num">' + num(r.cell(rk, c) || 0) + "</td>"; });
        if (totals && r.colKeys.length > 1) { h += '<td class="num total">' + num(r.rowTotal(rk)) + "</td>"; }
        h += "</tr>";
        prev = rk;
      });
      if (totals && r.rowKeys.length > 1) {
        h += '<tr class="grand"><td colspan="' + Math.max(1, r.rowDims.length) + '">Total</td>';
        cols.forEach((c) => { h += '<td class="num">' + num(r.colTotal(c)) + "</td>"; });
        if (r.colKeys.length > 1) { h += '<td class="num total">' + num(r.grand) + "</td>"; }
        h += "</tr>";
      }
      return h + "</tbody></table>";
    }
  });
});
