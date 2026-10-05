sap.ui.define([
  "./Csv",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Table", "sap/m/Column", "sap/m/ColumnListItem", "sap/m/Text", "sap/m/ScrollContainer"
], function (Csv, Dialog, Button, Table, Column, ColumnListItem, Text, ScrollContainer) {
  "use strict";

  /** Preview, CSV import and export of a model's facts; shared by the Datasets page and the Modeller's Data Management view. */
  return {
    async preview(controller, m) {
      const facts = (await (await controller.provider()).readFacts(m.ModelId, {})).slice(0, 200);
      const table = new Table({ growing: true, growingThreshold: 50, sticky: ["ColumnHeaders"] });
      const cols = ["VersionId", "Period", "Measure"].concat(m.Dimensions.map((d) => "Dim" + d.Slot)).concat(["Value"]);
      const heads = ["Version", "Period", "Measure"].concat(m.Dimensions.map((d) => d.Label)).concat(["Value"]);
      heads.forEach((h) => table.addColumn(new Column({ header: new Text({ text: h }), hAlign: h === "Value" ? "End" : "Begin" })));
      facts.forEach((f) => table.addItem(new ColumnListItem({ cells: cols.map((c) => new Text({ text: String(f[c]) })) })));
      const dlg = new Dialog({ title: m.Name + " (first " + facts.length + " rows)", contentWidth: "60rem", contentHeight: "30rem",
        content: [new ScrollContainer({ height: "100%", vertical: true, content: [table] })],
        endButton: new Button({ text: "Close", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
      dlg.open();
    },

    async exportCsv(controller, m) {
      const facts = await (await controller.provider()).readFacts(m.ModelId, {});
      const head = ["VERSION", "PERIOD", "MEASURE"].concat(m.Dimensions.map((d) => d.DimId)).concat(["VALUE"]);
      const rows = facts.map((f) => [f.VersionId, f.Period, f.Measure].concat(m.Dimensions.map((d) => f["Dim" + d.Slot])).concat([f.Value]));
      Csv.download(m.ModelId + ".csv", Csv.write([head].concat(rows)));
    },

    /** @returns {Promise<number>} values imported (0 when the user cancelled the file dialog) */
    async importCsv(controller, m) {
      const p = await controller.provider();
      const file = await Csv.pick();
      if (!file) { return 0; }
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
      await p.saveModel(Object.assign({}, m, { DataSource: file.name }));
      return facts.length;
    },

    /** Row counts per version and measure, for the Data Management view. */
    async summary(controller, m) {
      const p = await controller.provider();
      const [facts, versions] = await Promise.all([p.readFacts(m.ModelId, {}), p.listVersions(m.ModelId)]);
      return versions.map((v) => {
        const own = facts.filter((f) => f.VersionId === v.VersionId);
        const periods = Array.from(new Set(own.map((f) => f.Period))).sort();
        return { VersionId: v.VersionId, Name: v.Name, Category: v.Category, Locked: v.Locked, Rows: own.length,
          Range: periods.length ? periods[0] + " to " + periods[periods.length - 1] : "-" };
      });
    }
  };
});
