sap.ui.define([
  "./BaseController",
  "../model/DataTools",
  "../model/MasterDataDialog",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "zsac/lib/core/ModelSchema",
  "zsac/lib/planning/DataActionEngine"
], function (BaseController, DataTools, MasterDataDialog, JSONModel, Filter, FilterOperator, ModelSchema) {
  "use strict";

  const BUILTIN_ROWS = (versions, periods) => [
    { DimId: "VERSION", Label: "Version", Type: "VERSION", builtin: true, existing: true, CountText: String(versions), MembersText: "" },
    { DimId: "PERIOD", Label: "Date", Type: "DATE", builtin: true, existing: true, CountText: String(periods), MembersText: "" }
  ];

  /**
   * SAC style modeller: Model Structure (measures and dimensions in tables, details panel on the right), Calculations
   * (not in this release), Data Management. A dimension that already carries data keeps its id and slot (facts are
   * stored per slot); new dimensions are appended and members can be edited at any time.
   */
  return BaseController.extend("zsac.fiori.controller.Modeller", {
    onInit() {
      this._m = new JSONModel({});
      this._sel = new JSONModel({ measure: false, dim: false, canDelete: false });
      this._rel = new JSONModel({ items: [] });
      this._data = new JSONModel({ items: [] });
      const v = this.getView();
      v.setModel(new JSONModel({ dimTypes: Object.keys(ModelSchema.DIM_TYPES).map((k) => ({ key: k, text: ModelSchema.DIM_TYPES[k].label })) }), "view");
      v.setModel(this._m, "m"); v.setModel(this._sel, "sel"); v.setModel(this._rel, "rel"); v.setModel(this._data, "data");
      this.onRoute("modeller", (args) => this._load(args.id));
    },

    // ---- formatters ------------------------------------------------------------------------
    measureDetails(aggregation, exception, unitType, unit, scaleKey) {
      const parts = [{ SUM: "Sum", AVG: "Average", MIN: "Minimum", MAX: "Maximum", COUNT: "Count" }[aggregation] || aggregation];
      if (exception) { parts.push("exception: " + exception.toLowerCase()); }
      const label = ModelSchema.unitLabel({ UnitType: unitType, Unit: unit, Scale: Number(scaleKey) || 1 });
      if (label) { parts.push(label); }
      return parts.join(" · ");
    },

    memberCount(builtin, countText, members) {
      return builtin ? countText : String((members || []).length);
    },

    hierarchyCount(builtin, hierarchies) {
      return builtin ? "-" : String((hierarchies || []).length || "-");
    },

    typeLabel(type) {
      return { VERSION: "Version", DATE: "Date" }[type] || (ModelSchema.DIM_TYPES[type] || { label: type }).label;
    },

    // ---- load ------------------------------------------------------------------------------
    async _load(id) {
      const p = (this._p = await this.provider());
      this.byId("viewSel").setSelectedKey("structure");
      this._show("structure");
      this._clearSelection();
      this.byId("auditNote").setVisible(!p.capabilities.audit);
      let model;
      let versions = [];
      if (id === "new") {
        model = ModelSchema.newModel();
        model.isNew = true;
      } else {
        model = await p.getModel(id);
        versions = await p.listVersions(id);
        model.isNew = false;
      }
      const months = this._months(model.PeriodFrom, model.PeriodTo);
      this._m.setData(Object.assign({}, model, {
        Dimensions: BUILTIN_ROWS(versions.length || 3, months).concat(model.Dimensions.map((d) => ({
          DimId: d.DimId, Label: d.Label, Type: d.Type, existing: !model.isNew, builtin: false, CountText: "",
          Attributes: JSON.parse(JSON.stringify(d.Attributes)), Hierarchies: JSON.parse(JSON.stringify(d.Hierarchies)),
          Members: JSON.parse(JSON.stringify(d.Members)), lockedIds: model.isNew ? [] : d.Members.map((x) => x.Id) }))),
        Measures: model.Measures.map((x) => Object.assign({}, x, { existing: !model.isNew, ScaleKey: String(x.Scale || 1) }))
      }));
      this.byId("tabs").setSelectedKey("model");
      await this._related(model);
      if (!model.isNew) { this._data.setProperty("/items", await DataTools.summary(this, model)); } else { this._data.setProperty("/items", []); }
    },

    _months(from, to) {
      const a = /^(\d{4})-(\d{2})$/.exec(from || "");
      const b = /^(\d{4})-(\d{2})$/.exec(to || "");
      return a && b ? (b[1] - a[1]) * 12 + (b[2] - a[2]) + 1 : 0;
    },

    // ---- related objects -------------------------------------------------------------------
    async _related(model) {
      const items = [];
      if (!model.isNew) {
        const p = this._p;
        const [actions, multis, stories, tasks] = await Promise.all([p.listDataActions(), p.listMultiActions(), p.listStories(), p.listTasks()]);
        const mine = actions.filter((a) => a.ModelId === model.ModelId);
        mine.forEach((a) => items.push({ kind: "Data Action", title: a.Name, icon: "sap-icon://workflow-tasks", go: () => this.router().navTo("dataactions", { query: { id: a.Id } }) }));
        multis.filter((x) => (x.Steps || []).some((s) => (s.StepType === "DATAACTION" && mine.some((a) => a.Id === s.ActionId)) || (s.StepType === "PUBLISH" && s.ModelId === model.ModelId)))
          .forEach((x) => items.push({ kind: "Multi Action", title: x.Name, icon: "sap-icon://process", go: () => this.router().navTo("multiactions", { query: { id: x.Id } }) }));
        const full = await Promise.all(stories.map((s) => (s.ModelId === model.ModelId ? Promise.resolve(s) : p.getStory(s.Id).catch(() => s))));
        full.filter((s) => s.ModelId === model.ModelId || (s.Widgets || []).some((w) => w.Binding && w.Binding.ModelId === model.ModelId))
          .forEach((s) => items.push({ kind: "Story", title: s.Name, icon: "sap-icon://business-objects-experience", go: () => this.navTo("story", { id: s.Id }) }));
        tasks.filter((t) => t.ModelId === model.ModelId)
          .forEach((t) => items.push({ kind: "Calendar task", title: t.Title, icon: "sap-icon://task", go: () => this.navTo("calendar") }));
      }
      this._rel.setProperty("/items", items);
    },

    onRelated(e) { e.getSource().getBindingContext("rel").getObject().go(); },

    // ---- views and panel -------------------------------------------------------------------
    _show(view) { ["structure", "calculations", "data"].forEach((id) => this.byId(id).setVisible(id === view)); },
    onView(e) { this._show(e.getParameter("selectedItem").getKey()); },
    onOpenData() { this.byId("viewSel").setSelectedKey("data"); this._show("data"); },
    onTogglePanel(e) { this.byId("side").setVisible(e.getParameter("pressed")); },
    onTab() { /* the tab bar only switches content */ },

    _clearSelection() {
      this._sel.setData({ measure: false, dim: false, canDelete: false });
      this.byId("measures").removeSelections(true);
      this.byId("dims").removeSelections(true);
    },

    onSelectMeasure(e) {
      this.byId("dims").removeSelections(true);
      const ctx = e.getParameter("listItem").getBindingContext("m");
      this.byId("measureDetail").bindElement({ path: ctx.getPath(), model: "m" });
      this._sel.setData({ measure: true, dim: false, canDelete: !ctx.getObject().existing });
      this.byId("tabs").setSelectedKey("measure");
      this.byId("side").setVisible(true);
    },

    onSelectDim(e) {
      this.byId("measures").removeSelections(true);
      const ctx = e.getParameter("listItem").getBindingContext("m");
      this.byId("dimDetail").bindElement({ path: ctx.getPath(), model: "m" });
      this._sel.setData({ measure: false, dim: true, canDelete: !ctx.getObject().existing && !ctx.getObject().builtin });
      this.byId("tabs").setSelectedKey("dimension");
      this.byId("side").setVisible(true);
    },

    onSearch(e) {
      const q = e.getParameter("newValue") || "";
      const f = (a, b) => (q ? [new Filter({ filters: [new Filter(a, FilterOperator.Contains, q), new Filter(b, FilterOperator.Contains, q)], and: false })] : []);
      this.byId("measures").getBinding("items").filter(f("MeasureId", "Label"));
      this.byId("dims").getBinding("items").filter(f("DimId", "Label"));
    },

    // ---- edit ------------------------------------------------------------------------------
    onAddMeasure() {
      const list = this._m.getProperty("/Measures");
      list.push(ModelSchema.normalizeMeasure({ MeasureId: "", Label: "", UnitType: "None", existing: false, ScaleKey: "1" }));
      this._m.setProperty("/Measures", list);
      this._pick("measures", list.length - 1, "measure");
    },

    onAddDim() {
      const list = this._m.getProperty("/Dimensions");
      if (list.length >= 7) { this.toast("A model has at most five dimensions besides Version and Date"); return; }
      list.push(ModelSchema.normalizeDimension({ DimId: "", Label: "", Type: "GENERIC", existing: false, builtin: false, CountText: "", lockedIds: [] }));
      this._m.setProperty("/Dimensions", list);
      this._pick("dims", list.length - 1, "dimension");
    },

    _pick(tableId, index, tab) {
      const table = this.byId(tableId);
      sap.ui.getCore().applyChanges();
      const item = table.getItems()[index];
      if (item) { table.setSelectedItem(item, true, true); }
      this.byId("tabs").setSelectedKey(tab);
    },

    onDeleteSelected() {
      const path = (this.byId("measures").getSelectedItem() || this.byId("dims").getSelectedItem() || { getBindingContextPath: () => "" }).getBindingContextPath("m");
      if (!path) { return; }
      const [, list, index] = path.split("/");
      const rows = this._m.getProperty("/" + list);
      if (rows[index].existing || rows[index].builtin) { this.toast("Measures and dimensions that hold data cannot be removed"); return; }
      rows.splice(Number(index), 1);
      this._m.setProperty("/" + list, rows);
      this._clearSelection();
    },

    // ---- dimension master data -------------------------------------------------------------
    _dimPath() { return (this.byId("dims").getSelectedItem() || { getBindingContextPath: () => "" }).getBindingContextPath("m"); },

    /** Changing the type swaps the default attributes, unless the user has made their own. */
    onDimType(e) {
      const path = this._dimPath();
      if (!path) { return; }
      const dim = this._m.getProperty(path);
      const next = e.getParameter("selectedItem").getKey();
      const same = (a, b) => JSON.stringify((a || []).map((x) => x.Id)) === JSON.stringify(b.map((x) => x.Id));
      const previous = Object.keys(ModelSchema.DIM_TYPES).some((k) => same(dim.Attributes, ModelSchema.DIM_TYPES[k].attributes));
      if (!(dim.Attributes || []).length || previous) {
        this._m.setProperty(path + "/Attributes", ModelSchema.DIM_TYPES[next].attributes.map((a) => Object.assign({}, a)));
        const props = new Set(ModelSchema.DIM_TYPES[next].attributes.map((a) => a.Id));
        this._m.setProperty(path + "/Members", (dim.Members || []).map((m) => Object.assign({}, m, { Props: Object.keys(m.Props || {}).reduce((o, k) => { if (props.has(k)) { o[k] = m.Props[k]; } return o; }, {}) })));
      }
    },

    onAddAttribute() {
      const path = this._dimPath();
      const list = this._m.getProperty(path + "/Attributes") || [];
      list.push({ Id: "", Label: "" });
      this._m.setProperty(path + "/Attributes", list);
    },

    onRemoveAttribute(e) {
      const ctx = e.getSource().getBindingContext("m");
      const idx = Number(ctx.getPath().split("/").pop());
      const base = ctx.getPath().replace(/\/\d+$/, "");
      const list = this._m.getProperty(base);
      list.splice(idx, 1);
      this._m.setProperty(base, list);
    },

    onMasterData: function () {
      this.guard(async () => {
        const path = this._dimPath();
        if (!path) { this.toast("Select a dimension first"); return; }
        const dim = this._m.getProperty(path);
        const result = await MasterDataDialog.open({ dimension: dim, lockedIds: dim.lockedIds || [] });
        if (!result) { return; }
        this._m.setProperty(path + "/Members", result.Members);
        this._m.setProperty(path + "/Hierarchies", result.Hierarchies);
      })();
    },

    // ---- save ------------------------------------------------------------------------------
    _collect() {
      const d = this._m.getData();
      const dims = d.Dimensions.filter((x) => !x.builtin);
      return {
        ModelId: d.ModelId, Name: (d.Name || "").trim(), Description: d.Description || "", Currency: d.Currency || "", PeriodFrom: d.PeriodFrom, PeriodTo: d.PeriodTo,
        PlanningEnabled: !!d.PlanningEnabled, DataLocking: !!d.DataLocking, DataAudit: !!d.DataAudit, DataSource: d.DataSource || "",
        Dimensions: dims.map((x, i) => ({ DimId: x.DimId, Label: x.Label || x.DimId, Slot: i + 1, Type: x.Type || "GENERIC",
          Attributes: (x.Attributes || []).filter((a) => a.Id).map((a) => ({ Id: a.Id, Label: a.Label || a.Id })),
          Hierarchies: (x.Hierarchies || []).map((h) => ({ Id: h.Id, Label: h.Label || h.Id, Parents: h.Parents || {} })),
          Members: (x.Members || []).map((m) => ({ Id: m.Id, Text: m.Text || m.Id, Props: m.Props || {} })) })),
        Measures: d.Measures.map((x) => ({ MeasureId: x.MeasureId, Label: x.Label || x.MeasureId, DataType: x.DataType, Aggregation: x.Aggregation,
          ExceptionAggregation: x.ExceptionAggregation || "", ExceptionDims: x.ExceptionAggregation ? (x.ExceptionDims || []).filter((k) => k !== "MEASURE") : [],
          UnitType: x.UnitType, Unit: x.UnitType === "None" ? "" : x.Unit || "", Scale: Number(x.ScaleKey) || 1, Decimals: Number(x.Decimals) || 0 }))
      };
    },

    onSave: function () {
      this.guard(async () => {
        const model = this._collect();
        const problems = ModelSchema.validate(model);
        if (problems.length) { throw new Error(problems.join("\n")); }
        const p = await this.provider();
        const isNew = this._m.getProperty("/isNew");
        if (isNew && (await p.listModels()).some((m) => m.ModelId === model.ModelId)) { throw new Error("A model with ID " + model.ModelId + " already exists"); }
        await p.saveModel(model);
        if (isNew) {
          for (const v of [["ACT", "Actual", "ACTUAL", true], ["BUD", "Budget", "BUDGET", false], ["FCT", "Forecast", "FORECAST", false]]) {
            await p.saveVersion({ ModelId: model.ModelId, VersionId: v[0], Name: v[1], Category: v[2], Locked: v[3], Owner: "SYSTEM", SourceVersion: "", Status: "P" });
          }
        }
        this.toast("Model saved");
        if (isNew) { this.navTo("modeller", { id: model.ModelId }); } else { await this._load(model.ModelId); }
      })();
    },

    // ---- data management -------------------------------------------------------------------
    _model() { return Object.assign(this._collect(), { Name: this._m.getProperty("/Name") }); },
    onPreview: function () { this.guard(() => DataTools.preview(this, this._model()))(); },
    onExport: function () { this.guard(() => DataTools.exportCsv(this, this._model()))(); },
    onImport: function () {
      this.guard(async () => {
        const n = await DataTools.importCsv(this, this._model());
        if (n) { this.toast(n + " values imported"); await this._load(this._m.getProperty("/ModelId")); this.onOpenData(); }
      })();
    }
  });
});
