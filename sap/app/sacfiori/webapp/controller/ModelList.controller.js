sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
  "use strict";

  /** Landing page of the Modeller: all models, open one or create a new one. */
  return BaseController.extend("zsac.fiori.controller.ModelList", {
    onInit() {
      this._model = new JSONModel({ items: [] });
      this._q = "";
      this.getView().setModel(this._model, "view");
      this.onRoute("modelers", () => this._load());
    },

    async _load() {
      this._all = await (await this.provider()).listModels();
      this._render();
    },

    _render() {
      const q = this._q.toLowerCase();
      this._model.setProperty("/items", this._all.filter((m) => !q || (m.Name + " " + m.ModelId).toLowerCase().includes(q))
        .map((m) => Object.assign({}, m, { dims: m.Dimensions.length, measures: m.Measures.length })));
    },

    onSearch(e) { this._q = e.getParameter("newValue") || ""; this._render(); },
    onCreate() { this.navTo("modeller", { id: "new" }); },
    onOpen(e) { this.navTo("modeller", { id: e.getSource().getBindingContext("view").getObject().ModelId }); },

    onDelete: function (e) {
      this.guard(async () => {
        const m = e.getSource().getBindingContext("view").getObject();
        if (!(await this.confirm("Delete model " + m.Name + " with all its data?", "Delete"))) { return; }
        await (await this.provider()).deleteModel(m.ModelId);
        await this._load();
      })();
    }
  });
});
