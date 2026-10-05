sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/Dialog", "sap/m/Button", "sap/m/VBox", "sap/m/Text", "sap/m/Label", "sap/m/TextArea",
  "zsac/lib/designer/FilterEditor",
  "zsac/lib/core/FilterEngine",
  "zsac/lib/core/StorySchema"
], function (BaseController, JSONModel, Dialog, Button, VBox, Text, Label, TextArea, FilterEditor, FilterEngine, StorySchema) {
  "use strict";

  /** Data action designer: steps (copy, scale, delete, allocate) per model, run with an optional data filter parameter. */
  return BaseController.extend("zsac.fiori.controller.DataActions", {
    onInit() {
      this._list = new JSONModel({ items: [] });
      this._a = new JSONModel({});
      this._ver = new JSONModel({ models: [], versions: [], dims: [] });
      const v = this.getView();
      v.setModel(this._list, "list"); v.setModel(this._a, "a"); v.setModel(this._ver, "ver");
      this.onRoute("dataactions", (args) => this._load((args["?query"] || {}).id));
    },

    async _load(id) {
      const p = (this._p = await this.provider());
      const items = await p.listDataActions();
      this._list.setProperty("/items", items);
      this._ver.setProperty("/models", await p.listModels());
      const hit = items.find((x) => x.Id === id) || items[0];
      if (hit) { await this._edit(hit); } else { this.byId("detail").setVisible(false); }
    },

    async _edit(action) {
      const a = JSON.parse(JSON.stringify(action));
      a.Steps = (a.Steps || []).map((s) => this._toRow(s));
      this._a.setData(a);
      await this._model(a.ModelId);
      this.byId("detail").setVisible(true);
      const i = this._list.getProperty("/items").findIndex((x) => x.Id === action.Id);
      const list = this.byId("list");
      if (i >= 0) { list.setSelectedItem(list.getItems()[i]); }
    },

    _toRow(s) {
      return Object.assign({ StepNo: 10, StepType: "COPY", SrcVersion: "", TgtVersion: "", Factor: 1, TargetDim: "" }, s, {
        Filter: s.Filter || {}, FilterText: FilterEngine.describe(s.Filter || {}), TargetMembersText: (s.TargetMembers || []).join(", ") });
    },

    async _model(id) {
      const m = (this._ver.getProperty("/models") || []).find((x) => x.ModelId === id);
      this._m = m || null;
      this._ver.setProperty("/dims", m ? m.Dimensions : []);
      this._ver.setProperty("/versions", m ? await this._p.listVersions(id) : []);
    },

    onSelect(e) { this._edit(e.getParameter("listItem").getBindingContext("list").getObject()).catch((x) => this.fail(x)); },
    onModel(e) { this._model(e.getParameter("selectedItem").getKey()).catch((x) => this.fail(x)); },

    onNew() {
      const m = (this._ver.getProperty("/models") || [])[0];
      if (!m) { this.toast("Create a dataset first"); return; }
      this._edit({ Id: StorySchema.uid("DA"), ModelId: m.ModelId, Name: "New data action", Description: "", Steps: [], isNew: true }).catch((x) => this.fail(x));
    },

    onAddStep() {
      const steps = this._a.getProperty("/Steps");
      steps.push(this._toRow({ StepNo: (steps.length ? Math.max.apply(null, steps.map((s) => Number(s.StepNo))) : 0) + 10 }));
      this._a.setProperty("/Steps", steps);
    },

    onRemoveStep(e) {
      const i = Number(e.getSource().getBindingContext("a").getPath().split("/").pop());
      const steps = this._a.getProperty("/Steps");
      steps.splice(i, 1);
      this._a.setProperty("/Steps", steps);
    },

    onFilter(e) {
      const ctx = e.getSource().getBindingContext("a");
      const step = ctx.getObject();
      let filter = JSON.parse(JSON.stringify(step.Filter || {}));
      if (!this._m) { return; }
      const holder = new VBox({ width: "100%" });
      const build = () => { holder.destroyItems(); holder.addItem(FilterEditor.build({ model: this._m, versions: this._ver.getProperty("/versions"), filters: filter,
        onChange: (f) => { filter = f; }, onRebuild: build })); };
      build();
      const dlg = new Dialog({ title: "Step filter", content: [this._margin({ width: "24rem", items: [new Text({ text: "Only values matching the filter are touched by this step." }), holder] })],
        beginButton: new Button({ text: "OK", type: "Emphasized", press: () => { this._a.setProperty(ctx.getPath() + "/Filter", filter); this._a.setProperty(ctx.getPath() + "/FilterText", FilterEngine.describe(filter)); dlg.close(); } }),
        endButton: new Button({ text: "Cancel", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
      dlg.open();
    },

    _collect() {
      const d = this._a.getData();
      const problems = [];
      if (!(d.Name || "").trim()) { problems.push("Name is required"); }
      if (!d.ModelId) { problems.push("Choose a model"); }
      if (!d.Steps.length) { problems.push("Add at least one step"); }
      const steps = d.Steps.map((s) => {
        const t = s.StepType;
        if (["COPY", "ALLOCATE"].includes(t) && !s.SrcVersion) { problems.push("Step " + s.StepNo + ": choose the source version"); }
        if (!s.TgtVersion) { problems.push("Step " + s.StepNo + ": choose the target version"); }
        const members = String(s.TargetMembersText || "").split(",").map((x) => x.trim()).filter(Boolean);
        if (t === "ALLOCATE" && (!s.TargetDim || !members.length)) { problems.push("Step " + s.StepNo + ": choose the dimension and members to allocate over"); }
        return { StepNo: Number(s.StepNo), StepType: t, SrcVersion: s.SrcVersion || "", TgtVersion: s.TgtVersion || "", Filter: s.Filter || {}, Factor: s.Factor === "" ? 1 : Number(s.Factor),
          TargetDim: s.TargetDim || "", TargetMembers: members };
      });
      if (problems.length) { throw new Error(problems.join("\n")); }
      return { Id: d.Id, ModelId: d.ModelId, Name: d.Name.trim(), Description: d.Description || "", Steps: steps };
    },

    onSave: function () {
      this.guard(async () => { await this._p.saveDataAction(this._collect()); this.toast("Data action saved"); await this._load(this._a.getProperty("/Id")); })();
    },

    onDelete: function () {
      this.guard(async () => {
        if (!(await this.confirm("Delete this data action?", "Delete"))) { return; }
        await this._p.deleteDataAction(this._a.getProperty("/Id"));
        await this._load();
      })();
    },

    onRun: function () {
      this.guard(async () => {
        const action = this._collect();
        await this._p.saveDataAction(action);
        let filter = {};
        const holder = new VBox({ width: "100%" });
        const build = () => { holder.destroyItems(); holder.addItem(FilterEditor.build({ model: this._m, versions: this._ver.getProperty("/versions"), filters: filter,
          onChange: (f) => { filter = f; }, onRebuild: build })); };
        build();
        const dlg = new Dialog({ title: "Run " + action.Name,
          content: [this._margin({ width: "24rem", items: [new Label({ text: "Data filter parameter (optional)", design: "Bold" }), holder] })],
          beginButton: new Button({ text: "Run", type: "Emphasized", press: this.guard(async () => {
            const r = await this._p.executeDataAction(action.Id, { Filter: filter });
            dlg.close();
            const out = new Dialog({ title: "Result: " + r.Changed + " values changed", content: [new TextArea({ value: r.Log.join("\n"), rows: 6, width: "28rem", editable: false })],
              endButton: new Button({ text: "Close", press: () => out.close() }), afterClose: () => out.destroy() });
            out.open();
          }) }),
          endButton: new Button({ text: "Cancel", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
        dlg.open();
      })();
    }
  });
});
