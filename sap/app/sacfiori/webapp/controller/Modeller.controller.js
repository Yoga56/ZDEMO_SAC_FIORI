sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
  "use strict";

  const ID = /^[A-Z][A-Z0-9_]*$/;
  const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

  /**
   * Model editor. A dimension that already carries data keeps its id and slot (the facts are stored per slot);
   * new dimensions can be appended and members edited at any time.
   */
  return BaseController.extend("zsac.fiori.controller.Modeller", {
    onInit() {
      this._m = new JSONModel({});
      this.getView().setModel(this._m, "m");
      this.onRoute("modeller", (args) => this._load(args.id));
    },

    async _load(id) {
      const p = await this.provider();
      if (id === "new") {
        this._m.setData({ isNew: true, ModelId: "", Name: "", Description: "", Currency: "USD", PeriodFrom: "2026-01", PeriodTo: "2026-12",
          Dimensions: [{ DimId: "REGION", Label: "Region", MembersText: "EMEA\nAPAC\nAMER", existing: false }],
          Measures: [{ MeasureId: "AMOUNT", Label: "Amount", Unit: "USD", existing: false }] });
        return;
      }
      const m = await p.getModel(id);
      this._m.setData(Object.assign({}, m, { isNew: false,
        Dimensions: m.Dimensions.map((d) => ({ DimId: d.DimId, Label: d.Label, existing: true,
          MembersText: (d.Members || []).map((x) => (x.Text && x.Text !== x.Id ? x.Id + " | " + x.Text : x.Id)).join("\n") })),
        Measures: m.Measures.map((x) => Object.assign({ existing: true }, x)) }));
    },

    onAddDim() { const d = this._m.getProperty("/Dimensions"); d.push({ DimId: "", Label: "", MembersText: "", existing: false }); this._m.setProperty("/Dimensions", d); },
    onAddMeasure() { const d = this._m.getProperty("/Measures"); d.push({ MeasureId: "", Label: "", Unit: "", existing: false }); this._m.setProperty("/Measures", d); },
    onRemoveDim(e) { this._remove("/Dimensions", e); },
    onRemoveMeasure(e) { this._remove("/Measures", e); },
    _remove(path, e) {
      const i = Number(e.getSource().getBindingContext("m").getPath().split("/").pop());
      const list = this._m.getProperty(path);
      list.splice(i, 1);
      this._m.setProperty(path, list);
    },

    onSave: function () {
      this.guard(async () => {
        const d = this._m.getData();
        const problems = [];
        if (!ID.test(d.ModelId || "")) { problems.push("Model ID: capital letters, digits and underscore, starting with a letter"); }
        if (!(d.Name || "").trim()) { problems.push("Name is required"); }
        if (!PERIOD.test(d.PeriodFrom || "") || !PERIOD.test(d.PeriodTo || "") || d.PeriodFrom > d.PeriodTo) { problems.push("Periods must look like 2026-01 and start before they end"); }
        if (!d.Dimensions.length) { problems.push("At least one dimension"); }
        if (!d.Measures.length) { problems.push("At least one measure"); }
        const ids = d.Dimensions.map((x) => x.DimId).concat(d.Measures.map((x) => x.MeasureId));
        if (ids.some((x) => !ID.test(x))) { problems.push("Dimension and measure IDs: capital letters, digits and underscore"); }
        if (new Set(d.Dimensions.map((x) => x.DimId)).size !== d.Dimensions.length || ["VERSION", "PERIOD", "MEASURE"].some((x) => d.Dimensions.some((y) => y.DimId === x))) { problems.push("Dimension IDs must be unique and not VERSION, PERIOD or MEASURE"); }
        if (new Set(d.Measures.map((x) => x.MeasureId)).size !== d.Measures.length) { problems.push("Measure IDs must be unique"); }
        if (problems.length) { throw new Error(problems.join("\n")); }

        const p = await this.provider();
        const model = {
          ModelId: d.ModelId, Name: d.Name.trim(), Description: d.Description || "", Currency: d.Currency || "", PeriodFrom: d.PeriodFrom, PeriodTo: d.PeriodTo,
          Dimensions: d.Dimensions.map((x, i) => ({ DimId: x.DimId, Label: x.Label || x.DimId, Slot: i + 1,
            Members: x.MembersText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [id, ...t] = l.split("|"); return { Id: id.trim(), Text: (t.join("|") || id).trim() }; }) })),
          Measures: d.Measures.map((x) => ({ MeasureId: x.MeasureId, Label: x.Label || x.MeasureId, Unit: x.Unit || "", Aggregation: "SUM" }))
        };
        if (d.isNew && (await p.listModels()).some((m) => m.ModelId === d.ModelId)) { throw new Error("A model with ID " + d.ModelId + " already exists"); }
        await p.saveModel(model);
        if (d.isNew) {
          for (const v of [["ACT", "Actual", "ACTUAL", true], ["BUD", "Budget", "BUDGET", false], ["FCT", "Forecast", "FORECAST", false]]) {
            await p.saveVersion({ ModelId: d.ModelId, VersionId: v[0], Name: v[1], Category: v[2], Locked: v[3], Owner: "SYSTEM", SourceVersion: "", Status: "P" });
          }
        }
        this.toast("Dataset saved");
        this.navTo("datasets");
      })();
    }
  });
});
