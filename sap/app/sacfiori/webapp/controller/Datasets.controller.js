sap.ui.define([
  "./BaseController",
  "../model/Csv",
  "sap/ui/model/json/JSONModel",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Table", "sap/m/Column", "sap/m/ColumnListItem", "sap/m/Text", "sap/m/ScrollContainer"
], function (BaseController, Csv, JSONModel, Dialog, Button, Table, Column, ColumnListItem, Text, ScrollContainer) {
  "use strict";

  /** Datasets: models with their facts. Preview, CSV import/export, open in the modeller. */
  return BaseController.extend("zsac.fiori.controller.Datasets", {
    onInit() {
      this._model = new JSONModel({ items: [] });
      this.getView().setModel(this._model, "view");
      this.onRoute("datasets", () => this._load());
    },

    async _load() {
      const p = await this.provider();
      const models = await p.listModels();
      const versions = await p.listVersions();
      this._model.setProperty("/items", models.map((m) => Object.assign({}, m, {
        dims: m.Dimensions.map((d) => d.Label).join(", "),
        measures: m.Measures.map((x) => x.Label).join(", "),
        versions: versions.filter((v) => v.ModelId === m.ModelId).map((v) => v.VersionId).join(", ")
      })));
    },

    _m(e) { return e.getSource().getBindingContext("view").getObject(); },

    onCreate() { this.navTo("modeller", { id: "new" }); },
    onEdit(e) { this.navTo("modeller", { id: this._m(e).ModelId }); },

    onDelete: function (e) {
      this.guard(async () => {
        const m = this._m(e);
        if (!(await this.confirm("Delete dataset " + m.Name + " and all its data?", "Delete"))) { return; }
        await (await this.provider()).deleteModel(m.ModelId);
        await this._load();
      })();
    },

    onPreview: function (e) {
      this.guard(async () => {
        const m = this._m(e);
        const facts = (await (await this.provider()).readFacts(m.ModelId, {})).slice(0, 200);
        const table = new Table({ growing: true, growingThreshold: 50, sticky: ["ColumnHeaders"] });
        const cols = ["VersionId", "Period", "Measure"].concat(m.Dimensions.map((d) => "Dim" + d.Slot)).concat(["Value"]);
        const heads = ["Version", "Period", "Measure"].concat(m.Dimensions.map((d) => d.Label)).concat(["Value"]);
        heads.forEach((h) => table.addColumn(new Column({ header: new Text({ text: h }), hAlign: h === "Value" ? "End" : "Begin" })));
        facts.forEach((f) => table.addItem(new ColumnListItem({ cells: cols.map((c) => new Text({ text: String(f[c]) })) })));
        const dlg = new Dialog({ title: m.Name + " (first " + facts.length + " rows)", contentWidth: "60rem", contentHeight: "30rem", content: [new ScrollContainer({ height: "100%", vertical: true, content: [table] })],
          endButton: new Button({ text: "Close", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
        dlg.open();
      })();
    },

    onExport: function (e) {
      this.guard(async () => {
        const m = this._m(e);
        const facts = await (await this.provider()).readFacts(m.ModelId, {});
        const head = ["VERSION", "PERIOD", "MEASURE"].concat(m.Dimensions.map((d) => d.DimId)).concat(["VALUE"]);
        const rows = facts.map((f) => [f.VersionId, f.Period, f.Measure].concat(m.Dimensions.map((d) => f["Dim" + d.Slot])).concat([f.Value]));
        Csv.download(m.ModelId + ".csv", Csv.write([head].concat(rows)));
      })();
    },

    onImport: function (e) {
      this.guard(async () => {
        const m = this._m(e);
        const p = await this.provider();
        const file = await Csv.pick();
        if (!file) { return; }
        const rows = Csv.parse(file.text);
        const head = rows.shift().map((h) => h.trim().toUpperCase());
        const need = ["VERSION", "PERIOD", "MEASURE", "VALUE"].concat(m.Dimensions.map((d) => d.DimId));
        const missing = need.filter((n) => head.indexOf(n) < 0);
        if (missing.length) { throw new Error("Missing columns: " + missing.join(", ") + "\nExpected: " + need.join(", ")); }
        const versions = (await p.listVersions(m.ModelId)).map((v) => v.VersionId);
        const measures = m.Measures.map((x) => x.MeasureId);
        const col = (n) => head.indexOf(n);
        const facts = rows.map((r, i) => {
          const f = { VersionId: r[col("VERSION")].trim(), Period: r[col("PERIOD")].trim(), Measure: r[col("MEASURE")].trim(), Dim1: "", Dim2: "", Dim3: "", Dim4: "", Dim5: "",
            Value: Number(r[col("VALUE")]) };
          m.Dimensions.forEach((d) => { f["Dim" + d.Slot] = (r[col(d.DimId)] || "").trim(); });
          if (versions.indexOf(f.VersionId) < 0) { throw new Error("Row " + (i + 2) + ": version " + f.VersionId + " does not exist"); }
          if (measures.indexOf(f.Measure) < 0) { throw new Error("Row " + (i + 2) + ": unknown measure " + f.Measure); }
          if (!/^\d{4}-\d{2}$/.test(f.Period)) { throw new Error("Row " + (i + 2) + ": period must look like 2026-03"); }
          if (!isFinite(f.Value)) { throw new Error("Row " + (i + 2) + ": value is not a number"); }
          return f;
        });
        for (let i = 0; i < facts.length; i += 500) { await p.writeFacts(m.ModelId, facts.slice(i, i + 500)); }
        this.toast(facts.length + " values imported");
      })();
    }
  });
});
