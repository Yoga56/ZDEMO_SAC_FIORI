sap.ui.define([
  "./BaseController",
  "sap/ui/core/Item",
  "sap/m/Menu", "sap/m/MenuItem",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/Label", "sap/m/VBox", "sap/m/Text", "sap/m/TextArea",
  "sap/m/Table", "sap/m/Column", "sap/m/ColumnListItem", "sap/m/ScrollContainer",
  "zsac/lib/designer/FilterEditor",
  "zsac/lib/core/WidgetRegistry",
  "zsac/lib/core/EventBus",
  "zsac/lib/core/HierarchyEngine",
  "zsac/lib/planning/PlanBuffer",
  "zsac/lib/planning/PlanEditor",
  "zsac/lib/planning/PlanPublisher",
  "zsac/lib/widget/Widgets"
], function (BaseController, Item, Menu, MenuItem, Dialog, Button, Input, Select, Label, VBox, Text, TextArea, Table, Column, ColumnListItem, ScrollContainer, FilterEditor,
  WidgetRegistry, EventBus, HierarchyEngine, PlanBuffer, PlanEditor, PlanPublisher) {
  "use strict";

  const CATEGORY = { ACTUAL: "Actual", BUDGET: "Budget", FORECAST: "Forecast", PRIVATE: "Private" };

  /**
   * Planning workspace: the same planning table widget the stories use, with a model, version and measure picker. Typing goes to
   * the unpublished buffer (undo, redo, Publish Data); private versions, version publishing and data actions work on published data.
   */
  return BaseController.extend("zsac.fiori.controller.Planning", {
    onInit() {
      this._plan = new PlanBuffer();
      this._plan.attachChange(() => { clearTimeout(this._sumTimer); this._sumTimer = setTimeout(() => { if (this._model) { this._summary().catch(() => {}); } }, 200); });
      this._bus = new EventBus();
      this.onRoute("planning", (args) => this._open(args["?query"] || {}));
    },

    /** Version work (private copy, publish, revert, data actions) reads published data: unpublished typing is published first or the action stops. */
    async _settle(why) {
      if (!this._plan.dirty) { return true; }
      const ok = await this.confirm(why + " works on published data. Publish your " + this._plan.count + " unpublished changes first?", "Publish Data");
      if (!ok) { return false; }
      await PlanPublisher.publish(this._plan, this._p);
      return true;
    },

    async _open(query) {
      const p = (this._p = await this.provider());
      this.byId("planBar").attach({ plan: this._plan, provider: p, onChange: () => this._reload() });
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
      const hier = this.byId("hier");
      hier.destroyItems();
      hier.addItem(new Item({ key: "", text: "Rows: flat" }));
      m.Dimensions.forEach((d) => (d.Hierarchies || []).forEach((h) => hier.addItem(new Item({ key: d.DimId + "|" + h.Id, text: d.Label + ": " + (h.Label || h.Id) }))));
      hier.setSelectedKey("");
      hier.setVisible(hier.getItems().length > 1);
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
      const m = this._model;
      const v = this._cur();
      const measure = this.byId("measure").getSelectedKey();
      this._facts = await this._p.readFacts(m.ModelId, { VERSION: [v.VersionId], MEASURE: [measure] });
      const off = !m.PlanningEnabled;
      const [dimId, hierId] = (this.byId("hier").getSelectedKey() || "|").split("|");
      const hdim = m.Dimensions.find((d) => d.DimId === dimId);
      // the page is a planning table widget: every dimension on rows (the hierarchical one first), months on columns
      const rows = m.Dimensions.map((d) => d.DimId).sort((a, b) => (b === dimId) - (a === dimId));
      const widget = { Id: "PLAN_PAGE", Type: "planning.table", Title: "", Page: 1, X: 0, Y: 0, W: 12, H: 8,
        Binding: { ModelId: m.ModelId, Rows: rows, Columns: ["PERIOD"], Measure: measure, Filters: { VERSION: [v.VersionId], MEASURE: [measure] },
          Hierarchies: Object.assign({ PERIOD: "TIME" }, hdim ? { [dimId]: hierId } : {}) },
        Props: { Editable: !v.Locked && !off, ExpandRows: 3, ExpandCols: 2, ShowTotals: true } };
      this._widget = widget;
      const host = this.byId("gridHost");
      host.destroyItems();
      const card = WidgetRegistry.get("planning.table").create(widget, { provider: this._p, bus: this._bus, filters: {}, plan: this._plan });
      card.addStyleClass("zsacPlanCard");
      host.addItem(card);
      card.refresh();
      const strip = this.byId("lockStrip");
      strip.setVisible(!!v.Locked || off || v.Category === "PRIVATE");
      strip.setText(off ? "Planning is not enabled for this model (Modeller, Model tab, Planning Capabilities). The numbers are read only."
        : v.Locked ? "This version is locked. Actuals are loaded by import or data actions, not typed in."
        : "Private version: only you see these numbers until you publish them to a public version.");
      strip.setType(off || v.Locked ? "Warning" : "Information");
      const priv = v.Category === "PRIVATE";
      this.byId("publish").setEnabled(priv && !off); this.byId("revert").setEnabled(priv && !off); this.byId("discard").setEnabled(priv);
      this.byId("newPriv").setEnabled(!off);
      this.byId("addRow").setEnabled(!v.Locked && !off);
      this.byId("actions").setEnabled(!off);
      const lock = this.byId("lock");
      lock.setVisible(!!m.DataLocking && !priv && !off);
      lock.setIcon(v.Locked ? "sap-icon://unlocked" : "sap-icon://locked");
      this.byId("history").setVisible(!!m.DataAudit && !!this._p.capabilities.audit);
      await this._summary();
      this._actionsMenu();
    },

    /** KPI and chart above the grid; they include the unpublished changes. */
    async _summary() {
      const m = this._model;
      const v = this._cur();
      const measure = this.byId("measure").getSelectedKey();
      const unit = (m.Measures.find((x) => x.MeasureId === measure) || {}).Unit || "";
      const cur = this._plan.overlay(this._facts).filter((f) => f.ModelId === m.ModelId && f.VersionId === v.VersionId && f.Measure === measure);
      const total = cur.reduce((a, f) => a + f.Value, 0);
      const cmpKey = this.byId("compare").getSelectedKey();
      const kpi = this.byId("kpi");
      kpi.setValue(total); kpi.setUnit(unit);
      this.byId("kpiCard").setTitle("Total " + v.VersionId);
      let cmp = [];
      if (cmpKey && cmpKey !== v.VersionId) {
        cmp = await this._p.readFacts(m.ModelId, { VERSION: [cmpKey], MEASURE: [measure] });
        kpi.setCompare(cmp.reduce((a, f) => a + f.Value, 0)); kpi.setCompareLabel(cmpKey);
      } else { kpi.setCompare(null); }
      const periods = HierarchyEngine.monthRange(m.PeriodFrom, m.PeriodTo);
      const sum = (rows) => periods.map((p) => { const r = rows.filter((f) => f.Period === p); return r.length ? r.reduce((a, f) => a + f.Value, 0) : null; });
      const series = [{ name: v.VersionId, values: sum(cur) }];
      if (cmp.length) { series.push({ name: cmpKey, values: sum(cmp) }); }
      this.byId("chart").setData({ categories: periods, series });
    },

    onModel(e) { this._setModel(e.getParameter("selectedItem").getKey()).catch((x) => this.fail(x)); },
    onVersion() { this._reload().catch((x) => this.fail(x)); },
    onHierarchy() { this._reload().catch((x) => this.fail(x)); },
    onMeasure() { this._reload().catch((x) => this.fail(x)); },
    onCompare() { this._summary().catch((x) => this.fail(x)); },

    // ---- data locking and audit -----------------------------------------------------------
    onLock: function () {
      this.guard(async () => {
        const v = this._cur();
        if (!(await this._settle("Locking a version"))) { return; }
        await this._p.saveVersion(Object.assign({}, v, { Locked: !v.Locked }));
        this.toast(v.Locked ? "Version unlocked" : "Version locked");
        await this._versions(v.VersionId);
      })();
    },

    onHistory: function () {
      this.guard(async () => {
        const v = this._cur();
        const rows = (await this._p.listAudit(this._model.ModelId, 200)).filter((a) => a.VersionId === v.VersionId);
        const table = new Table({ noDataText: "No changes recorded yet", sticky: ["ColumnHeaders"] });
        ["When", "User", "Period", "Measure", "Members", "Old", "New"].forEach((h) => table.addColumn(new Column({ header: new Text({ text: h }), hAlign: /Old|New/.test(h) ? "End" : "Begin" })));
        rows.forEach((a) => table.addItem(new ColumnListItem({ cells: [new Text({ text: new Date(a.At).toLocaleString() }), new Text({ text: a.User }), new Text({ text: a.Period }),
          new Text({ text: a.Measure }), new Text({ text: a.Dims }), new Text({ text: a.Old === null ? "(new)" : String(a.Old) }), new Text({ text: String(a.New) })] })));
        const dlg = new Dialog({ title: "Change history: " + v.Name, contentWidth: "52rem", contentHeight: "26rem", content: [new ScrollContainer({ height: "100%", vertical: true, content: [table] })],
          endButton: new Button({ text: "Close", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
        dlg.open();
      })();
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
      const from = this._cur().VersionId;
      const name = new Input({ value: "My what-if", width: "100%" });
      this._dialog("New private version", [new Text({ text: "Copy of " + from + " (published numbers)" }), new Label({ text: "Name" }), name], "Create", async () => {
        if (!(await this._settle("A private version"))) { return; }
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
        if (!(await this._settle("Publishing a version"))) { return; }
        const r = await this._p.publishVersion(this._model.ModelId, v.VersionId, sel.getSelectedKey());
        this.toast("Published to " + sel.getSelectedKey() + (r && r.Published ? " (" + r.Published + " values)" : ""));
        await this._versions(sel.getSelectedKey());
      });
    },

    onRevert: function () {
      this.guard(async () => {
        const v = this._cur();
        if (!(await this.confirm("Throw away your edits and copy " + v.SourceVersion + " again?", "Revert"))) { return; }
        this._plan.clear();
        await this._p.revertVersion(this._model.ModelId, v.VersionId);
        await this._reload();
      })();
    },

    onDiscard: function () {
      this.guard(async () => {
        const v = this._cur();
        if (!(await this.confirm("Delete private version " + v.Name + "?", "Delete"))) { return; }
        if (this._plan.pending(this._model.ModelId).some((f) => f.VersionId === v.VersionId)) { this._plan.clear(); }
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
        // hierarchy nodes (members that have children) only roll up; numbers are planned on the members below them
        const nodes = new Set();
        (d.Hierarchies || []).forEach((h) => Object.keys(h.Parents || {}).forEach((c) => { if (h.Parents[c]) { nodes.add(h.Parents[c]); } }));
        (d.Members || []).filter((x) => !nodes.has(x.Id)).forEach((x) => s.addItem(new Item({ key: x.Id, text: x.Id + (x.Text !== x.Id ? " - " + x.Text : "") })));
        return { d, s };
      });
      const content = [];
      picks.forEach((x) => { content.push(new Label({ text: x.d.Label })); content.push(x.s); });
      this._dialog("Add row", content, "Add", async () => {
        const members = {};
        picks.forEach((x) => { members[x.d.DimId] = x.s.getSelectedKey(); });
        if (Object.values(members).some((x) => !x)) { throw new Error("Pick a member for every dimension (add members in the modeller)"); }
        const v = this._cur();
        const measure = this.byId("measure").getSelectedKey();
        const existing = this._plan.overlay(this._facts);
        const rows = PlanEditor.newRows(m, v.VersionId, measure, members, HierarchyEngine.monthRange(m.PeriodFrom, m.PeriodTo), existing);
        if (!rows.length) { throw new Error("That row exists"); }
        this._plan.apply(rows, () => null);
        await this._reload();
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
          if (!(await this._settle("A data action"))) { return; }
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
