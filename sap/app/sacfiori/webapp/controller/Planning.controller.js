sap.ui.define([
  "./BaseController",
  "sap/ui/core/Item",
  "sap/m/Menu", "sap/m/MenuItem",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/Label", "sap/m/VBox", "sap/m/HBox", "sap/m/Text", "sap/m/TextArea",
  "sap/m/Table", "sap/m/Column", "sap/m/ColumnListItem", "sap/m/ScrollContainer",
  "zsac/lib/designer/FilterEditor",
  "zsac/lib/core/WidgetRegistry",
  "zsac/lib/core/EventBus",
  "zsac/lib/core/HierarchyEngine",
  "zsac/lib/core/Bookmarks",
  "zsac/lib/core/QueryEngine",
  "zsac/lib/planning/PlanBuffer",
  "zsac/lib/planning/PlanEditor",
  "zsac/lib/planning/PlanPublisher",
  "zsac/lib/widget/Widgets"
], function (BaseController, Item, Menu, MenuItem, Dialog, Button, Input, Select, Label, VBox, HBox, Text, TextArea, Table, Column, ColumnListItem, ScrollContainer, FilterEditor,
  WidgetRegistry, EventBus, HierarchyEngine, Bookmarks, QueryEngine, PlanBuffer, PlanEditor, PlanPublisher) {
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

    /** Data actions read published data: unpublished typing is published first or the action stops. */
    _settle(why) { return PlanPublisher.settle(this._plan, this._p, why); },

    async _open(query) {
      const p = (this._p = await this.provider());
      this.byId("planBar").attach({ plan: this._plan, provider: p, onChange: () => this._reload(), modelId: () => (this._model ? this._model.ModelId : ""),
        onVersions: () => this._versions(), onSelect: (id) => { this.byId("version").setSelectedKey(id); this._reload(); }, onView: (v) => { this._view = v; } });
      const storage = { getItem: (k) => window.localStorage.getItem(k), setItem: (k, v) => window.localStorage.setItem(k, v) };
      this._bm = Bookmarks.open(storage, "zsac.bookmarks.planning", await p.currentUser());
      this._models = await p.listModels();
      const sel = this.byId("model");
      sel.destroyItems();
      this._models.forEach((m) => sel.addItem(new Item({ key: m.ModelId, text: m.Name })));
      if (!this._models.length) { this.byId("lockStrip").setText("Create a dataset first (Datasets).").setType("Warning").setVisible(true); return; }
      const id = this._models.some((m) => m.ModelId === query.model) ? query.model : (this._model ? this._model.ModelId : this._models[0].ModelId);
      sel.setSelectedKey(id);
      await this._setModel(id, query.version);
      this._bookmarkMenu();
      // the planner's default bookmark opens with the page, once, unless the link names a model or a version
      const first = this._bm.defaultOne();
      if (first && !this._defaultDone && !query.model && !query.version) { this._defaultDone = true; await this._applyBookmark(first); }
      this._defaultDone = true;
    },

    // ---- bookmarks -----------------------------------------------------------------------
    _bookmarkState() {
      return { model: this._model.ModelId, version: this.byId("version").getSelectedKey(), measure: this.byId("measure").getSelectedKey(),
        hier: this.byId("hier").getSelectedKey(), compare: this.byId("compare").getSelectedKey(), view: this._view || {}, filters: this._filters || {} };
    },

    async _applyBookmark(b) {
      const s = b.State;
      if (!this._models.some((m) => m.ModelId === s.model)) { throw new Error("The model of this bookmark does not exist any more"); }
      this.byId("model").setSelectedKey(s.model);
      await this._setModel(s.model, s.version);
      const pick = (id, key) => { const sel = this.byId(id); if (sel.getItems().some((i) => i.getKey() === key)) { sel.setSelectedKey(key); } };
      pick("measure", s.measure); pick("hier", s.hier); pick("compare", s.compare);
      this._view = s.view || {};
      this._filters = s.filters || {};
      await this._reload();
    },

    _bookmarkMenu() {
      const btn = this.byId("bookmarks");
      if (btn.getMenu()) { btn.getMenu().destroy(); }
      const menu = new Menu();
      menu.addItem(new MenuItem({ text: "Save current view...", icon: "sap-icon://save", press: () => this._saveBookmark() }));
      const list = this._bm.list();
      menu.addItem(new MenuItem({ text: "Manage bookmarks...", icon: "sap-icon://action-settings", enabled: list.length > 0, press: () => this._manageBookmarks() }));
      list.forEach((b, i) => menu.addItem(new MenuItem({ text: b.Name + (b.Default ? " (default)" : ""), beginsSection: i === 0, press: () => this._applyBookmark(b).catch((x) => this.fail(x)) })));
      btn.setMenu(menu);
    },

    _saveBookmark() {
      const name = new Input({ width: "100%", placeholder: "For example Budget in thousands" });
      this._dialog("Save current view", [new Label({ text: "Name", required: true }), name, new Text({ text: "Keeps the model, version, measure, hierarchy, comparison and table functions. The same name replaces a bookmark." }).addStyleClass("zsacSmall")],
        "Save", async () => { this._bm.save(name.getValue(), this._bookmarkState()); this._bookmarkMenu(); sap.ui.require(["sap/m/MessageToast"], (T) => T.show("Bookmark saved")); });
    },

    _manageBookmarks() {
      const box = new VBox({ width: "100%" });
      const render = () => {
        box.destroyItems();
        const list = this._bm.list();
        list.forEach((b) => {
          const name = new Input({ value: b.Name, width: "12rem", change: () => { try { this._bm.rename(b.Id, name.getValue()); this._bookmarkMenu(); } catch (e) { name.setValue(b.Name); this.fail(e); } } });
          box.addItem(new HBox({ alignItems: "Center", class: "sapUiTinyMarginBottom", items: [name,
            new Button({ text: b.Default ? "Default" : "Make default", type: b.Default ? "Emphasized" : "Default", press: () => { this._bm.setDefault(b.Default ? "" : b.Id); this._bookmarkMenu(); render(); } }).addStyleClass("sapUiTinyMarginBegin"),
            new Button({ icon: "sap-icon://delete", type: "Transparent", press: () => { this._bm.remove(b.Id); this._bookmarkMenu(); render(); } })] }));
        });
        if (!list.length) { box.addItem(new Text({ text: "No bookmarks" })); }
      };
      render();
      const dlg = new Dialog({ title: "Bookmarks", content: [this._margin({ width: "24rem", items: [box] })], endButton: new Button({ text: "Close", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
      dlg.open();
    },

    async _setModel(id, versionId) {
      if (!this._model || this._model.ModelId !== id) { this._view = {}; this._filters = {}; }       // table functions belong to a model
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
        Binding: { ModelId: m.ModelId, Rows: rows, Columns: ["PERIOD"], Measure: measure, Filters: Object.assign({}, this._filters || {}, { VERSION: [v.VersionId], MEASURE: [measure] }),
          Hierarchies: Object.assign({ PERIOD: "TIME" }, hdim ? { [dimId]: hierId } : {}) },
        Props: { Editable: !v.Locked && !off, ExpandRows: 3, ExpandCols: 2, ShowTotals: true, View: this._view || {} } };
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
      this.byId("addRow").setEnabled(!v.Locked && !off);
      this.byId("actions").setEnabled(!off);
      await this._summary();
      this._actionsMenu();
    },

    /** KPI and chart above the grid; they include the unpublished changes. */
    async _summary() {
      const m = this._model;
      const v = this._cur();
      const measure = this.byId("measure").getSelectedKey();
      const unit = (m.Measures.find((x) => x.MeasureId === measure) || {}).Unit || "";
      const prompts = this._filters || {};
      const cur = QueryEngine.applyFilters(m, this._plan.overlay(this._facts).filter((f) => f.ModelId === m.ModelId && f.VersionId === v.VersionId && f.Measure === measure), prompts);
      const total = cur.reduce((a, f) => a + f.Value, 0);
      const cmpKey = this.byId("compare").getSelectedKey();
      const kpi = this.byId("kpi");
      kpi.setValue(total); kpi.setUnit(unit);
      this.byId("kpiCard").setTitle("Total " + v.VersionId);
      let cmp = [];
      if (cmpKey && cmpKey !== v.VersionId) {
        cmp = QueryEngine.applyFilters(m, await this._p.readFacts(m.ModelId, { VERSION: [cmpKey], MEASURE: [measure] }), prompts);
        kpi.setCompare(cmp.reduce((a, f) => a + f.Value, 0)); kpi.setCompareLabel(cmpKey);
      } else { kpi.setCompare(null); }
      const periods = HierarchyEngine.monthRange(m.PeriodFrom, m.PeriodTo);
      const sum = (rows) => periods.map((p) => { const r = rows.filter((f) => f.Period === p); return r.length ? r.reduce((a, f) => a + f.Value, 0) : null; });
      const series = [{ name: v.VersionId, values: sum(cur) }];
      if (cmp.length) { series.push({ name: cmpKey, values: sum(cmp) }); }
      this.byId("chart").setData({ categories: periods, series });
    },

    /** Edit Prompts: the members the table is limited to. Version and measure are the page's own pickers. */
    onPrompts() {
      let filters = JSON.parse(JSON.stringify(this._filters || {}));
      const holder = new VBox({ width: "100%" });
      const build = () => { holder.destroyItems(); holder.addItem(FilterEditor.build({ model: this._model, versions: this._versionList, filters, skip: ["VERSION"], periodNodes: true, onChange: (f) => { filters = f; }, onRebuild: build })); };
      build();
      this._dialog("Edit Prompts", [new Text({ text: "Limit the table, the total and the chart to these members. Empty means all." }), new ScrollContainer({ height: "22rem", vertical: true, content: [holder] })],
        "Apply", async () => { this._filters = filters; this.byId("prompts").setType(Object.keys(filters).length ? "Emphasized" : "Default"); await this._reload(); });
    },

    onModel(e) { this._setModel(e.getParameter("selectedItem").getKey()).catch((x) => this.fail(x)); },
    onVersion() { this._reload().catch((x) => this.fail(x)); },
    onHierarchy() { this._reload().catch((x) => this.fail(x)); },
    onMeasure() { this._reload().catch((x) => this.fail(x)); },
    onCompare() { this._summary().catch((x) => this.fail(x)); },

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
        this._plan.apply(rows, () => null, "Add row " + Object.values(members).join(" / "));
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
