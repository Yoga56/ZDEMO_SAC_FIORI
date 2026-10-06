/**
 * Form for the selected widget, generated from the `builder` list of its registration. Field kinds:
 * text, textarea, number, bool, select, model, dimension, dimensions, measure, version, filters.
 * Keys are paths into the widget ("Title", "Binding.Rows", "Props.Format").
 * Event: change { widget } after any edit; the designer then rebuilds that widget.
 */
sap.ui.define([
  "sap/ui/core/Control",
  "sap/ui/core/Item",
  "sap/m/VBox",
  "sap/m/HBox",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/TextArea",
  "sap/m/Select",
  "sap/m/MultiComboBox",
  "sap/m/CheckBox",
  "sap/m/StepInput",
  "sap/m/Button",
  "sap/m/Title",
  "sap/m/Text",
  "../core/WidgetRegistry",
  "../core/FilterEngine",
  "../core/QueryEngine",
  "../core/CalcMeasures",
  "../widget/Widgets",
  "./FilterEditor",
  "./TreeEditor",
  "./ValueHelp",
  "sap/ui/core/IconPool"
], function (Control, Item, VBox, HBox, Label, Input, TextArea, Select, MultiComboBox, CheckBox, StepInput, Button, Title, Text,
  WidgetRegistry, FilterEngine, QueryEngine, CalcMeasures, Widgets, FilterEditor, TreeEditor, ValueHelp, IconPool) {
  "use strict";

  const BUILTIN = [{ DimId: "VERSION", Label: "Version" }, { DimId: "PERIOD", Label: "Period" }, { DimId: "MEASURE", Label: "Measure" }];

  function getPath(o, path) { return path.split(".").reduce((a, k) => (a === undefined || a === null ? undefined : a[k]), o); }
  function setPath(o, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    const target = keys.reduce((a, k) => { if (a[k] === undefined || a[k] === null) { a[k] = {}; } return a[k]; }, o);
    target[last] = value;
  }

  function months(from, to) {
    const out = [];
    if (!/^\d{4}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}$/.test(to || "")) { return out; }
    let y = +from.slice(0, 4); let m = +from.slice(5);
    const ey = +to.slice(0, 4); const em = +to.slice(5);
    while (y < ey || (y === ey && m <= em)) { out.push(y + "-" + String(m).padStart(2, "0")); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }

  return Control.extend("zsac.lib.designer.BuilderPanel", {
    metadata: {
      aggregations: { _form: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" } },
      events: { change: { parameters: { widget: { type: "object" } } } }
    },

    renderer: {
      apiVersion: 2,
      render(rm, panel) {
        rm.openStart("div", panel).class("zsacBuilder").openEnd();
        rm.renderControl(panel.getAggregation("_form"));
        rm.close("div");
      }
    },

    /** (Re)builds the form for a widget; null shows the hint. */
    async bind(widget, provider) {
      this._widget = widget;
      this._provider = provider;
      const token = (this._token = (this._token || 0) + 1);
      if (!widget) {
        this.setAggregation("_form", new VBox({ items: [new Text({ text: "Select a widget on the canvas to configure it." })] }));
        return;
      }
      const def = WidgetRegistry.get(widget.Type);
      const [models, model, versions, actions, multiActions, stories] = await Promise.all([
        provider.listModels(),
        widget.Binding && widget.Binding.ModelId ? provider.getModel(widget.Binding.ModelId).catch(() => null) : Promise.resolve(null),
        widget.Binding && widget.Binding.ModelId ? provider.listVersions(widget.Binding.ModelId).catch(() => []) : Promise.resolve([]),
        provider.listDataActions().catch(() => []),
        provider.listMultiActions().catch(() => []),
        provider.listStories().catch(() => [])
      ]);
      if (token !== this._token) { return; }
      const form = new VBox({ width: "100%" }).addStyleClass("zsacBuilderForm");
      form.addItem(new Title({ text: def ? def.name : widget.Type, level: "H5" }));
      (def ? def.builder : []).forEach((f) => {
        const field = this._field(f, widget, { models, model, versions, multiActions, stories, actions: actions.filter((a) => widget.Binding && a.ModelId === widget.Binding.ModelId) });
        if (field) {
          form.addItem(new Label({ text: f.label, design: "Bold" }).addStyleClass("sapUiSmallMarginTop"));
          form.addItem(field);
        }
      });
      this.setAggregation("_form", form);
    },

    _changed() { this.fireChange({ widget: this._widget }); },

    _set(path, value) { setPath(this._widget, path, value); this._changed(); },

    _field(f, widget, env) {
      const val = getPath(widget, f.key);
      const dims = ((env.model && env.model.Dimensions) || []);
      switch (f.kind) {
        case "icon": {
          // the SAP icon names, with a search help that shows the icons
          const items = (IconPool.getIconNames("SAP-icons") || []).map((n) => ({ key: "sap-icon://" + n, text: n, description: "", icon: "sap-icon://" + n }));
          return ValueHelp.input({ items, title: "Icons", value: val || "", placeholder: "sap-icon://home", change: (e) => this._set(f.key, e.getParameter("value").trim()) });
        }
        case "route": {
          const pages = ["home", "files", "stories", "analyser", "datasets", "modeller", "planning", "dataactions", "multiactions", "calendar"].map((p) => ({ key: p, text: p, description: "page" }))
            .concat((env.stories || []).map((s) => ({ key: "stories/" + s.Id, text: "stories/" + s.Id, description: "story " + s.Name })))
            .concat((env.models || []).map((m) => ({ key: "modeller/" + m.ModelId, text: "modeller/" + m.ModelId, description: "model " + m.Name })))
            .concat((env.actions || []).map((a) => ({ key: "dataactions/" + a.Id, text: "dataactions/" + a.Id, description: "data action " + a.Name })))
            .concat((env.multiActions || []).map((a) => ({ key: "multiactions/" + a.Id, text: "multiactions/" + a.Id, description: "multi action " + a.Name })));
          return ValueHelp.input({ items: pages, title: "Pages", value: val || "", placeholder: "stories/STORY_SALES", change: (e) => this._set(f.key, e.getParameter("value").trim()) });
        }
        case "text": return new Input({ value: val || "", width: "100%", change: (e) => this._set(f.key, e.getParameter("value")) });
        case "textarea": return new TextArea({ value: val || "", width: "100%", rows: 3, change: (e) => this._set(f.key, e.getParameter("value")) });
        case "number": return new StepInput({ value: val === undefined ? Number(f.default) || 0 : Number(val) || 0, min: f.min || 0, width: "100%", change: (e) => this._set(f.key, e.getParameter("value")) });
        case "hierarchies": return this._hierarchies(f, widget, env);
        case "valuetree":
        case "drivertree": {
          if (!env.model) { return new Text({ text: "Choose a model first." }); }
          return TreeEditor.build({ text: val || "", model: env.model, uncertainty: f.kind === "drivertree", onChange: (t) => this._set(f.key, t) });
        }
        case "dataaction": {
          const sel = new Select({ width: "100%", selectedKey: val || "", forceSelection: false });
          sel.addItem(new Item({ key: "", text: "(none)" }));
          env.actions.forEach((a) => sel.addItem(new Item({ key: a.Id, text: a.Name })));
          sel.attachChange((e) => this._set(f.key, e.getParameter("selectedItem").getKey()));
          return sel;
        }
        case "multiaction": {
          const sel = new Select({ width: "100%", selectedKey: val || "", forceSelection: false });
          sel.addItem(new Item({ key: "", text: "(none)" }));
          env.multiActions.forEach((a) => sel.addItem(new Item({ key: a.Id, text: a.Name })));
          sel.attachChange((e) => this._set(f.key, e.getParameter("selectedItem").getKey()));
          return sel;
        }
        case "attributes": {
          const box = new MultiComboBox({ width: "100%", selectedKeys: val || [], placeholder: "None" });
          const seen = new Set();
          dims.forEach((d) => (d.Attributes || []).forEach((a) => { if (!seen.has(a.Id)) { seen.add(a.Id); box.addItem(new Item({ key: a.Id, text: a.Label || a.Id })); } }));
          box.attachSelectionFinish((e) => this._set(f.key, e.getParameter("selectedItems").map((i) => i.getKey())));
          return box;
        }
        case "bool": return new CheckBox({ selected: val === undefined ? !!f.default : !!val, select: (e) => this._set(f.key, e.getParameter("selected")) });
        case "select": {
          const sel = new Select({ width: "100%", selectedKey: val || f.options[0][0], change: (e) => this._set(f.key, e.getParameter("selectedItem").getKey()) });
          f.options.forEach((o) => sel.addItem(new Item({ key: o[0], text: o[1] })));
          return sel;
        }
        case "model": {
          const sel = new Select({ width: "100%", selectedKey: val || "", forceSelection: false });
          sel.addItem(new Item({ key: "", text: "(none)" }));
          env.models.forEach((m) => sel.addItem(new Item({ key: m.ModelId, text: m.Name })));
          sel.attachChange(async (e) => {
            const id = e.getParameter("selectedItem").getKey();
            const defaults = JSON.parse(JSON.stringify(WidgetRegistry.get(widget.Type).defaults));
            widget.Binding = defaults.Binding || { ModelId: "", Rows: [], Columns: [], Measure: "", Filters: {} };
            widget.Binding.ModelId = id;
            if (widget.Props && "Dimension" in widget.Props) { widget.Props.Dimension = ""; }
            if (id) {
              Widgets.autoBind(widget, await this._provider.getModel(id), await this._provider.listVersions(id));
            }
            this._changed();
            this.bind(widget, this._provider);
          });
          return sel;
        }
        case "dimension": {
          const sel = new Select({ width: "100%", selectedKey: val || "" });
          sel.addItem(new Item({ key: "", text: "(none)" }));
          dims.forEach((d) => sel.addItem(new Item({ key: d.DimId, text: d.Label })));
          sel.attachChange((e) => this._set(f.key, e.getParameter("selectedItem").getKey()));
          return sel;
        }
        case "dimensions": {
          const all = dims.concat(BUILTIN);
          if (f.max === 1) {
            // one dimension: a list with one choice, not a multiple choice that keeps only the last pick
            const one = new Select({ width: "100%", selectedKey: (val || [])[0] || "", forceSelection: false });
            one.addItem(new Item({ key: "", text: "None" }));
            all.forEach((d) => one.addItem(new Item({ key: d.DimId, text: d.Label })));
            one.attachChange((e) => { const k = e.getParameter("selectedItem").getKey(); this._set(f.key, k ? [k] : []); });
            return one;
          }
          // several, in the order they are picked; at the limit the others are switched off instead of dropping a pick
          const box = new MultiComboBox({ width: "100%", selectedKeys: val || [], placeholder: "None" });
          all.forEach((d) => box.addItem(new Item({ key: d.DimId, text: d.Label })));
          const limit = () => { const full = f.max && box.getSelectedKeys().length >= f.max; box.getItems().forEach((i) => i.setEnabled(!full || box.getSelectedKeys().indexOf(i.getKey()) >= 0)); };
          limit();
          box.attachSelectionChange(limit);
          box.attachSelectionFinish((e) => {
            const picked = e.getParameter("selectedItems").map((i) => i.getKey());
            const before = getPath(widget, f.key) || [];
            // keep the order of picking: what was there stays first, new picks follow
            this._set(f.key, before.filter((k) => picked.indexOf(k) >= 0).concat(picked.filter((k) => before.indexOf(k) < 0)));
          });
          return box;
        }
        case "measure": {
          const sel = new Select({ width: "100%", selectedKey: val || "" });
          CalcMeasures.all(env.model).forEach((m) => sel.addItem(new Item({ key: m.MeasureId, text: m.Label + (m.Calculated ? " (calculated)" : "") })));
          sel.attachChange((e) => this._set(f.key, e.getParameter("selectedItem").getKey()));
          return sel;
        }
        case "version": {
          const sel = new Select({ width: "100%", selectedKey: val || "" });
          sel.addItem(new Item({ key: "", text: "(none)" }));
          env.versions.forEach((v) => sel.addItem(new Item({ key: v.VersionId, text: v.Name + " (" + v.VersionId + ")" })));
          sel.attachChange((e) => this._set(f.key, e.getParameter("selectedItem").getKey()));
          return sel;
        }
        case "filters": return this._filters(f, widget, env);
        default: return null;
      }
    },

    /** One select per dimension that has hierarchies: which one the widget uses on its axis (or none: flat members). */
    _hierarchies(f, widget, env) {
      const box = new VBox({ width: "100%" });
      const dims = ((env.model && env.model.Dimensions) || []).filter((d) => (d.Hierarchies || []).length);
      // the Date dimension has a built-in hierarchy
      dims.unshift({ DimId: "PERIOD", Label: "Date", Hierarchies: [{ Id: "TIME", Label: "Year > Quarter > Month" }] });
      if (!env.model) { box.addItem(new Text({ text: "Choose a model first." }).addStyleClass("zsacSmall")); return box; }
      const current = getPath(widget, f.key) || {};
      dims.forEach((d) => {
        box.addItem(new Text({ text: d.Label }).addStyleClass("zsacSmall"));
        const sel = new Select({ width: "100%", selectedKey: current[d.DimId] || "" });
        sel.addItem(new Item({ key: "", text: "(flat members)" }));
        d.Hierarchies.forEach((h) => sel.addItem(new Item({ key: h.Id, text: h.Label || h.Id })));
        sel.attachChange((e) => {
          const next = Object.assign({}, getPath(widget, f.key));
          const key = e.getParameter("selectedItem").getKey();
          if (key) { next[d.DimId] = key; } else { delete next[d.DimId]; }
          this._set(f.key, next);
        });
        box.addItem(sel);
      });
      return box;
    },

    _filters(f, widget, env) {
      return FilterEditor.build({
        model: env.model, versions: env.versions, filters: getPath(widget, f.key) || {},
        onChange: (next) => this._set(f.key, next),
        onRebuild: () => this.bind(widget, this._provider)
      });
    }
  });
});
