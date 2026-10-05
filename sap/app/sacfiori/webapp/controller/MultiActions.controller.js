sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter", "sap/ui/model/FilterOperator",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Label",
  "zsac/lib/planning/DataActionRun",
  "zsac/lib/core/StorySchema"
], function (BaseController, JSONModel, Filter, FilterOperator, Dialog, Button, Input, Label, Run, StorySchema) {
  "use strict";

  /** Multi Actions landing page: the list (open, run, duplicate, delete); the designer is the multiaction route. */
  return BaseController.extend("zsac.fiori.controller.MultiActions", {
    onInit() {
      this._list = new JSONModel({ items: [] });
      this.getView().setModel(this._list, "list");
      this.onRoute("multiactions", () => this._load());
    },

    async _load() {
      const p = (this._p = await this.provider());
      const [items, runs] = await Promise.all([p.listMultiActions(), p.listRuns(null, 200)]);
      const last = new Map();
      runs.forEach((r) => { if (r.Kind === "MULTI" && !last.has(r.ActionId)) { last.set(r.ActionId, r); } });
      this._list.setProperty("/items", items.map((a) => {
        const r = last.get(a.Id);
        return Object.assign({}, a, { StepCount: (a.Steps || []).length, ParamCount: (a.Parameters || []).length,
          LastRunText: r ? (r.Status === "S" ? "Succeeded " : "Failed ") + new Date(r.At).toLocaleString() : "Never run", LastRunState: r ? (r.Status === "S" ? "Success" : "Error") : "None" });
      }));
    },

    onSearch(e) {
      const q = e.getParameter("newValue");
      this.byId("table").getBinding("items").filter(q ? [new Filter("Name", FilterOperator.Contains, q)] : []);
    },
    onJobs() { this.navTo("dataactions", { query: { tab: "runs" } }); },
    _row(e) { return e.getSource().getBindingContext("list").getObject(); },
    onOpen(e) { this.navTo("multiaction", { id: this._row(e).Id }); },
    onRunRow(e) { Run.openMulti({ provider: this._p, actionId: this._row(e).Id, onDone: () => this._load().catch((x) => this.fail(x)) }); },

    onDuplicateRow: function (e) {
      const row = this._row(e);
      this.guard(async () => {
        const copy = JSON.parse(JSON.stringify(await this._p.getMultiAction(row.Id)));
        copy.Id = StorySchema.uid("MA");
        copy.Name = row.Name + " (copy)";
        await this._p.saveMultiAction(copy);
        this.toast("Duplicated");
        await this._load();
      })();
    },

    onDeleteRow: function (e) {
      const row = this._row(e);
      this.guard(async () => {
        if (!(await this.confirm("Delete the multi action \"" + row.Name + "\"?", "Delete"))) { return; }
        await this._p.deleteMultiAction(row.Id);
        await this._load();
      })();
    },

    onNew() {
      const name = new Input({ width: "100%", placeholder: "Name" });
      const dlg = new Dialog({ title: "Create multi action",
        content: [this._margin({ width: "22rem", items: [new Label({ text: "Name", required: true }), name] })],
        beginButton: new Button({ text: "Create", type: "Emphasized", press: this.guard(async () => {
          if (!name.getValue().trim()) { name.setValueState("Error"); return; }
          const a = { Id: StorySchema.uid("MA"), Name: name.getValue().trim(), Description: "", Parameters: [], Steps: [] };
          await this._p.saveMultiAction(a);
          dlg.close();
          this.navTo("multiaction", { id: a.Id });
        }) }),
        endButton: new Button({ text: "Cancel", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
      dlg.open();
    }
  });
});
