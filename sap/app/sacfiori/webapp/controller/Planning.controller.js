sap.ui.define([
  "./BaseController",
  "sap/ui/core/Item",
  "sap/m/Menu", "sap/m/MenuItem",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/Label", "sap/m/VBox", "sap/m/Text", "sap/m/TextArea",
  "zsac/lib/designer/FilterEditor",
  "zsac/lib/core/QueryEngine",
  "zsac/lib/planning/DataActionEngine"
], function (BaseController, Item, Menu, MenuItem, Dialog, Button, Input, Select, Label, VBox, Text, TextArea, FilterEditor, QueryEngine, DataActionEngine) {
  "use strict";

  const CATEGORY = { ACTUAL: "Actual", BUDGET: "Budget", FORECAST: "Forecast", PRIVATE: "Private" };

  /**
   * Planning workspace: pick a model, version and measure, type into the grid, work in a private version,
   * publish it to a public version, run data actions. Edits are written to the provider in small batches.
   */
  return BaseController.extend("zsac.fiori.controller.Planning", {
    onInit() {
      this._pending = new Map();
      this.onRoute("planning", (args) => this._open(args["?query"] || {}));
    },

    async _open(query) {
      const p = (this._p = await this.provider());
      this._models = await p.listModels();
      const sel = this.byId("model");
      sel.destroyItems();
      this._models.forEach((m) => sel.addItem(new Item({ key: m.ModelId, text: m.Name })));
      if (!this._models.length) { this.byId("lockStrip").setText("Create a dataset first (Datasets).").setType("Warning").setVisible(true); return; }
      const id = this._models.some((m) => m.ModelId === query.model) ? query.model : (this._model ? this._model.ModelId : this._models[0].ModelId);
      sel.setSelectedKey(id);
      await this._setModel(id, query.version);
    },

    async _setModel(id, versionId) {
      this._model = this._models.find((m) => m.ModelId === id);
      const m = this._model;
      const measure = this.byId("measure");
      measure.destroyItems();
      m.Measures.forEach((x) => measure.addItem(new Item({ key: x.MeasureId, text: x.Label })));
      measure.setSelectedKey(m.Measures[0].MeasureId);
      await this._versions(versionId);
    },

    async _versions(preferred) {
      const sameModel = this._shown === this._model.ModelId;
      const keepVersion = sameModel ? this.byId("version").getSelectedKey() : "";
      const keepCompare = sameModel ? this.byId("compare").getSelectedKey() : "";
      this._shown = this._model.ModelId;
      this._versionList = await this._p.listVersions(this._model.ModelId);
      const list = this._versionList.slice().sort((a, b) => (a.Category === "PRIVATE") - (b.Category === "PRIVATE") || a.VersionId.localeCompare(b.VersionId));
      ["version", "compare"].forEach((id) => {
        const s = this.byId(id);
        s.destroyItems();
        if (id === "compare") { s.addItem(new Item({ key: "", text: "(none)" })); }
        list.forEach((v) => s.addItem(new Item({ key: v.VersionId, text: v.Name + " (" + CATEGORY[v.Category] + (v.Locked ? ", locked" : "") + ")" })));
        const keep = id === "version" ? keepVersion : keepCompare;
        s.setSelectedKey(keep && list.some((v) => v.VersionId === keep) ? keep : "");
      });
      const vs = this.byId("version");
      const pick = preferred && list.some((v) => v.VersionId === preferred) ? preferred : (keepVersion && list.some((v) => v.VersionId === keepVersion) ? keepVersion
        : (list.find((v) => v.Category === "BUDGET") || list[0]).VersionId);
      vs.setSelectedKey(pick);
      const cmp = this.byId("compare");
      if (!keepCompare || cmp.getSelectedKey() === "" || !list.some((v) => v.VersionId === keepCompare)) { const act = list.find((v) => v.Category === "ACTUAL" && v.VersionId !== pick); if (act) { cmp.setSelectedKey(act.VersionId); } }
      await this._reload();
    },

    _cur() { return this._versionList.find((v) => v.VersionId === this.byId("version").getSelectedKey()); },

    async _reload() {
      await this._flush();
      const m = this._model;
      const v = this._cur();
      const measure = this.byId("measure").getSelectedKey();
      const facts = await this._p.readFacts(m.ModelId, { VERSION: [v.VersionId], MEASURE: [measure] });
      this._data = { model: m, version: v.VersionId, measure, facts, locked: !!v.Locked };
      this.byId("table").setData(this._data);
      const strip = this.byId("lockStrip");
      strip.setVisible(!!v.Locked || v.Category === "PRIVATE");
      strip.setText(v.Locked ? "This version is locked. Actuals are loaded by import or data actions, not typed in."
        : "Private version: only you see these numbers until you publish them to a public version.");
      strip.setType(v.Locked ? "Warning" : "Information");
      const priv = v.Category === "PRIVATE";
      this.byId("publish").setEnabled(priv); this.byId("revert").setEnabled(priv); this.byId("discard").setEnabled(priv);
      this.byId("addRow").setEnabled(!v.Locked);
      await this._summary();
      this._actionsMenu();
    },

    async _summary() {
      const m = this._model;
      const measure = this.byId("measure").getSelectedKey();
      const unit = (m.Measures.find((x) => x.MeasureId === measure) || {}).Unit || "";
      const cur = this._data.facts;
      const total = cur.reduce((a, f) => a + f.Value, 0);
      const cmpKey = this.byId("compare").getSelectedKey();
      const kpi = this.byId("kpi");
      kpi.setValue(total); kpi.setUnit(unit);
      this.byId("kpiCard").setTitle("Total " + this._data.version);
      let cmp = [];
      if (cmpKey && cmpKey !== this._data.version) {
        cmp = await this._p.readFacts(m.ModelId, { VERSION: [cmpKey], MEASURE: [measure] });
        kpi.setCompare(cmp.reduce((a, f) => a + f.Value, 0)); kpi.setCompareLabel(cmpKey);
      } else { kpi.setCompare(null); }
      const periods = this.byId("table")._periods;
      const sum = (rows) => periods.map((p) => { const r = rows.filter((f) => f.Period === p); return r.length ? r.reduce((a, f) => a + f.Value, 0) : null; });
      const series = [{ name: this._data.version, values: sum(cur) }];
      if (cmp.length) { series.push({ name: cmpKey, values: sum(cmp) }); }
      this.byId("chart").setData({ categories: periods, series });
    },

    onModel(e) { this._setModel(e.getParameter("selectedItem").getKey()).catch((x) => this.fail(x)); },
    onVersion() { this._reload().catch((x) => this.fail(x)); },
    onMeasure() { this._reload().catch((x) => this.fail(x)); },
    onCompare() { this._summary().catch((x) => this.fail(x)); },

    // ---- cell writes ---------------------------------------------------------------------
    onCell(e) {
      const f = e.getParameter("fact");
      this._pending.set(DataActionEngine.keyOf(f), f);
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this._flush().then(() => this._summary()).catch((x) => this.fail(x)), 450);
    },

    async _flush() {
      if (!this._pending.size) { return; }
      const rows = Array.from(this._pending.values());
      this._pending.clear();
      await this._p.writeFacts(this._model.ModelId, rows);
    },

    // ---- versions ------------------------------------------------------------------------
    _dialog(title, content, okText, onOk) {
      const dlg = new Dialog({
        title, content: [this._margin({ width: "24rem", items: content })],
        beginButton: new Button({ text: okText, type: "Emphasized", press: () => Promise.resolve(onOk(dlg)).then(() => dlg.close()).catch((x) => this.fail(x)) }),
        endButton: new Button({ text: "Cancel", press: () => dlg.close() }), afterClose: () => dlg.destroy()
      });
      dlg.open();
      return dlg;
    },

    onNewPrivate() {
      const from = this._data.version;
      const name = new Input({ value: "My what-if", width: "100%" });
      this._dialog("New private version", [new Text({ text: "Copy of " + from }), new Label({ text: "Name" }), name], "Create", async () => {
        const v = await this._p.createPrivateVersion(this._model.ModelId, from, name.getValue());
        await this._versions(v.VersionId);
        this.toast("Private version " + v.VersionId + " created");
      });
    },

    onNewPublic() {
      const id = new Input({ placeholder: "BUD2027", width: "100%", maxLength: 12 });
      const name = new Input({ placeholder: "Budget 2027", width: "100%" });
      const cat = new Select({ width: "100%", items: [new Item({ key: "BUDGET", text: "Budget" }), new Item({ key: "FORECAST", text: "Forecast" }), new Item({ key: "ACTUAL", text: "Actual" })] });
      this._dialog("New public version", [new Label({ text: "ID", required: true }), id, new Label({ text: "Name", required: true }), name, new Label({ text: "Category" }), cat], "Create", async () => {
        const vid = id.getValue().trim().toUpperCase();
        if (!/^[A-Z][A-Z0-9_]*$/.test(vid) || !name.getValue().trim()) { throw new Error("Enter an ID (capital letters, digits) and a name"); }
        if (this._versionList.some((v) => v.VersionId === vid)) { throw new Error("Version " + vid + " exists"); }
        await this._p.saveVersion({ ModelId: this._model.ModelId, VersionId: vid, Name: name.getValue().trim(), Category: cat.getSelectedKey(),
          Locked: cat.getSelectedKey() === "ACTUAL", Owner: "ME", SourceVersion: "", Status: "P" });
        await this._versions(vid);
      });
    },

    onPublish() {
      const v = this._cur();
      const targets = this._versionList.filter((x) => x.Category !== "PRIVATE" && !x.Locked);
      if (!targets.length) { this.toast("There is no unlocked public version to publish to"); return; }
      const sel = new Select({ width: "100%" });
      targets.forEach((t) => sel.addItem(new Item({ key: t.VersionId, text: t.Name + " (" + t.VersionId + ")" })));
      sel.setSelectedKey((targets.find((t) => t.VersionId === v.SourceVersion) || targets[0]).VersionId);
      this._dialog("Publish " + v.Name, [new Text({ text: "The target version's numbers are replaced by this version." }), new Label({ text: "Publish to" }), sel], "Publish", async () => {
        const r = await this._p.publishVersion(this._model.ModelId, v.VersionId, sel.getSelectedKey());
        this.toast("Published to " + sel.getSelectedKey() + (r && r.Published ? " (" + r.Published + " values)" : ""));
        await this._versions(sel.getSelectedKey());
      });
    },

    onRevert: function () {
      this.guard(async () => {
        const v = this._cur();
        if (!(await this.confirm("Throw away your edits and copy " + v.SourceVersion + " again?", "Revert"))) { return; }
        await this._p.revertVersion(this._model.ModelId, v.VersionId);
        await this._reload();
      })();
    },

    onDiscard: function () {
      this.guard(async () => {
        const v = this._cur();
        if (!(await this.confirm("Delete private version " + v.Name + "?", "Delete"))) { return; }
        await this._p.deleteVersion(this._model.ModelId, v.VersionId);
        this.byId("version").setSelectedKey("");
        await this._versions(v.SourceVersion);
      })();
    },

    // ---- rows ----------------------------------------------------------------------------
    onAddRow() {
      const m = this._model;
      const picks = m.Dimensions.map((d) => {
        const s = new Select({ width: "100%" });
        (d.Members || []).forEach((x) => s.addItem(new Item({ key: x.Id, text: x.Id + (x.Text !== x.Id ? " - " + x.Text : "") })));
        return { d, s };
      });
      const content = [];
      picks.forEach((x) => { content.push(new Label({ text: x.d.Label })); content.push(x.s); });
      this._dialog("Add row", content, "Add", async () => {
        const members = picks.map((x) => x.s.getSelectedKey());
        if (members.some((x) => !x)) { throw new Error("Pick a member for every dimension (add members in the modeller)"); }
        if (!this.byId("table").addRow(members)) { throw new Error("That row exists"); }
      });
    },

    // ---- data actions --------------------------------------------------------------------
    async _actionsMenu() {
      const actions = (await this._p.listDataActions()).filter((a) => a.ModelId === this._model.ModelId);
      const btn = this.byId("actions");
      if (btn.getMenu()) { btn.getMenu().destroy(); }
      const menu = new Menu();
      actions.forEach((a) => menu.addItem(new MenuItem({ text: a.Name, press: () => this._runAction(a) })));
      if (!actions.length) { menu.addItem(new MenuItem({ text: "No data actions for this model", enabled: false })); }
      btn.setMenu(menu);
    },

    async _runAction(action) {
      let filter = {};
      const holder = new VBox({ width: "100%" });
      const build = () => { holder.destroyItems(); holder.addItem(FilterEditor.build({ model: this._model, versions: this._versionList, filters: filter,
        onChange: (f) => { filter = f; }, onRebuild: build })); };
      build();
      this._dialog("Run: " + action.Name, [new Text({ text: action.Description || "" }), new Label({ text: "Data filter parameter (optional): limit the action to this slice", design: "Bold" }).addStyleClass("sapUiSmallMarginTop"), holder],
        "Run", async () => {
          const r = await this._p.executeDataAction(action.Id, { Filter: filter });
          await this._reload();
          this._log("Data action finished", r.Changed + " values changed", r.Log);
        });
    },

    _log(title, headline, lines) {
      const dlg = new Dialog({ title, content: [this._margin({ items: [new Text({ text: headline }), new TextArea({ value: lines.join("\n"), rows: 6, width: "28rem", editable: false })] })],
        endButton: new Button({ text: "Close", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
      dlg.open();
    }
  });
});
