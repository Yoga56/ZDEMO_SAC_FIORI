sap.ui.define([
  "./BaseController",
  "sap/m/Button", "sap/m/MenuButton", "sap/m/Menu", "sap/m/MenuItem", "sap/m/ToolbarSpacer", "sap/m/Title", "sap/m/Text", "sap/m/Label", "sap/m/Input", "sap/m/TextArea",
  "sap/m/Select", "sap/m/ComboBox", "sap/m/MultiComboBox", "sap/m/CheckBox", "sap/m/Switch", "sap/m/VBox", "sap/m/HBox", "sap/m/MessageStrip", "sap/m/ObjectStatus",
  "sap/ui/core/Item", "sap/ui/core/Icon", "sap/m/Dialog", "sap/m/List", "sap/m/StandardListItem",
  "zsac/lib/planning/DataActionSchema",
  "zsac/lib/planning/DataActionRun",
  "../model/ShareDialog",
  "zsac/lib/designer/ValueHelp"
], function (BaseController, Button, MenuButton, Menu, MenuItem, ToolbarSpacer, Title, Text, Label, Input, TextArea, Select, ComboBox, MultiComboBox, CheckBox, Switch,
  VBox, HBox, MessageStrip, ObjectStatus, Item, Icon, Dialog, List, StandardListItem, Schema, Run, ShareDialog, ValueHelp) {
  "use strict";

  const BUILTIN = [{ id: "VERSION", label: "Version" }, { id: "PERIOD", label: "Date" }];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const memberText = (m) => m.Id + (m.Text && m.Text !== m.Id ? " – " + m.Text : "");

  /**
   * Data action designer, SAC style: the step flow on the left, the editor of the selected object (settings, parameters or a step) on the right.
   * The action is edited as a plain object; every change is a snapshot for undo and redo. Nothing is written before Save.
   */
  return BaseController.extend("zsac.fiori.controller.DataAction", {
    onInit() {
      this.onRoute("dataaction", (args) => this._load(args.id));
    },

    async _load(id) {
      const p = (this._p = await this.provider());
      const raw = await p.getDataAction(id);
      this._access = raw.Access; this._owner = raw.Owner; // who may do what with it
      this._a = Schema.normalizeAction(raw);
      this._saved = JSON.stringify(this._a);
      this._hist = [this._saved];
      this._pos = 0;
      this._sel = "settings";
      this._results = null;
      this._model = await p.getModel(this._a.ModelId);
      this._versions = await p.listVersions(this._a.ModelId);
      this._others = (await p.listDataActions()).filter((a) => a.ModelId === this._a.ModelId);
      this._usedIn = await this._findUsage(id);
      this._renderAll();
    },

    async _findUsage(id) {
      const p = this._p;
      const out = [];
      const stories = await Promise.all((await p.listStories()).map((s) => p.getStory(s.Id).catch(() => null)));
      stories.forEach((s) => { if (s && (s.Widgets || []).some((w) => w.Type === "dataaction.trigger" && w.Props && w.Props.ActionId === id)) { out.push("Story: " + s.Name); } });
      (await p.listMultiActions()).forEach((m) => { if ((m.Steps || []).some((s) => s.ActionId === id)) { out.push("Multi Action: " + m.Name); } });
      (await p.listDataActions()).forEach((a) => { if (a.Id !== id && (a.Steps || []).some((s) => s.StepType === "EMBED" && s.ActionId === id)) { out.push("Data Action: " + a.Name); } });
      return out;
    },

    // ---- model helpers -------------------------------------------------------------------------------------------------------------
    _dims() {
      return ((this._model && this._model.Dimensions) || []).map((d) => ({ id: d.DimId, label: d.Label || d.DimId })).concat(BUILTIN);
    },
    _members(dimId) { return Run.memberItems(this._model, this._versions, dimId); },
    _params(type, dimId) { return this._a.Parameters.filter((p) => (!type || p.Type === type) && (!dimId || p.DimId === dimId)); },

    // ---- state: dirty, history ------------------------------------------------------------------------------------------------------
    _dirty() { return JSON.stringify(this._a) !== this._saved; },

    /** Called after every edit: snapshot for undo and a cheap redraw of the parts that show names and validation state. */
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
      const readOnly = this._access === "READ"; // shared for viewing: look at it and run it, change nothing
      const edit = (c) => { if (!readOnly) { add(c); } };
      this.getView().toggleStyleClass("zsacReadOnly", readOnly);
      add(new Button({ icon: "sap-icon://nav-back", tooltip: "Back", type: "Transparent", press: () => this.navTo("dataactions") }));
      add(new Title({ text: this._a.Name + (this._dirty() ? " *" : ""), level: "H3" }));
      add(new Text({ text: this._access === "READ" ? "Shared with you by " + this._owner + ": you can view and run it" : this._access === "WRITE" && this._owner && this._owner !== "*" ? "Shared with you by " + this._owner + ": you can edit it" : this._access === "OWNER" ? "You are the owner" : "" }).addStyleClass("zsacSub"));
      add(new ToolbarSpacer());
      if (this._access === "OWNER") { add(new Button({ text: "Share", icon: "sap-icon://share-2", press: () => this._share() })); }
      edit(new Button({ icon: "sap-icon://undo", tooltip: "Undo", enabled: this._pos > 0, press: () => this._restore(this._pos - 1) }));
      edit(new Button({ icon: "sap-icon://redo", tooltip: "Redo", enabled: this._pos < this._hist.length - 1, press: () => this._restore(this._pos + 1) }));
      add(new Button({ text: "Settings", icon: "sap-icon://action-settings", type: this._sel === "settings" ? "Emphasized" : "Transparent", press: () => this._select("settings") }));
      add(new Button({ text: "Parameters (" + this._a.Parameters.length + ")", icon: "sap-icon://syntax", type: this._sel === "params" ? "Emphasized" : "Transparent", press: () => this._select("params") }));
      const menu = new Menu({ itemSelected: (e) => this._addStep(e.getParameter("item").data("type")) });
      Object.keys(Schema.STEP_TYPES).forEach((t) => menu.addItem(new MenuItem({ text: Schema.STEP_TYPES[t].label, icon: Schema.STEP_TYPES[t].icon }).data("type", t)));
      edit(new MenuButton({ text: "Add Step", icon: "sap-icon://add", menu }));
      edit(new Button({ icon: "sap-icon://navigation-up-arrow", tooltip: "Move step up", enabled: hasStep && this._sel > 0, press: () => this._move(-1) }));
      edit(new Button({ icon: "sap-icon://navigation-down-arrow", tooltip: "Move step down", enabled: hasStep && this._sel < this._a.Steps.length - 1, press: () => this._move(1) }));
      edit(new Button({ icon: "sap-icon://duplicate", tooltip: "Duplicate step", enabled: hasStep, press: () => this._duplicateStep() }));
      edit(new Button({ icon: "sap-icon://delete", tooltip: "Delete step", enabled: hasStep, press: () => this._deleteStep() }));
      add(new Button({ text: "Validate", icon: "sap-icon://validate", press: () => this._validate(true) }));
      add(new Button({ text: "Trace", icon: "sap-icon://inspection", tooltip: "Dry run: shows what every step would change, writes nothing", press: this.guard(() => this._open(true)) }));
      add(new Button({ text: "Run", icon: "sap-icon://play", press: this.guard(() => this._open(false)) }));
      edit(new Button({ text: "Save", icon: "sap-icon://save", type: "Emphasized", enabled: this._dirty(), press: this.guard(() => this._save()) }));
    },

    _share() {
      this.guard(async () => {
        if (this._dirty()) { throw new Error("Save the data action first"); }
        const saved = await ShareDialog.open({ provider: this._p, kind: "DATAACTION", id: this._a.Id });
        if (saved) { this.toast(saved.length ? "Sharing saved" : "Not shared with anyone"); }
      })();
    },

    _issues() {
      return Schema.validate(Schema.normalizeAction(this._a), { model: this._model, versions: this._versions, actions: this._others });
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
      await this._p.saveDataAction(this._a);
      this._saved = JSON.stringify(this._a);
      this._hist = [this._saved]; this._pos = 0;
      this._results = r;
      this.toast("Data action saved");
      this._renderAll();
      return true;
    },

    /** Run and Trace work on the saved action, so unsaved changes are saved first. */
    async _open(previewOnly) {
      if (this._dirty() && !(await this._save())) { return; }
      Run.open({ provider: this._p, actionId: this._a.Id, previewOnly, onDone: () => this._p.listRuns(null, 1) });
    },

    // ---- step operations ------------------------------------------------------------------------------------------------------------
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

    // ---- left: the step flow --------------------------------------------------------------------------------------------------------
    _renderFlow() {
      const flow = this.byId("flow");
      flow.destroyItems();
      const issues = this._results || [];
      const box = new VBox().addStyleClass("zsacFlow");
      const term = (t) => new Text({ text: t }).addStyleClass("zsacFlowTerm");
      const edge = () => new VBox().addStyleClass("zsacFlowEdge");
      box.addItem(term("Begin"));
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

    // ---- right: editors -------------------------------------------------------------------------------------------------------------
    _renderEdit() {
      const edit = this.byId("edit");
      edit.destroyItems();
      if (this._sel === "settings") { this._settings(edit); }
      else if (this._sel === "params") { this._parameters(edit); }
      else if (this._a.Steps[this._sel]) { this._stepEditor(edit, this._a.Steps[this._sel], this._sel); }
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
      this._field(edit, "Default model", new Text({ text: (this._model && this._model.Name) || this._a.ModelId }), "The model of a data action cannot change once it exists.");
      edit.addItem(new Title({ text: "Used In", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      const list = new List({ noDataText: "Not used yet. Add it to a story with the data action trigger widget, or to a multi action.", showSeparators: "None" });
      this._usedIn.forEach((u) => list.addItem(new StandardListItem({ title: u })));
      edit.addItem(list);
    },

    // parameters -------------------------------------------------------------------------------------------------------------------
    _parameters(edit) {
      edit.addItem(new HBox({ alignItems: "Center", justifyContent: "SpaceBetween", items: [
        new Title({ text: "Parameters", level: "H4" }),
        new Button({ text: "Add Parameter", icon: "sap-icon://add", press: () => this._addParam() })] }));
      edit.addItem(new Text({ text: "A parameter is asked for when the action runs. Use it in a step by choosing it, or by writing @Id." }).addStyleClass("zsacSmall"));
      const usage = Schema.usage(this._a);
      if (!this._a.Parameters.length) { edit.addItem(new Text({ text: "No parameters." }).addStyleClass("sapUiSmallMarginTop")); }
      this._a.Parameters.forEach((p, i) => {
        const card = new VBox().addStyleClass("zsacTraceCard sapUiSmallMarginTop");
        card.addItem(new HBox({ alignItems: "Center", justifyContent: "SpaceBetween", items: [
          new Title({ text: "@" + (p.Id || "?"), level: "H6" }),
          new Button({ icon: "sap-icon://delete", type: "Transparent", tooltip: "Delete parameter", press: () => { this._a.Parameters.splice(i, 1); this._changed(true); } })] }));
        this._field(card, "Id", this._text(p, "Id", { change: (e) => { p.Id = e.getParameter("value").trim(); this._changed(true); } }));
        this._field(card, "Prompt", this._text(p, "Prompt"));
        const type = new Select({ selectedKey: p.Type, width: "100%", items: [new Item({ key: "MEMBER", text: "Member" }), new Item({ key: "NUMBER", text: "Number" })],
          change: (e) => { p.Type = e.getParameter("selectedItem").getKey(); p.Default = p.Type === "NUMBER" ? 0 : []; this._changed(true); } });
        this._field(card, "Type", type);
        if (p.Type === "MEMBER") {
          const dim = new Select({ selectedKey: p.DimId, width: "100%", forceSelection: false, items: this._dims().map((d) => new Item({ key: d.id, text: d.label })),
            change: (e) => { p.DimId = e.getParameter("selectedItem").getKey(); p.Default = []; this._changed(true); } });
          this._field(card, "Dimension", dim);
          card.addItem(new CheckBox({ text: "Allow several members", selected: p.Multi, select: (e) => { p.Multi = e.getParameter("selected"); if (!p.Multi) { p.Default = p.Default.slice(0, 1); } this._changed(true); } }));
          if (p.DimId) {
            const def = new MultiComboBox({ width: "100%", placeholder: "No default (all members)", selectedKeys: p.Default,
              selectionFinish: (e) => { p.Default = e.getParameter("selectedItems").map((x) => x.getKey()); if (!p.Multi) { p.Default = p.Default.slice(0, 1); } this._changed(false); } });
            this._members(p.DimId).forEach((m) => def.addItem(new Item({ key: m.Id, text: memberText(m) })));
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
      this._a.Parameters.push(Schema.normalizeAction({ Parameters: [{ Id: "Param" + n, Prompt: "Parameter " + n, Type: "MEMBER", DimId: "", Multi: true }] }).Parameters[0]);
      this._changed(true);
    },

    // steps ------------------------------------------------------------------------------------------------------------------------
    _stepEditor(edit, s, index) {
      const t = Schema.STEP_TYPES[s.StepType];
      edit.addItem(new HBox({ alignItems: "Center", items: [new Icon({ src: t.icon }).addStyleClass("sapUiTinyMarginEnd"), new Title({ text: t.label + " step", level: "H4" })] }));
      edit.addItem(new Text({ text: t.hint }).addStyleClass("zsacSmall"));
      this._field(edit, "Name", this._text(s, "Name"));
      this._field(edit, "Description", this._text(s, "Description"));
      const active = new HBox({ alignItems: "Center", items: [new Switch({ state: s.Active, change: (e) => { s.Active = e.getParameter("state"); this._changed(false); } }), new Text({ text: "Step is active (inactive steps are skipped)" }).addStyleClass("sapUiTinyMarginBegin")] });
      this._field(edit, "Step Active", active);
      if (s.StepType === "EMBED") { this._embedEditor(edit, s); return; }
      this._filterEditor(edit, s, s.StepType === "DELETE" ? "Facts to delete" : "Filter (which facts the step works on)");
      if (s.StepType === "COPY") { this._copyEditor(edit, s); }
      if (s.StepType === "SCALE") { this._field(edit, "Factor", this._combo(s, "Factor", "NUMBER", true), "A number, or a number parameter."); }
      if (s.StepType === "ALLOCATE") { this._allocEditor(edit, s); }
      if (s.StepType === "CONVERT") { this._convertEditor(edit, s); }
      if (s.StepType === "FORMULA") { this._formulaEditor(edit, s); }
    },

    /** ComboBox whose list holds the matching parameters (as @Id) and whose text can also be typed: a number or a member id. */
    _combo(obj, key, type, numeric, dimId, members, write) {
      const c = new ComboBox({ width: "100%", value: String(obj[key] === undefined ? "" : obj[key]) });
      (members || []).forEach((m) => c.addItem(new Item({ key: m.Id, text: m.Id })));
      this._params(type, dimId).forEach((p) => c.addItem(new Item({ key: "@" + p.Id, text: "@" + p.Id + "  (" + (p.Prompt || p.Id) + ")" })));
      const commit = () => {
        const sel = c.getSelectedItem();
        const raw = sel ? sel.getKey() : c.getValue().trim();
        if (write) { write(raw); } else { obj[key] = numeric && raw !== "" && raw.charAt(0) !== "@" && Number.isFinite(Number(raw)) ? Number(raw) : raw; }
        this._changed(false);
      };
      c.attachChange(commit);
      return c;
    },

    /** Members of a dimension plus the member parameters of that dimension, as one multi select. */
    _memberSelect(dimId, keys, onChange, placeholder) {
      const c = new MultiComboBox({ width: "100%", placeholder: placeholder || "All members", selectedKeys: keys, selectionFinish: (e) => onChange(e.getParameter("selectedItems").map((i) => i.getKey())) });
      this._members(dimId).forEach((m) => c.addItem(new Item({ key: m.Id, text: memberText(m) })));
      this._params("MEMBER", dimId).forEach((p) => c.addItem(new Item({ key: "@" + p.Id, text: "@" + p.Id + "  (parameter)" })));
      return c;
    },

    _dimSelect(value, onChange) {
      return new Select({ width: "12rem", selectedKey: value, forceSelection: false, items: this._dims().map((d) => new Item({ key: d.id, text: d.label })), change: (e) => onChange(e.getParameter("selectedItem").getKey()) });
    },

    _filterEditor(edit, s, title) {
      edit.addItem(new Title({ text: title, level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      Object.keys(s.Filter).forEach((dim) => {
        const row = new HBox({ alignItems: "Center", wrap: "Wrap" }).addStyleClass("zsacRow");
        row.addItem(new Text({ text: (this._dims().find((d) => d.id === dim) || { label: dim }).label, width: "8rem" }));
        row.addItem(this._memberSelect(dim, s.Filter[dim], (keys) => { if (keys.length) { s.Filter[dim] = keys; } else { delete s.Filter[dim]; } this._changed(true); }));
        row.addItem(new Button({ icon: "sap-icon://decline", type: "Transparent", tooltip: "Remove", press: () => { delete s.Filter[dim]; this._changed(true); } }));
        edit.addItem(row);
      });
      const free = this._dims().filter((d) => !s.Filter[d.id]);
      if (free.length) {
        const sel = new Select({ width: "12rem", selectedKey: "", items: [new Item({ key: "", text: "Add a filter ..." })].concat(free.map((d) => new Item({ key: d.id, text: d.label }))),
          change: (e) => { const k = e.getParameter("selectedItem").getKey(); if (k) { s.Filter[k] = []; this._changed(true); } } });
        edit.addItem(sel);
      }
      if (!Object.keys(s.Filter).length) { edit.addItem(new Text({ text: "No filter: every fact of the model is used." }).addStyleClass("zsacSmall")); }
    },

    _copyEditor(edit, s) {
      edit.addItem(new Title({ text: "Copy rules (from → to, per dimension)", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      s.Rules.forEach((r, i) => {
        const row = new HBox({ alignItems: "Center", wrap: "Wrap" }).addStyleClass("zsacRow");
        row.addItem(this._dimSelect(r.Dim, (v) => { r.Dim = v; r.From = ""; r.To = ""; this._changed(true); }));
        const members = this._members(r.Dim);
        row.addItem(this._combo(r, "From", "MEMBER", false, r.Dim, members));
        row.addItem(new Icon({ src: "sap-icon://arrow-right" }));
        row.addItem(this._combo(r, "To", "MEMBER", false, r.Dim, members));
        row.addItem(new Button({ icon: "sap-icon://decline", type: "Transparent", tooltip: "Remove rule", press: () => { s.Rules.splice(i, 1); this._changed(true); } }));
        edit.addItem(row);
      });
      edit.addItem(new Button({ text: "Add rule", icon: "sap-icon://add", press: () => { s.Rules.push({ Dim: "VERSION", From: "", To: "" }); this._changed(true); } }));
      edit.addItem(new Text({ text: "Leave From empty to copy every member. A date shifts by whole years or quarters, for example 2026-03 to 2027-03." }).addStyleClass("zsacSmall"));

      edit.addItem(new Title({ text: "Aggregate to", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      s.AggregateTo.forEach((x, i) => {
        const row = new HBox({ alignItems: "Center", wrap: "Wrap" }).addStyleClass("zsacRow");
        row.addItem(this._dimSelect(x.Dim, (v) => { x.Dim = v; x.Member = ""; this._changed(true); }));
        row.addItem(this._combo(x, "Member", "MEMBER", false, x.Dim, this._members(x.Dim)));
        row.addItem(new Button({ icon: "sap-icon://decline", type: "Transparent", tooltip: "Remove", press: () => { s.AggregateTo.splice(i, 1); this._changed(true); } }));
        edit.addItem(row);
      });
      edit.addItem(new Button({ text: "Add aggregation", icon: "sap-icon://add", press: () => { s.AggregateTo.push({ Dim: "", Member: "" }); this._changed(true); } }));
      edit.addItem(new Text({ text: "Sum the copied values onto one member of the dimension, for example all regions into one." }).addStyleClass("zsacSmall"));

      this._field(edit, "Write mode", new Select({ width: "14rem", selectedKey: s.WriteMode, items: [new Item({ key: "OVERWRITE", text: "Overwrite" }), new Item({ key: "APPEND", text: "Append (add to existing)" })],
        change: (e) => { s.WriteMode = e.getParameter("selectedItem").getKey(); this._changed(false); } }));
      this._field(edit, "Copy factor", this._combo(s, "Factor", "NUMBER", true), "Values are multiplied by this number while copying.");
    },

    _allocEditor(edit, s) {
      edit.addItem(new Title({ text: "Allocation", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      this._field(edit, "Spread over dimension", this._dimSelect(s.TargetDim, (v) => { s.TargetDim = v; s.TargetMembers = []; this._changed(true); }));
      if (s.TargetDim) {
        this._field(edit, "Target members", this._memberSelect(s.TargetDim, s.TargetMembers, (keys) => { s.TargetMembers = keys; this._changed(false); }, "Choose members"));
      }
      this._field(edit, "Target version", this._combo(s, "TgtVersion", "MEMBER", false, "VERSION", this._members("VERSION")), "Empty keeps the version of the source values.");
      this._field(edit, "Driver", new Select({ width: "18rem", selectedKey: s.Driver, change: (e) => { s.Driver = e.getParameter("selectedItem").getKey(); this._changed(true); },
        items: [new Item({ key: "EQUAL", text: "Equal shares" }), new Item({ key: "PROPORTIONAL", text: "In proportion to existing values" }), new Item({ key: "REFERENCE", text: "Like a reference version" })] }));
      if (s.Driver === "REFERENCE") { this._field(edit, "Reference version", this._combo(s, "DriverVersion", "MEMBER", false, "VERSION", this._members("VERSION"))); }
      this._field(edit, "Write mode", new Select({ width: "14rem", selectedKey: s.WriteMode, items: [new Item({ key: "OVERWRITE", text: "Overwrite" }), new Item({ key: "APPEND", text: "Append (add to existing)" })],
        change: (e) => { s.WriteMode = e.getParameter("selectedItem").getKey(); this._changed(false); } }));
      edit.addItem(new CheckBox({ text: "Clear the source values after allocating", selected: s.ClearSource, select: (e) => { s.ClearSource = e.getParameter("selected"); this._changed(false); } }));
    },

    _formulaEditor(edit, s) {
      edit.addItem(new Title({ text: "Formula", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      const measures = (this._model.Measures || []).map((m) => m.MeasureId);
      this._field(edit, "Formula", new TextArea({ width: "100%", rows: 3, value: s.Formula, placeholder: "REVENUE - COST",
        liveChange: (e) => { s.Formula = e.getParameter("value"); this._changed(false); } }),
        "Measure ids (" + measures.join(", ") + "), numbers and + - * / ^ ( ). MEASURE@VERSION is the measure in another version, for example REVENUE@ACT * 1.05. It is worked out for every combination of members the filter covers, on the values as they are in the model.");
      edit.addItem(new Button({ text: "Insert a measure or version...", icon: "sap-icon://add", type: "Transparent", press: () => {
        const items = measures.map((id) => ({ key: id, text: id, description: ((this._model.Measures || []).find((m) => m.MeasureId === id) || {}).Label || "" }))
          .concat((this._versions || []).map((v) => ({ key: "@" + v.VersionId, text: "@" + v.VersionId, description: "the measure written before it, in version " + v.Name })));
        ValueHelp.open({ title: "Insert", items, onSelect: (keys) => {
          const k = keys[0];
          s.Formula = (s.Formula || "").replace(/\s+$/, "") + (k[0] === "@" ? k : (s.Formula ? " " : "") + k);
          this._changed(true);
        } });
      } }));
      this._field(edit, "Write the result into measure", new Select({ width: "14rem", selectedKey: s.TgtMeasure, forceSelection: false,
        items: [new Item({ key: "", text: "Choose a measure" })].concat((this._model.Measures || []).map((m) => new Item({ key: m.MeasureId, text: m.Label }))),
        change: (e) => { s.TgtMeasure = e.getParameter("selectedItem").getKey(); this._changed(false); } }));
      this._field(edit, "Write into version", this._combo(s, "TgtVersion", "MEMBER", false, "VERSION", this._members("VERSION")), "Empty keeps the version of each value.");
      edit.addItem(new Text({ text: "A cell where the formula cannot be worked out (a division by zero) is skipped. The formula is applied to every cell separately, so a ratio is not summed over members; for a ratio of totals use a calculated measure." }).addStyleClass("zsacSmall"));
    },

    _convertEditor(edit, s) {
      edit.addItem(new Title({ text: "Currency conversion", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      const dimsWithCurrency = (this._model.Dimensions || []).filter((d) => (d.Attributes || []).some((x) => x.Id === "CURRENCY"));
      this._field(edit, "Currency comes from dimension", new Select({ width: "14rem", selectedKey: s.CurrencyDim, forceSelection: false,
        items: [new Item({ key: "", text: "One currency (below)" })].concat(dimsWithCurrency.map((d) => new Item({ key: d.DimId, text: d.Label }))),
        change: (e) => { s.CurrencyDim = e.getParameter("selectedItem").getKey(); this._changed(true); } }), "The CURRENCY attribute of its members says what currency their values are in.");
      if (!s.CurrencyDim) { this._field(edit, "Convert from", this._combo(s, "FromCurrency", "MEMBER", false, "", ValueHelp.CURRENCIES.map((c) => ({ Id: c.key }))), "A currency code, for example USD."); }
      this._field(edit, "Convert into", this._combo(s, "ToCurrency", "MEMBER", false, "", ValueHelp.CURRENCIES.map((c) => ({ Id: c.key }))), "A currency code, or a parameter.");
      this._field(edit, "Rates", new TextArea({ width: "100%", rows: 5, value: s.Rates, placeholder: "USD>EUR=0.92\nUSD>EUR@2026-Q2=0.94\nUSD>EUR@2026-03=0.93",
        liveChange: (e) => { s.Rates = e.getParameter("value"); this._changed(false); } }), "One rate per line. A rate for a month wins over its quarter, its year, then one without a period; a pair also converts back.");
      this._field(edit, "Write into version", this._combo(s, "TgtVersion", "MEMBER", false, "VERSION", this._members("VERSION")), "Empty keeps the version of the values.");
      this._field(edit, "Write into measure", new Select({ width: "14rem", selectedKey: s.TgtMeasure, forceSelection: false,
        items: [new Item({ key: "", text: "Same measure" })].concat((this._model.Measures || []).map((m) => new Item({ key: m.MeasureId, text: m.Label }))),
        change: (e) => { s.TgtMeasure = e.getParameter("selectedItem").getKey(); this._changed(false); } }), "Converting in place needs a target version or measure to keep the original.");
    },

    _embedEditor(edit, s) {
      const sel = new Select({ width: "100%", forceSelection: false, selectedKey: s.ActionId, change: (e) => { s.ActionId = e.getParameter("selectedItem").getKey(); s.ParamMap = {}; this._changed(true); },
        items: [new Item({ key: "", text: "Choose a data action" })].concat(this._others.filter((a) => a.Id !== this._a.Id).map((a) => new Item({ key: a.Id, text: a.Name }))) });
      this._field(edit, "Data action to run", sel, "Only data actions of the same model can be embedded.");
      const child = this._others.find((a) => a.Id === s.ActionId);
      if (child && (child.Parameters || []).length) {
        edit.addItem(new Title({ text: "Parameter values of the embedded action", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
        Schema.normalizeAction(child).Parameters.forEach((cp) => {
          const holder = { v: s.ParamMap[cp.Id] === undefined ? "" : (Array.isArray(s.ParamMap[cp.Id]) ? s.ParamMap[cp.Id].join(",") : s.ParamMap[cp.Id]) };
          const c = this._combo(holder, "v", cp.Type, cp.Type === "NUMBER", cp.Type === "MEMBER" ? cp.DimId : "", cp.Type === "MEMBER" ? this._members(cp.DimId) : [], (raw) => {
            if (raw === "") { delete s.ParamMap[cp.Id]; }
            else if (cp.Type === "NUMBER" && raw.charAt(0) !== "@") { s.ParamMap[cp.Id] = Number(raw); }
            else { s.ParamMap[cp.Id] = raw.indexOf(",") >= 0 ? raw.split(",").map((x) => x.trim()) : raw; }
          });
          this._field(edit, cp.Prompt || cp.Id, c, "Empty uses the default of the embedded action.");
        });
      }
    },

    // validation result list --------------------------------------------------------------------------------------------------------
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
