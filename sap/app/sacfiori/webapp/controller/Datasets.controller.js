sap.ui.define([
  "./BaseController",
  "../model/DataTools",
  "sap/ui/model/json/JSONModel"
], function (BaseController, DataTools, JSONModel) {
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
      const [models, versions] = await Promise.all([p.listModels(), p.listVersions()]);
      this._model.setProperty("/items", models.map((m) => Object.assign({}, m, {
        dims: m.Dimensions.map((d) => d.Label).join(", "),
        measures: m.Measures.map((x) => x.Label).join(", "),
        versions: versions.filter((v) => v.ModelId === m.ModelId).map((v) => v.VersionId).join(", ")
      })));
    },

    _m(e) { return e.getSource().getBindingContext("view").getObject(); },

    onCreate() { this.navTo("modeller", { id: "new" }); },
    onEdit(e) { this.navTo("modeller", { id: this._m(e).ModelId }); },   // the Modeller owns the model structure

    onDelete: function (e) {
      this.guard(async () => {
        const m = this._m(e);
        if (!(await this.confirm("Delete dataset " + m.Name + " and all its data?", "Delete"))) { return; }
        await (await this.provider()).deleteModel(m.ModelId);
        await this._load();
      })();
    },

    onPreview: function (e) { this.guard(() => DataTools.preview(this, this._m(e)))(); },
    onExport: function (e) { this.guard(() => DataTools.exportCsv(this, this._m(e)))(); },
    onImport: function (e) {
      this.guard(async () => {
        const n = await DataTools.importCsv(this, this._m(e));
        if (n) { this.toast(n + " values imported"); await this._load(); }
      })();
    }
  });
});
