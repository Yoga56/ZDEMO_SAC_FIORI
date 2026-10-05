sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter", "sap/ui/model/FilterOperator",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Label", "sap/m/Select", "sap/m/TextArea", "sap/m/VBox", "sap/ui/core/Item",
  "zsac/lib/planning/DataActionRun",
  "zsac/lib/planning/DataActionSchema",
  "zsac/lib/core/StorySchema"
], function (BaseController, JSONModel, Filter, FilterOperator, Dialog, Button, Input, Label, Select, TextArea, VBox, Item, DataActionRun, Schema, StorySchema) {
  "use strict";

  const fmtAt = (at) => (at ? new Date(at).toLocaleString() : "");

  /** Data Actions landing page: the list of actions (open, run, duplicate, delete) and the run history (Job Monitor). */
  return BaseController.extend("zsac.fiori.controller.DataActions", {
    onInit() {
      this._list = new JSONModel({ items: [] });
      this._runs = new JSONModel({ items: [] });
      this.getView().setModel(this._list, "list");
      this.getView().setModel(this._runs, "runs");
      this.onRoute("dataactions", (args) => this._load((args["?query"] || {}).tab));
    },

    async _load(tab) {
      const p = (this._p = await this.provider());
      const [actions, models, runs] = await Promise.all([p.listDataActions(), p.listModels(), p.listRuns(null, 200)]);
      this._models = models;
      const names = new Map(models.map((m) => [m.ModelId, m.Name]));
      const last = new Map();
      runs.forEach((r) => { if (r.Kind === "DATA" && !last.has(r.ActionId)) { last.set(r.ActionId, r); } });
      this._list.setProperty("/items", actions.map((a) => {
        const r = last.get(a.Id);
        return Object.assign({}, a, { ModelName: names.get(a.ModelId) || a.ModelId, StepCount: (a.Steps || []).length, ParamCount: (a.Parameters || []).length,
          LastRunText: r ? (r.Status === "S" ? "Succeeded " : "Failed ") + fmtAt(r.At) : "Never run", LastRunState: r ? (r.Status === "S" ? "Success" : "Error") : "None" });
      }));
      this._runs.setProperty("/items", runs.map((r) => Object.assign({}, r, {
        StatusText: r.Status === "S" ? "Succeeded" : "Failed", StatusState: r.Status === "S" ? "Success" : "Error", KindText: r.Kind === "MULTI" ? "Multi Action" : "Data Action",
        DurationText: r.DurationMs + " ms", AtText: fmtAt(r.At) })));
      if (tab === "runs") { this.byId("tabs").setSelectedKey("runs"); }
    },

    onTab() { /* both tabs are loaded together */ },
    onRefreshRuns: function () { this.guard(() => this._load("runs"))(); },

    onSearch(e) {
      const q = e.getParameter("newValue");
      this.byId("actionTable").getBinding("items").filter(q ? [new Filter("Name", FilterOperator.Contains, q)] : []);
    },

    _row(e) { return e.getSource().getBindingContext("list").getObject(); },

    onOpen(e) { this.navTo("dataaction", { id: this._row(e).Id }); },

    onRunRow(e) {
      DataActionRun.open({ provider: this._p, actionId: this._row(e).Id, onDone: () => this._load().catch((x) => this.fail(x)) });
    },

    onDuplicateRow: function (e) {
      const row = this._row(e);
      this.guard(async () => {
        const copy = JSON.parse(JSON.stringify(await this._p.getDataAction(row.Id)));
        copy.Id = StorySchema.uid("DA");
        copy.Name = row.Name + " (copy)";
        await this._p.saveDataAction(copy);
        this.toast("Duplicated");
        await this._load();
      })();
    },

    onDeleteRow: function (e) {
      const row = this._row(e);
      this.guard(async () => {
        if (!(await this.confirm("Delete the data action \"" + row.Name + "\"?", "Delete"))) { return; }
        await this._p.deleteDataAction(row.Id);
        await this._load();
      })();
    },

    onNew() {
      if (!this._models || !this._models.length) { this.toast("Create a dataset first"); return; }
      const name = new Input({ width: "100%", placeholder: "Name" });
      const model = new Select({ width: "100%", selectedKey: this._models[0].ModelId });
      this._models.forEach((m) => model.addItem(new Item({ key: m.ModelId, text: m.Name })));
      const dlg = new Dialog({ title: "Create data action",
        content: [this._margin({ width: "22rem", items: [new Label({ text: "Name", required: true }), name, new Label({ text: "Model", required: true }), model] })],
        beginButton: new Button({ text: "Create", type: "Emphasized", press: this.guard(async () => {
          if (!name.getValue().trim()) { name.setValueState("Error"); return; }
          const a = { Id: StorySchema.uid("DA"), ModelId: model.getSelectedKey(), Name: name.getValue().trim(), Description: "", Parameters: [], Steps: [] };
          await this._p.saveDataAction(a);
          dlg.close();
          this.navTo("dataaction", { id: a.Id });
        }) }),
        endButton: new Button({ text: "Cancel", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
      dlg.open();
    },

    onRunDetail(e) {
      const r = e.getSource().getBindingContext("runs").getObject();
      const lines = [r.ActionName + "  (" + r.KindText + ")", "Status: " + r.StatusText + "   Changed: " + r.Changed + "   " + r.DurationText + "   User: " + r.User + "   " + r.AtText];
      if (r.ParamsText) { lines.push("Parameters: " + r.ParamsText); }
      (r.Steps || []).forEach((s) => lines.push("Step " + s.no / 10 + " " + s.name + ": " + s.touched + " values" + (s.message ? " - " + s.message : "")));
      lines.push("", "Log"); (r.Log || []).forEach((l) => lines.push(l));
      const dlg = new Dialog({ title: "Run " + r.Id, content: [new TextArea({ value: lines.join("\n"), rows: 14, width: "34rem", editable: false })],
        endButton: new Button({ text: "Close", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
      dlg.open();
    }
  });
});
