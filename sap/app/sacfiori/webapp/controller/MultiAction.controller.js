sap.ui.define([
  "./BaseController",
  "sap/m/Button", "sap/m/MenuButton", "sap/m/Menu", "sap/m/MenuItem", "sap/m/ToolbarSpacer", "sap/m/Title", "sap/m/Text", "sap/m/Label", "sap/m/Input", "sap/m/TextArea",
  "sap/m/Select", "sap/m/ComboBox", "sap/m/MultiComboBox", "sap/m/CheckBox", "sap/m/Switch", "sap/m/VBox", "sap/m/HBox", "sap/m/MessageStrip",
  "sap/ui/core/Item", "sap/ui/core/Icon", "sap/m/List", "sap/m/StandardListItem",
  "zsac/lib/planning/MultiActionSchema",
  "zsac/lib/planning/DataActionRun",
  "zsac/lib/planning/ImportEngine",
  "zsac/lib/planning/Forecaster",
  "zsac/fiori/model/Csv",
  "zsac/lib/core/CsvParser"
], function (BaseController, Button, MenuButton, Menu, MenuItem, ToolbarSpacer, Title, Text, Label, Input, TextArea, Select, ComboBox, MultiComboBox, CheckBox, Switch,
  VBox, HBox, MessageStrip, Item, Icon, List, StandardListItem, Schema, Run, ImportEngine, Forecaster, Csv, CsvParser) {
  "use strict";

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const memberText = (m) => m.Id + (m.Text && m.Text !== m.Id ? " – " + m.Text : "");

  /**
   * Multi action designer: the flow of steps on the left, the editor of the selected object (settings, parameters or a step) on the right.
   * Parameters are asked for once when the multi action runs; every data action step maps them onto its own parameters.
   * The action is edited as a plain object with a snapshot per change (undo, redo); nothing is written before Save.
   */
  return BaseController.extend("zsac.fiori.controller.MultiAction", {
    onInit() {
      this.onRoute("multiaction", (args) => this._load(args.id));
    },

    async _load(id) {
      const p = (this._p = await this.provider());
      this._a = Schema.normalizeAction(await p.getMultiAction(id));
      this._saved = JSON.stringify(this._a);
      this._hist = [this._saved];
      this._pos = 0;
      this._sel = "settings";
      this._results = null;
      this._models = await p.listModels();
      this._versions = await p.listVersions();
      this._actions = await p.listDataActions();
      this._usedIn = await this._findUsage(id);
      this._renderAll();
    },

    async _findUsage(id) {
      const p = this._p;
      const stories = await Promise.all((await p.listStories()).map((x) => p.getStory(x.Id).catch(() => null)));
      return stories.filter((x) => x && (x.Widgets || []).some((w) => w.Type === "multiaction.trigger" && w.Props && w.Props.ActionId === id)).map((x) => "Story: " + x.Name);
    },

    // ---- lookups -------------------------------------------------------------------------------------------------------------------
    _model(id) { return this._models.find((m) => m.ModelId === id); },
    _dimsOf(modelId) {
      const m = this._model(modelId);
      return (m ? m.Dimensions.map((d) => ({ id: d.DimId, label: d.Label || d.DimId })) : []).concat([{ id: "VERSION", label: "Version" }, { id: "PERIOD", label: "Date" }]);
    },
    _members(modelId, dimId) {
      const m = this._model(modelId);
      return m ? Run.memberItems(m, this._versions.filter((v) => v.ModelId === modelId), dimId) : [];
    },
    _dataAction(id) { return this._actions.find((a) => a.Id === id); },

    // ---- state ---------------------------------------------------------------------------------------------------------------------
    _dirty() { return JSON.stringify(this._a) !== this._saved; },

    _changed(rebuild) {
      const now = JSON.stringify(this._a);
      if (now !== this._hist[this._pos]) {
        this._hist = this._hist.slice(0, this._pos + 1);
        this._hist.push(now);
        this._pos = this._hist.length - 1;
        if (this._hist.length > 100) { this._hist.shift(); this._pos--; }
      }
      this._results = null;
      this._renderBar();
      this._renderFlow();
      if (rebuild) { this._renderEdit(); }
    },

    _restore(pos) {
      this._pos = pos;
      this._a = JSON.parse(this._hist[pos]);
      if (typeof this._sel === "number" && this._sel >= this._a.Steps.length) { this._sel = this._a.Steps.length ? this._a.Steps.length - 1 : "settings"; }
      this._results = null;
      this._renderAll();
    },

    _renderAll() { this._renderBar(); this._renderFlow(); this._renderEdit(); },

    // ---- toolbar -------------------------------------------------------------------------------------------------------------------
    _renderBar() {
      const bar = this.byId("bar");
      bar.destroyContent();
      const hasStep = typeof this._sel === "number";
      const add = (c) => bar.addContent(c);
      add(new Button({ icon: "sap-icon://nav-back", tooltip: "Back", type: "Transparent", press: () => this.navTo("multiactions") }));
      add(new Title({ text: this._a.Name + (this._dirty() ? " *" : ""), level: "H3" }));
      add(new ToolbarSpacer());
      add(new Button({ icon: "sap-icon://undo", tooltip: "Undo", enabled: this._pos > 0, press: () => this._restore(this._pos - 1) }));
      add(new Button({ icon: "sap-icon://redo", tooltip: "Redo", enabled: this._pos < this._hist.length - 1, press: () => this._restore(this._pos + 1) }));
      add(new Button({ text: "Settings", icon: "sap-icon://action-settings", type: this._sel === "settings" ? "Emphasized" : "Transparent", press: () => this._select("settings") }));
      add(new Button({ text: "Parameters (" + this._a.Parameters.length + ")", icon: "sap-icon://syntax", type: this._sel === "params" ? "Emphasized" : "Transparent", press: () => this._select("params") }));
      const menu = new Menu({ itemSelected: (e) => this._addStep(e.getParameter("item").data("type")) });
      Object.keys(Schema.STEP_TYPES).forEach((t) => menu.addItem(new MenuItem({ text: Schema.STEP_TYPES[t].label, icon: Schema.STEP_TYPES[t].icon }).data("type", t)));
      add(new MenuButton({ text: "Add Step", icon: "sap-icon://add", menu }));
      add(new Button({ icon: "sap-icon://navigation-up-arrow", tooltip: "Move step up", enabled: hasStep && this._sel > 0, press: () => this._move(-1) }));
      add(new Button({ icon: "sap-icon://navigation-down-arrow", tooltip: "Move step down", enabled: hasStep && this._sel < this._a.Steps.length - 1, press: () => this._move(1) }));
      add(new Button({ icon: "sap-icon://duplicate", tooltip: "Duplicate step", enabled: hasStep, press: () => this._duplicateStep() }));
      add(new Button({ icon: "sap-icon://delete", tooltip: "Delete step", enabled: hasStep, press: () => this._deleteStep() }));
      add(new Button({ text: "Validate", icon: "sap-icon://validate", tooltip: "Check the steps for errors", press: () => this._validate(true) }));
      add(new Button({ text: "Run", icon: "sap-icon://play", press: this.guard(() => this._run()) }));
      add(new Button({ text: "Save", icon: "sap-icon://save", type: "Emphasized", enabled: this._dirty(), press: this.guard(() => this._save()) }));
    },

    _issues() {
      return Schema.validate(Schema.normalizeAction(this._a), { models: this._models, versions: this._versions, actions: this._actions });
    },

    _validate(show) {
      const r = this._issues();
      this._results = r;
      if (show) {
        if (!r.length) { this.toast("No problems found"); }
        this._renderFlow();
        this._renderEdit();
      }
      return r;
    },

    async _save() {
      const r = this._validate(false);
      if (r.some((x) => x.severity === "Error")) {
        this._renderFlow(); this._renderEdit();
        this.toast("Fix the errors before saving");
        return false;
      }
      this._a = Schema.normalizeAction(this._a);
      await this._p.saveMultiAction(this._a);
      this._saved = JSON.stringify(this._a);
      this._hist = [this._saved]; this._pos = 0;
      this._results = r;
      this.toast("Multi action saved");
      this._renderAll();
      return true;
    },

    /** Run works on the saved action, so unsaved changes are saved first. */
    async _run() {
      if (this._dirty() && !(await this._save())) { return; }
      Run.openMulti({ provider: this._p, actionId: this._a.Id });
    },

    // ---- step operations -----------------------------------------------------------------------------------------------------------
    _renumber() { this._a.Steps.forEach((s, i) => { s.StepNo = (i + 1) * 10; }); },
    _addStep(type) {
      this._a.Steps.push(Schema.newStep(type, this._a.Steps.length));
      this._renumber();
      this._sel = this._a.Steps.length - 1;
      this._changed(true);
      this._renderBar();
    },
    _move(d) {
      const i = this._sel;
      const steps = this._a.Steps;
      [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
      this._renumber(); this._sel = i + d;
      this._changed(true);
    },
    _duplicateStep() {
      const c = clone(this._a.Steps[this._sel]);
      c.Id = "S" + Date.now().toString(36); c.Name += " (copy)";
      this._a.Steps.splice(this._sel + 1, 0, c);
      this._renumber(); this._sel++;
      this._changed(true);
    },
    _deleteStep() {
      this._a.Steps.splice(this._sel, 1);
      this._renumber();
      this._sel = this._a.Steps.length ? Math.min(this._sel, this._a.Steps.length - 1) : "settings";
      this._changed(true);
    },
    _select(sel) { this._sel = sel; this._renderBar(); this._renderFlow(); this._renderEdit(); },

    // ---- left: the flow ------------------------------------------------------------------------------------------------------------
    _renderFlow() {
      const flow = this.byId("flow");
      flow.destroyItems();
      const issues = this._results || [];
      const box = new VBox().addStyleClass("zsacFlow");
      const term = (t) => new Text({ text: t }).addStyleClass("zsacFlowTerm");
      const edge = () => new VBox().addStyleClass("zsacFlowEdge");
      box.addItem(term("Start"));
      this._a.Steps.forEach((s, i) => {
        box.addItem(edge());
        const t = Schema.STEP_TYPES[s.StepType];
        const bad = issues.filter((x) => x.step === i);
        const hasErr = bad.some((x) => x.severity === "Error");
        const node = new VBox({ items: [
          new HBox({ alignItems: "Center", items: [
            new Icon({ src: t.icon, size: "1rem" }).addStyleClass("sapUiTinyMarginEnd"),
            new Text({ text: (i + 1) + ". " + s.Name, maxLines: 1 }),
            bad.length ? new Icon({ src: hasErr ? "sap-icon://error" : "sap-icon://alert", color: hasErr ? "Negative" : "Critical", size: "0.9rem" }).addStyleClass("sapUiTinyMarginBegin") : new Text({ text: "" })] }),
          new Text({ text: t.label + (s.Active ? "" : " · inactive"), maxLines: 1 }).addStyleClass("zsacSmall")] });
        node.addStyleClass("zsacFlowNode" + (this._sel === i ? " zsacFlowNodeSel" : "") + (s.Active ? "" : " zsacFlowNodeOff"));
        node.attachBrowserEvent("click", () => this._select(i));
        box.addItem(node);
      });
      box.addItem(edge());
      box.addItem(term("End"));
      if (!this._a.Steps.length) { box.addItem(new Text({ text: "Use Add Step to build the flow." }).addStyleClass("zsacSmall sapUiSmallMarginTop")); }
      flow.addItem(box);
    },

    // ---- right: editors ------------------------------------------------------------------------------------------------------------
    _renderEdit() {
      const edit = this.byId("edit");
      edit.destroyItems();
      if (this._sel === "settings") { this._settings(edit); }
      else if (this._sel === "params") { this._parameters(edit); }
      else if (this._a.Steps[this._sel]) { this._stepEditor(edit, this._a.Steps[this._sel]); }
      if (this._results) { this._resultList(edit); }
    },

    _field(parent, label, control, hint) {
      parent.addItem(new Label({ text: label }).addStyleClass("sapUiTinyMarginTop"));
      parent.addItem(control);
      if (hint) { parent.addItem(new Text({ text: hint }).addStyleClass("zsacSmall")); }
    },

    _text(obj, key, opts) {
      return new Input(Object.assign({ value: obj[key], width: "100%", change: (e) => { obj[key] = e.getParameter("value"); this._changed(false); } }, opts || {}));
    },

    _settings(edit) {
      edit.addItem(new Title({ text: "Settings", level: "H4" }));
      this._field(edit, "Name", this._text(this._a, "Name"));
      this._field(edit, "Description", new TextArea({ value: this._a.Description, rows: 2, width: "100%", change: (e) => { this._a.Description = e.getParameter("value"); this._changed(false); } }));
      edit.addItem(new Text({ text: "Steps run in order and the first failing step stops the run; what earlier steps wrote stays written." }).addStyleClass("zsacSmall sapUiSmallMarginTop"));
      edit.addItem(new Title({ text: "Used In", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      const list = new List({ noDataText: "Not used yet. Add it to a story with the multi action trigger widget.", showSeparators: "None" });
      (this._usedIn || []).forEach((u) => list.addItem(new StandardListItem({ title: u })));
      edit.addItem(list);
    },

    // parameters ------------------------------------------------------------------------------------------------------------------
    _parameters(edit) {
      edit.addItem(new HBox({ alignItems: "Center", justifyContent: "SpaceBetween", items: [
        new Title({ text: "Parameters", level: "H4" }),
        new Button({ text: "Add Parameter", icon: "sap-icon://add", press: () => this._addParam() })] }));
      edit.addItem(new Text({ text: "Asked for once when the multi action runs. A data action step maps them onto the parameters of its data action; a publish step can use one as its version." }).addStyleClass("zsacSmall"));
      const usage = Schema.usage(this._a);
      if (!this._a.Parameters.length) { edit.addItem(new Text({ text: "No parameters." }).addStyleClass("sapUiSmallMarginTop")); }
      this._a.Parameters.forEach((p, i) => {
        const card = new VBox().addStyleClass("zsacTraceCard sapUiSmallMarginTop");
        card.addItem(new HBox({ alignItems: "Center", justifyContent: "SpaceBetween", items: [
          new Title({ text: "@" + (p.Id || "?"), level: "H6" }),
          new Button({ icon: "sap-icon://delete", type: "Transparent", tooltip: "Delete parameter", press: () => { this._a.Parameters.splice(i, 1); this._changed(true); } })] }));
        this._field(card, "Id", this._text(p, "Id", { change: (e) => { p.Id = e.getParameter("value").trim(); this._changed(true); } }));
        this._field(card, "Prompt", this._text(p, "Prompt"));
        this._field(card, "Type", new Select({ selectedKey: p.Type, width: "100%", items: [new Item({ key: "MEMBER", text: "Member" }), new Item({ key: "NUMBER", text: "Number" })],
          change: (e) => { p.Type = e.getParameter("selectedItem").getKey(); p.Default = p.Type === "NUMBER" ? 0 : []; this._changed(true); } }));
        if (p.Type === "MEMBER") {
          this._field(card, "Model", new Select({ selectedKey: p.ModelId, width: "100%", forceSelection: false, items: this._models.map((m) => new Item({ key: m.ModelId, text: m.Name })),
            change: (e) => { p.ModelId = e.getParameter("selectedItem").getKey(); p.DimId = ""; p.Default = []; this._changed(true); } }));
          if (p.ModelId) {
            this._field(card, "Dimension", new Select({ selectedKey: p.DimId, width: "100%", forceSelection: false, items: this._dimsOf(p.ModelId).map((d) => new Item({ key: d.id, text: d.label })),
              change: (e) => { p.DimId = e.getParameter("selectedItem").getKey(); p.Default = []; this._changed(true); } }));
          }
          card.addItem(new CheckBox({ text: "Allow several members", selected: p.Multi, select: (e) => { p.Multi = e.getParameter("selected"); if (!p.Multi) { p.Default = p.Default.slice(0, 1); } this._changed(true); } }));
          if (p.ModelId && p.DimId) {
            const def = new MultiComboBox({ width: "100%", placeholder: "No default (all members)", selectedKeys: p.Default,
              selectionFinish: (e) => { p.Default = e.getParameter("selectedItems").map((x) => x.getKey()); if (!p.Multi) { p.Default = p.Default.slice(0, 1); } this._changed(false); } });
            this._members(p.ModelId, p.DimId).forEach((m) => def.addItem(new Item({ key: m.Id, text: memberText(m) })));
            this._field(card, "Default", def);
          }
        } else {
          this._field(card, "Default", new Input({ type: "Number", value: String(p.Default), width: "100%", change: (e) => { p.Default = Number(e.getParameter("value")); this._changed(false); } }));
        }
        const where = usage[p.Id] || [];
        card.addItem(new Text({ text: "Used in: " + (where.length ? where.join(", ") : "no step") }).addStyleClass("zsacSmall sapUiTinyMarginTop"));
        edit.addItem(card);
      });
    },

    _addParam() {
      let n = this._a.Parameters.length + 1;
      while (this._a.Parameters.some((p) => p.Id === "Param" + n)) { n++; }
      this._a.Parameters.push(Schema.normalizeAction({ Parameters: [{ Id: "Param" + n, Prompt: "Parameter " + n, Type: "MEMBER", ModelId: "", DimId: "", Multi: true }] }).Parameters[0]);
      this._changed(true);
    },

    // steps -----------------------------------------------------------------------------------------------------------------------
    _stepEditor(edit, s) {
      const t = Schema.STEP_TYPES[s.StepType];
      edit.addItem(new HBox({ alignItems: "Center", items: [new Icon({ src: t.icon }).addStyleClass("sapUiTinyMarginEnd"), new Title({ text: t.label + " step", level: "H4" })] }));
      edit.addItem(new Text({ text: t.hint }).addStyleClass("zsacSmall"));
      this._field(edit, "Name", this._text(s, "Name"));
      this._field(edit, "Description", this._text(s, "Description"));
      this._field(edit, "Step Active", new HBox({ alignItems: "Center", items: [
        new Switch({ state: s.Active, change: (e) => { s.Active = e.getParameter("state"); this._changed(false); } }),
        new Text({ text: "Step is active (inactive steps are skipped)" }).addStyleClass("sapUiTinyMarginBegin")] }));
      if (s.StepType === "DATAACTION") { this._dataActionEditor(edit, s); }
      else if (s.StepType === "PUBLISH") { this._publishEditor(edit, s); }
      else if (s.StepType === "IMPORT") { this._importEditor(edit, s); }
      else if (s.StepType === "PREDICT") { this._predictEditor(edit, s); }
      else if (s.StepType === "API") { this._apiEditor(edit, s); }
      else if (s.StepType === "PAPM") { this._papmEditor(edit, s); }
      else { this._versionStepEditor(edit, s); }
    },

    /** ComboBox: the list holds the compatible multi action parameters (as @Id); the text can also be typed (a number or a member id). */
    _combo(onWrite, current, params, members, numeric) {
      const c = new ComboBox({ width: "100%", value: String(current === undefined ? "" : current) });
      (members || []).forEach((m) => c.addItem(new Item({ key: m.Id, text: m.Id })));
      params.forEach((p) => c.addItem(new Item({ key: "@" + p.Id, text: "@" + p.Id + "  (" + (p.Prompt || p.Id) + ")" })));
      c.attachChange(() => {
        const sel = c.getSelectedItem();
        const raw = sel ? sel.getKey() : c.getValue().trim();
        onWrite(numeric && raw !== "" && raw.charAt(0) !== "@" && Number.isFinite(Number(raw)) ? Number(raw) : raw);
        this._changed(false);
      });
      return c;
    },

    _dataActionEditor(edit, s) {
      const others = this._actions;
      this._field(edit, "Data action", new Select({ width: "100%", forceSelection: false, selectedKey: s.ActionId,
        items: [new Item({ key: "", text: "Choose a data action" })].concat(others.map((a) => new Item({ key: a.Id, text: a.Name }))),
        change: (e) => { s.ActionId = e.getParameter("selectedItem").getKey(); s.ParamMap = {}; this._changed(true); } }));
      const da = this._dataAction(s.ActionId);
      if (!da) { return; }
      const m = this._model(da.ModelId);
      this._field(edit, "Default model", new Text({ text: (m && m.Name) || da.ModelId }));
      const params = da.Parameters || [];
      if (!params.length) { edit.addItem(new Text({ text: "This data action has no parameters." }).addStyleClass("zsacSmall sapUiSmallMarginTop")); return; }
      edit.addItem(new Title({ text: "Parameters of the data action", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      params.forEach((cp) => {
        const cur = s.ParamMap[cp.Id];
        const text = cur === undefined ? "" : (Array.isArray(cur) ? cur.join(",") : cur);
        const compatible = this._a.Parameters.filter((p) => p.Type === cp.Type && (cp.Type === "NUMBER" || p.DimId === cp.DimId));
        const members = cp.Type === "MEMBER" ? this._members(da.ModelId, cp.DimId) : [];
        const c = this._combo((raw) => {
          if (raw === "") { delete s.ParamMap[cp.Id]; }
          else if (cp.Type === "NUMBER" && typeof raw === "string" && raw.charAt(0) !== "@") { s.ParamMap[cp.Id] = Number(raw); }
          else if (typeof raw === "string" && raw.indexOf(",") >= 0) { s.ParamMap[cp.Id] = raw.split(",").map((x) => x.trim()); }
          else { s.ParamMap[cp.Id] = raw; }
        }, text, compatible, members, cp.Type === "NUMBER");
        this._field(edit, (cp.Prompt || cp.Id) + (cp.Type === "NUMBER" ? " (number)" : " (" + cp.DimId + ")"), c,
          "Choose a multi action parameter, type a fixed value, or leave empty to use the default of the data action.");
      });
    },

    _publishEditor(edit, s) {
      this._field(edit, "Model", new Select({ width: "100%", forceSelection: false, selectedKey: s.ModelId,
        items: [new Item({ key: "", text: "Choose a model" })].concat(this._models.map((m) => new Item({ key: m.ModelId, text: m.Name }))),
        change: (e) => { s.ModelId = e.getParameter("selectedItem").getKey(); s.SourceVersion = ""; s.TargetVersion = ""; this._changed(true); } }));
      if (!s.ModelId) { return; }
      const versionParams = this._a.Parameters.filter((p) => p.Type === "MEMBER" && p.DimId === "VERSION");
      const members = this._members(s.ModelId, "VERSION");
      this._field(edit, "Source version", this._combo((raw) => { s.SourceVersion = raw; }, s.SourceVersion, versionParams, members), "The version whose values are published.");
      this._field(edit, "Target version", this._combo((raw) => { s.TargetVersion = raw; }, s.TargetVersion, versionParams, members), "The version that is overwritten. Choose a version parameter to ask for it when the multi action runs.");
    },

    /** Version Management and Data Locking: model, operation and the version it works on (a version id or a version parameter). */
    _versionStepEditor(edit, s) {
      this._field(edit, "Model", new Select({ width: "100%", forceSelection: false, selectedKey: s.ModelId,
        items: [new Item({ key: "", text: "Choose a model" })].concat(this._models.map((m) => new Item({ key: m.ModelId, text: m.Name }))),
        change: (e) => { s.ModelId = e.getParameter("selectedItem").getKey(); s.SourceVersion = ""; s.Version = ""; this._changed(true); } }));
      const ops = Schema.OPERATIONS[s.StepType];
      this._field(edit, "Operation", new Select({ width: "100%", selectedKey: s.Operation, items: Object.keys(ops).map((k) => new Item({ key: k, text: ops[k] })),
        change: (e) => { s.Operation = e.getParameter("selectedItem").getKey(); this._changed(true); } }));
      if (!s.ModelId) { return; }
      const versionParams = this._a.Parameters.filter((p) => p.Type === "MEMBER" && p.DimId === "VERSION");
      const members = this._members(s.ModelId, "VERSION");
      if (s.StepType === "COMMENT" && s.Operation === "COPY") {
        this._field(edit, "Copy the comments of version", this._combo((raw) => { s.SourceVersion = raw; }, s.SourceVersion, versionParams, members));
        this._field(edit, "to version", this._combo((raw) => { s.TargetVersion = raw; }, s.TargetVersion, versionParams, members), "The comments are added to the ones the target version already has.");
        return;
      }
      if (s.StepType === "VERSION" && s.Operation === "CREATE_PRIVATE") {
        this._field(edit, "Version to copy", this._combo((raw) => { s.SourceVersion = raw; }, s.SourceVersion, versionParams, members), "The private version starts with a copy of its values.");
        this._field(edit, "Name of the private version", this._text(s, "VersionName"));
        return;
      }
      const label = s.StepType === "COMMENT" ? "Version whose comments are deleted" : s.StepType === "LOCK" ? (s.Operation === "LOCK" ? "Version to lock" : "Version to unlock")
        : (s.Operation === "REVERT" ? "Private version to revert" : "Version to delete");
      const hint = s.StepType === "COMMENT" ? "Every comment of the version is deleted. The sample data source keeps comments; a source without comments makes the step fail."
        : s.StepType === "LOCK" ? "A locked version cannot be written to by planners or by data actions."
        : (s.Operation === "REVERT" ? "The private version gets the values of the version it was copied from." : "The version and its values are removed. A locked version cannot be deleted.");
      this._field(edit, label, this._combo((raw) => { s.Version = raw; }, s.Version, versionParams, members), hint);
    },

    _modelSelect(s, onChange) {
      return new Select({ width: "100%", forceSelection: false, selectedKey: s.ModelId,
        items: [new Item({ key: "", text: "Choose a model" })].concat(this._models.map((m) => new Item({ key: m.ModelId, text: m.Name }))),
        change: (e) => { s.ModelId = e.getParameter("selectedItem").getKey(); onChange(); this._changed(true); } });
    },

    _params(type, dimId) { return this._a.Parameters.filter((p) => p.Type === type && (!dimId || p.DimId === dimId)); },

    _choice(value, options, onChange, width) {
      return new Select({ width: width || "100%", selectedKey: value, items: options.map(([k, t]) => new Item({ key: k, text: t })), change: (e) => { onChange(e.getParameter("selectedItem").getKey()); this._changed(true); } });
    },

    /** Name and value rows (API headers, PaPM parameters). */
    _pairs(edit, list, nameLabel, valueLabel, addLabel) {
      list.forEach((h, i) => {
        const row = new HBox({ alignItems: "Center", wrap: "Wrap" }).addStyleClass("zsacRow");
        row.addItem(this._text(h, "Name", { placeholder: nameLabel, width: "12rem" }));
        row.addItem(this._text(h, "Value", { placeholder: valueLabel, width: "16rem" }));
        row.addItem(new Button({ icon: "sap-icon://decline", type: "Transparent", tooltip: "Remove", press: () => { list.splice(i, 1); this._changed(true); } }));
        edit.addItem(row);
      });
      edit.addItem(new Button({ text: addLabel, icon: "sap-icon://add", press: () => { list.push({ Name: "", Value: "" }); this._changed(true); } }));
    },

    _paramHint() {
      const ids = this._a.Parameters.map((p) => "@" + p.Id);
      return ids.length ? "Parameters you can use: " + ids.join(", ") : "Add parameters to the multi action to use them here as @Name.";
    },

    // Data Import ------------------------------------------------------------------------------------------------------------
    _importEditor(edit, s) {
      this._field(edit, "Model", this._modelSelect(s, () => { s.Mapping = {}; s.TargetVersion = ""; s.MeasureId = ""; }));
      const model = this._model(s.ModelId);
      if (!model) { return; }
      const area = new TextArea({ value: s.Csv, rows: 8, width: "100%", placeholder: "Region;Product;Channel;Month;Amount\nEMEA;Cloud ERP;Direct;2026-10;1200", growing: false,
        liveChange: () => {}, change: (e) => this._setCsv(s, model, e.getParameter("value")) });
      area.addStyleClass("zsacMono");
      this._field(edit, "CSV (header line, one value per line)", area);
      edit.addItem(new Button({ text: "Load file", icon: "sap-icon://upload", press: this.guard(async () => { const f = await Csv.pick(); if (f) { this._setCsv(s, model, f.text); } }) }));
      const header = ImportEngine.header(s.Csv);
      if (!header.length) { return; }
      const lines = Math.max(0, CsvParser.parse(s.Csv).length - 1);
      edit.addItem(new Text({ text: header.length + " columns, " + lines + " data lines. Comma, semicolon or tab separated." }).addStyleClass("zsacSmall"));
      edit.addItem(new Title({ text: "What each column is", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      const targets = [["", "Ignore"], ["VERSION", "Version"], ["PERIOD", "Period (2026-03)"], ["MEASURE", "Measure"], ["VALUE", "Value"]].concat((model.Dimensions || []).map((d) => [d.DimId, d.Label || d.DimId]))
        .concat((model.Measures || []).map((m) => ["MEASURE:" + m.MeasureId, "Value of " + (m.Label || m.MeasureId)]));
      header.forEach((h) => {
        const row = new HBox({ alignItems: "Center", wrap: "Wrap" }).addStyleClass("zsacRow");
        row.addItem(new Text({ text: h, width: "10rem" }));
        row.addItem(this._choice(s.Mapping[h] || "", targets, (v) => { s.Mapping[h] = v; }, "14rem"));
        edit.addItem(row);
      });
      const mapped = (t) => Object.keys(s.Mapping).some((c) => s.Mapping[c] === t && header.indexOf(c) >= 0);
      if (!mapped("VERSION")) {
        this._field(edit, "Import into version", this._combo((raw) => { s.TargetVersion = raw; }, s.TargetVersion, this._params("MEMBER", "VERSION"), this._members(s.ModelId, "VERSION")), "The file has no version column.");
      }
      const wide = Object.keys(s.Mapping).some((c) => (s.Mapping[c] || "").indexOf("MEASURE:") === 0 && header.indexOf(c) >= 0);
      if (!mapped("MEASURE") && !wide) {
        this._field(edit, "Measure of the values", this._combo((raw) => { s.MeasureId = raw; }, s.MeasureId, this._params("MEMBER", "MEASURE"), this._members(s.ModelId, "MEASURE")), "The file has no measure column. Or map a column to \"Value of <measure>\" for each measure (one column per measure).");
      }
      this._field(edit, "Existing values", this._choice(s.Mode, [["UPDATE", "Replace the value of the same cell"], ["ADD", "Add to the value of the same cell"]], (v) => { s.Mode = v; }));
      this._field(edit, "Rows that cannot be imported", this._choice(s.OnError, [["FAIL", "Stop the step, import nothing"], ["SKIP", "Skip them and import the rest"]], (v) => { s.OnError = v; }),
        "Unknown members, periods outside the model, locked versions and values that are not numbers.");
    },

    _setCsv(s, model, text) {
      s.Csv = text;
      const header = ImportEngine.header(text);
      const guess = ImportEngine.guessMapping(model, header);
      const next = {};
      header.forEach((h) => { next[h] = s.Mapping[h] !== undefined ? s.Mapping[h] : guess[h]; });
      s.Mapping = next;
      this._changed(true);
    },

    // Predictive -------------------------------------------------------------------------------------------------------------
    _predictEditor(edit, s) {
      this._field(edit, "Model", this._modelSelect(s, () => { s.MeasureId = ""; s.SourceVersion = ""; s.TargetVersion = ""; }));
      if (!s.ModelId) { return; }
      const ver = this._members(s.ModelId, "VERSION");
      const vp = this._params("MEMBER", "VERSION");
      const per = this._members(s.ModelId, "PERIOD");
      const pp = this._params("MEMBER", "PERIOD");
      this._field(edit, "Measure to forecast", this._combo((raw) => { s.MeasureId = raw; }, s.MeasureId, this._params("MEMBER", "MEASURE"), this._members(s.ModelId, "MEASURE")));
      this._field(edit, "History from version", this._combo((raw) => { s.SourceVersion = raw; }, s.SourceVersion, vp, ver));
      this._field(edit, "History from month", this._combo((raw) => { s.HistoryFrom = raw; }, s.HistoryFrom, pp, per));
      this._field(edit, "History to month", this._combo((raw) => { s.HistoryTo = raw; }, s.HistoryTo, pp, per));
      this._field(edit, "Write the forecast to version", this._combo((raw) => { s.TargetVersion = raw; }, s.TargetVersion, vp, ver));
      this._field(edit, "Forecast from month", this._combo((raw) => { s.ForecastFrom = raw; }, s.ForecastFrom, pp, per));
      this._field(edit, "Forecast to month", this._combo((raw) => { s.ForecastTo = raw; }, s.ForecastTo, pp, per));
      this._field(edit, "Method", this._choice(s.Method, Object.keys(Forecaster.METHODS).map((k) => [k, Forecaster.METHODS[k]]), (v) => { s.Method = v; }),
        "A statistical forecast for every combination of members, from the months of the history. It is not SAP Smart Predict.");
      if (s.Method === "MOVING_AVERAGE") { this._field(edit, "Months to average", new Input({ type: "Number", value: String(s.Window), width: "8rem", change: (e) => { s.Window = Number(e.getParameter("value")); this._changed(false); } })); }
      if (s.Method === "EXP_SMOOTHING") { this._field(edit, "Alpha (0 to 1)", new Input({ type: "Number", value: String(s.Alpha), width: "8rem", change: (e) => { s.Alpha = Number(e.getParameter("value")); this._changed(false); } }), "How strongly the latest months count."); }
    },

    // API --------------------------------------------------------------------------------------------------------------------
    _apiEditor(edit, s) {
      this._field(edit, "Method", this._choice(s.Method, Schema.METHODS.map((m) => [m, m]), (v) => { s.Method = v; }, "10rem"));
      this._field(edit, "URL", this._text(s, "Url", { placeholder: "https://host/path" }), this._paramHint());
      edit.addItem(new Title({ text: "Headers", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      this._pairs(edit, s.Headers, "Name", "Value", "Add header");
      edit.addItem(new Text({ text: "Do not put secrets here: the step is stored with the multi action and is readable by everyone who can open it." }).addStyleClass("zsacSmall"));
      if (s.Method !== "GET" && s.Method !== "DELETE") {
        this._field(edit, "Body", new TextArea({ value: s.Body, rows: 6, width: "100%", change: (e) => { s.Body = e.getParameter("value"); this._changed(false); } }).addStyleClass("zsacMono"));
      }
      this._field(edit, "Expected status", this._text(s, "Expect", { width: "10rem" }), "2xx, or a list such as 200,201. Any other status fails the step.");
      this._field(edit, "Timeout (seconds)", new Input({ type: "Number", value: String(s.TimeoutSec), width: "8rem", change: (e) => { s.TimeoutSec = Number(e.getParameter("value")); this._changed(false); } }),
        "The browser makes the call without cookies, so the endpoint must allow this origin (CORS).");
    },

    // PaPM -------------------------------------------------------------------------------------------------------------------
    _papmEditor(edit, s) {
      this._field(edit, "Environment", this._text(s, "Environment"));
      this._field(edit, "Function or process", this._text(s, "FunctionId"));
      edit.addItem(new Title({ text: "Parameters", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      this._pairs(edit, s.Parameters, "Name", "Value", "Add parameter");
      edit.addItem(new Text({ text: this._paramHint() + ". The sample data source only simulates the run; a real connection to PaPM is part of the data source." }).addStyleClass("zsacSmall"));
    },

    // validation results -------------------------------------------------------------------------------------------------------------
    _resultList(edit) {
      const box = new VBox().addStyleClass("sapUiMediumMarginTop");
      box.addItem(new Title({ text: "Validation", level: "H5" }));
      if (!this._results.length) { box.addItem(new MessageStrip({ text: "No problems found.", type: "Success", showIcon: true })); }
      this._results.forEach((r) => {
        const strip = new MessageStrip({ text: r.message, type: r.severity === "Error" ? "Error" : "Warning", showIcon: true }).addStyleClass("sapUiTinyMarginTop");
        if (r.step >= 0) { strip.attachBrowserEvent("click", () => this._select(r.step)); }
        box.addItem(strip);
      });
      edit.addItem(box);
    }
  });
});
