sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/core/Item",
  "sap/m/HBox", "sap/m/Select", "sap/m/Input", "sap/m/Button", "sap/m/Text", "sap/m/Dialog", "sap/m/TextArea", "sap/m/ObjectStatus",
  "zsac/lib/core/StorySchema"
], function (BaseController, JSONModel, Item, HBox, Select, Input, Button, Text, Dialog, TextArea, ObjectStatus, StorySchema) {
  "use strict";

  /** Multi action designer: orchestrate data actions and version publishing in a fixed order. */
  return BaseController.extend("zsac.fiori.controller.MultiActions", {
    onInit() {
      this._list = new JSONModel({ items: [] });
      this.getView().setModel(this._list, "list");
      this.onRoute("multiactions", (args) => this._load((args["?query"] || {}).id));
    },

    async _load(id) {
      const p = (this._p = await this.provider());
      const items = await p.listMultiActions();
      this._list.setProperty("/items", items);
      this._dataActions = await p.listDataActions();
      this._models = await p.listModels();
      this._versions = await p.listVersions();
      const hit = items.find((x) => x.Id === id) || items[0];
      if (hit) { this._edit(hit); } else { this.byId("detail").setVisible(false); }
    },

    _edit(action) {
      this._action = JSON.parse(JSON.stringify(action));
      this.byId("detail").setVisible(true);
      this.byId("title").setText(this._action.Name);
      this.byId("name").setValue(this._action.Name);
      this.byId("desc").setValue(this._action.Description || "");
      this._steps();
      const i = this._list.getProperty("/items").findIndex((x) => x.Id === action.Id);
      const list = this.byId("list");
      if (i >= 0) { list.setSelectedItem(list.getItems()[i]); }
    },

    _steps() {
      const box = this.byId("steps");
      box.destroyItems();
      this._action.Steps.sort((a, b) => a.StepNo - b.StepNo).forEach((s, i) => {
        const row = new HBox({ alignItems: "Center", wrap: "Wrap" }).addStyleClass("sapUiTinyMarginBottom");
        const no = new Input({ value: String(s.StepNo), type: "Number", width: "4rem", change: (e) => { s.StepNo = Number(e.getParameter("value")); } });
        const type = new Select({ selectedKey: s.StepType, width: "11rem", items: [new Item({ key: "DATAACTION", text: "Run data action" }), new Item({ key: "PUBLISH", text: "Publish version" })],
          change: (e) => { s.StepType = e.getParameter("selectedItem").getKey(); this._steps(); } });
        row.addItem(no.addStyleClass("sapUiTinyMarginEnd")); row.addItem(type.addStyleClass("sapUiTinyMarginEnd"));
        if (s.StepType === "DATAACTION") {
          const sel = new Select({ selectedKey: s.ActionId, width: "18rem", forceSelection: false, change: (e) => { s.ActionId = e.getParameter("selectedItem").getKey(); } });
          this._dataActions.forEach((a) => sel.addItem(new Item({ key: a.Id, text: a.Name })));
          row.addItem(sel);
        } else {
          const model = new Select({ selectedKey: s.ModelId, width: "11rem", forceSelection: false, change: (e) => { s.ModelId = e.getParameter("selectedItem").getKey(); s.SourceVersion = ""; s.TargetVersion = ""; this._steps(); } });
          this._models.forEach((m) => model.addItem(new Item({ key: m.ModelId, text: m.Name })));
          const versions = this._versions.filter((v) => v.ModelId === s.ModelId);
          const mk = (key, field) => { const x = new Select({ selectedKey: s[field], width: "10rem", forceSelection: false, change: (e) => { s[field] = e.getParameter("selectedItem").getKey(); } });
            versions.forEach((v) => x.addItem(new Item({ key: v.VersionId, text: v.VersionId }))); return x; };
          row.addItem(model.addStyleClass("sapUiTinyMarginEnd"));
          row.addItem(mk("src", "SourceVersion").addStyleClass("sapUiTinyMarginEnd"));
          row.addItem(new Text({ text: "to" }).addStyleClass("sapUiTinyMarginEnd"));
          row.addItem(mk("tgt", "TargetVersion"));
        }
        row.addItem(new Button({ icon: "sap-icon://delete", type: "Transparent", press: () => { this._action.Steps.splice(i, 1); this._steps(); } }));
        box.addItem(row);
      });
    },

    onHeader() { this._action.Name = this.byId("name").getValue(); this._action.Description = this.byId("desc").getValue(); this.byId("title").setText(this._action.Name); },
    onSelect(e) { this._edit(e.getParameter("listItem").getBindingContext("list").getObject()); },
    onNew() { this._edit({ Id: StorySchema.uid("MA"), Name: "New multi action", Description: "", Steps: [] }); },

    onAddStep() {
      const steps = this._action.Steps;
      steps.push({ StepNo: (steps.length ? Math.max.apply(null, steps.map((s) => s.StepNo)) : 0) + 10, StepType: "DATAACTION", ActionId: "", ModelId: "", SourceVersion: "", TargetVersion: "" });
      this._steps();
    },

    _check() {
      this.onHeader();
      const a = this._action;
      const problems = [];
      if (!a.Name.trim()) { problems.push("Name is required"); }
      if (!a.Steps.length) { problems.push("Add at least one step"); }
      a.Steps.forEach((s) => {
        if (s.StepType === "DATAACTION" && !s.ActionId) { problems.push("Step " + s.StepNo + ": choose a data action"); }
        if (s.StepType === "PUBLISH" && !(s.ModelId && s.SourceVersion && s.TargetVersion)) { problems.push("Step " + s.StepNo + ": choose model, source and target version"); }
      });
      if (problems.length) { throw new Error(problems.join("\n")); }
    },

    onSave: function () {
      this.guard(async () => { this._check(); await this._p.saveMultiAction(this._action); this.toast("Multi action saved"); await this._load(this._action.Id); })();
    },

    onDelete: function () {
      this.guard(async () => {
        if (!(await this.confirm("Delete this multi action?", "Delete"))) { return; }
        await this._p.deleteMultiAction(this._action.Id);
        await this._load();
      })();
    },

    onRun: function () {
      this.guard(async () => {
        this._check();
        await this._p.saveMultiAction(this._action);
        const r = await this._p.runMultiAction(this._action.Id, {});
        const dlg = new Dialog({ title: r.Status === "S" ? "Run finished" : "Run failed",
          state: r.Status === "S" ? "Success" : "Error",
          content: [new TextArea({ value: r.Log.join("\n"), rows: 6, width: "30rem", editable: false })],
          endButton: new Button({ text: "Close", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
        dlg.open();
      })();
    }
  });
});
