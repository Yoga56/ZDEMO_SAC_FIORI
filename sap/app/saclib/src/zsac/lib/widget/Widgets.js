/**
 * Registers the built-in widget types with WidgetRegistry. Importing this module is all an app does to get
 * Bar, Line, Donut, Funnel, Sankey, Gauge, KPI, Table, Filter and Text widgets in the designer and viewer.
 *
 * A custom widget is the same call from any other module:  WidgetRegistry.register("my.type", {...}).
 */
sap.ui.define([
  "sap/m/MultiComboBox",
  "sap/m/Text",
  "sap/ui/core/Item",
  "../core/WidgetRegistry",
  "../core/FilterEngine",
  "../core/QueryEngine",
  "./SvgChart",
  "./WidgetCard",
  "./KpiTile",
  "./PivotTable",
  "./ChartData",
  "../core/ModelSchema",
  "../core/HierarchyEngine",
  "../planning/PlanGrid",
  "../planning/PlanPublisher",
  "../planning/DataActionRun",
  "sap/m/VBox", "sap/m/Button", "sap/m/MessageBox", "sap/m/MessageToast"
], function (MultiComboBox, Text, Item, WidgetRegistry, FilterEngine, QueryEngine, SvgChart, WidgetCard, KpiTile, PivotTable, ChartData, ModelSchema, HierarchyEngine,
  PlanGrid, PlanPublisher, DataActionRun, VBox, Button, MessageBox, MessageToast) {
  "use strict";

  const emptyBinding = () => ({ ModelId: "", Rows: [], Columns: [], Measure: "", Filters: {}, Hierarchies: {} });

  /** Only hierarchies of dimensions the widget really uses on an axis count. */
  function activeHierarchies(b) {
    const used = new Set((b.Rows || []).concat(b.Columns || []));
    const out = {};
    Object.keys(b.Hierarchies || {}).forEach((d) => { if (b.Hierarchies[d] && used.has(d)) { out[d] = b.Hierarchies[d]; } });
    return out;
  }

  /** Aggregate for a widget: story filters narrow the widget's own filters. */
  async function runQuery(widget, ctx, mutate) {
    const b = widget.Binding;
    const filters = FilterEngine.merge(ctx.filters || {}, b.Filters || {});
    if (b.Measure && !(filters.MEASURE && filters.MEASURE.length)) { filters.MEASURE = [b.Measure]; }
    if (mutate) { mutate(filters); }
    const spec = { ModelId: b.ModelId, Rows: b.Rows || [], Columns: b.Columns || [], Filters: filters, Hierarchies: activeHierarchies(b) };
    // unpublished plan changes of this model are part of what every widget on the page shows
    if (ctx.plan && ctx.plan.dirty && ctx.plan.models().indexOf(b.ModelId) >= 0) {
      const model = await ctx.provider.getModel(b.ModelId);
      const facts = ctx.plan.overlay(await ctx.provider.readFacts(b.ModelId, QueryEngine.expandFilters(model, filters)));
      const result = QueryEngine.aggregate(model, facts, { rows: spec.Rows, columns: spec.Columns, filters, hierarchies: spec.Hierarchies });
      result.model = model;
      return result;
    }
    return ctx.provider.query(spec);
  }

  const noModel = (card, widget) => {
    if (widget.Binding && widget.Binding.ModelId) { return false; }
    card.setMessage("Choose a model in the builder panel");
    return true;
  };

  /** Wraps a loader into card.refresh with busy and error handling. */
  function wire(card, widget, load, options) {
    card.refresh = async function () {
      card.setBusy(true);
      try {
        if (!(options && options.noModel) && noModel(card, widget)) { return; }
        card.setMessage("");
        await load();
      } catch (e) {
        card.setMessage(e.message || String(e));
      } finally {
        card.setBusy(false);
      }
    };
    return card;
  }

  const baseBuilder = [
    { key: "Title", label: "Title", kind: "text" },
    { key: "Binding.ModelId", label: "Model", kind: "model" }
  ];
  const queryBuilder = (rowsLabel, colsLabel, maxRows) => baseBuilder.concat([
    { key: "Binding.Rows", label: rowsLabel, kind: "dimensions", max: maxRows }
  ]).concat(colsLabel ? [{ key: "Binding.Columns", label: colsLabel, kind: "dimensions", max: 1 }] : []).concat([
    { key: "Binding.Hierarchies", label: "Hierarchies", kind: "hierarchies" },
    { key: "Binding.Measure", label: "Measure", kind: "measure" },
    { key: "Binding.Filters", label: "Filters", kind: "filters" }
  ]);
  const chartDefaults = (rows, cols) => ({ Binding: Object.assign(emptyBinding(), { Rows: rows, Columns: cols }), Props: {} });

  function chart(type, name, icon, size, rowsLabel, colsLabel, maxRows) {
    WidgetRegistry.register(type, {
      name, icon, group: "Charts", size,
      defaults: chartDefaults(["$FIRST_DIM"], type === "chart.sankey" ? ["$SECOND_DIM"] : []),
      builder: queryBuilder(rowsLabel, colsLabel, maxRows).concat([{ key: "Props.Level", label: "Hierarchy level shown (1 = top)", kind: "number", min: 1 }]),
      create(widget, ctx) {
        const content = new SvgChart({ type });
        const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content });
        return wire(card, widget, async () => {
          const result = await runQuery(widget, ctx);
          const measure = (result.model.Measures || []).find((m) => m.MeasureId === widget.Binding.Measure);
          content.setData(ChartData.fromResult(type, result, measure && measure.Label, Object.keys(activeHierarchies(widget.Binding)).length ? Math.max(1, Number(widget.Props.Level) || 1) : 0));
        });
      }
    });
  }

  chart("chart.bar", "Bar chart", "sap-icon://vertical-bar-chart", { w: 6, h: 4 }, "Categories", "Series", 1);
  chart("chart.line", "Line chart", "sap-icon://line-chart", { w: 6, h: 4 }, "X axis", "Series", 1);
  chart("chart.donut", "Donut chart", "sap-icon://donut-chart", { w: 4, h: 4 }, "Slices", null, 1);
  chart("chart.funnel", "Funnel chart", "sap-icon://upstacked-chart", { w: 4, h: 4 }, "Stages", null, 1);
  chart("chart.sankey", "Sankey chart", "sap-icon://sankey-diagram", { w: 6, h: 4 }, "From", "To", 1);

  WidgetRegistry.register("chart.gauge", {
    name: "Gauge", icon: "sap-icon://measure", group: "Charts", size: { w: 3, h: 3 },
    defaults: { Binding: emptyBinding(), Props: { TargetVersion: "" } },
    builder: baseBuilder.concat([
      { key: "Binding.Measure", label: "Measure", kind: "measure" },
      { key: "Binding.Filters", label: "Filters", kind: "filters" },
      { key: "Props.TargetVersion", label: "Target version", kind: "version" },
      { key: "Props.TargetValue", label: "or fixed target", kind: "number" }
    ]),
    create(widget, ctx) {
      const content = new SvgChart({ type: "chart.gauge" });
      const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content });
      return wire(card, widget, async () => {
        const value = (await runQuery(widget, ctx)).grand;
        let max = Number(widget.Props.TargetValue) || 0;
        let label = "";
        if (widget.Props.TargetVersion) {
          max = (await runQuery(widget, ctx, (f) => { f.VERSION = [widget.Props.TargetVersion]; })).grand;
          label = "of " + widget.Props.TargetVersion;
        }
        content.setData({ value, max, label: label ? Intl.NumberFormat("en", { notation: "compact" }).format(value) + " " + label : "" });
      });
    }
  });

  WidgetRegistry.register("kpi", {
    name: "KPI", icon: "sap-icon://kpi-corporate-performance", group: "Indicators", size: { w: 3, h: 2 },
    defaults: { Binding: emptyBinding(), Props: { CompareVersion: "", Format: "compact", LowerIsBetter: false } },
    builder: baseBuilder.concat([
      { key: "Binding.Measure", label: "Measure", kind: "measure" },
      { key: "Binding.Filters", label: "Filters", kind: "filters" },
      { key: "Props.CompareVersion", label: "Compare with version", kind: "version" },
      { key: "Props.Format", label: "Number format", kind: "select", options: [["compact", "Compact (1.2M)"], ["full", "Full (1,234,567)"], ["measure", "Measure format (scale, decimals)"]] },
      { key: "Props.LowerIsBetter", label: "Lower is better", kind: "bool" }
    ]),
    create(widget, ctx) {
      const tile = new KpiTile({ format: widget.Props.Format || "compact", lowerIsBetter: !!widget.Props.LowerIsBetter });
      const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content: tile });
      return wire(card, widget, async () => {
        const result = await runQuery(widget, ctx);
        const measure = (result.model.Measures || []).find((m) => m.MeasureId === widget.Binding.Measure);
        tile.setValue(result.grand);
        if (measure && widget.Props.Format === "measure") {
          tile.setScale(measure.Scale > 1 ? measure.Scale : 1);
          tile.setDecimals(measure.Decimals);
          tile.setUnit(ModelSchema.unitLabel(measure));
        } else {
          tile.setUnit(measure && measure.UnitType !== "None" ? measure.Unit : "");
        }
        if (widget.Props.CompareVersion) {
          tile.setCompare((await runQuery(widget, ctx, (f) => { f.VERSION = [widget.Props.CompareVersion]; })).grand);
          tile.setCompareLabel(widget.Props.CompareVersion);
        } else {
          tile.setCompare(null);
        }
      });
    }
  });

  WidgetRegistry.register("table", {
    name: "Table", icon: "sap-icon://table-view", group: "Tables", size: { w: 12, h: 5 },
    defaults: { Binding: Object.assign(emptyBinding(), { Rows: ["$FIRST_DIM"], Columns: ["VERSION"] }), Props: { ShowTotals: true, UseMeasureFormat: true, Decimals: 0 } },
    builder: queryBuilder("Rows", "Columns", 3).concat([
      { key: "Props.ShowTotals", label: "Show totals", kind: "bool" },
      { key: "Props.ExpandLevel", label: "Hierarchy levels expanded at first", kind: "number", min: 1, default: 2 },
      { key: "Props.UseMeasureFormat", label: "Use the measure's scale and decimals", kind: "bool", default: true },
      { key: "Props.Decimals", label: "Decimals (when not using the measure's)", kind: "number" }
    ]),
    create(widget, ctx) {
      const table = new PivotTable({ expandLevel: Math.max(1, Number(widget.Props.ExpandLevel) || 2), showTotals: widget.Props.ShowTotals !== false, decimals: widget.Props.UseMeasureFormat === false ? Number(widget.Props.Decimals) || 0 : -1 });
      const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content: table });
      return wire(card, widget, async () => { table.setResult(await runQuery(widget, ctx)); });
    }
  });

  WidgetRegistry.register("planning.table", {
    name: "Planning table", icon: "sap-icon://table-chart", group: "Planning", size: { w: 12, h: 6 },
    defaults: { Binding: Object.assign(emptyBinding(), { Rows: ["$FIRST_DIM"], Columns: ["PERIOD"], Hierarchies: { PERIOD: "TIME" } }),
      Props: { Editable: true, ExpandRows: 3, ExpandCols: 2, ShowTotals: true, Attributes: [] } },
    builder: baseBuilder.concat([
      { key: "Binding.Rows", label: "Rows", kind: "dimensions" },
      { key: "Binding.Columns", label: "Columns", kind: "dimensions" },
      { key: "Binding.Hierarchies", label: "Hierarchies", kind: "hierarchies" },
      { key: "Binding.Measure", label: "Measure", kind: "measure" },
      { key: "Binding.Filters", label: "Filters (choose a single version to plan in)", kind: "filters" },
      { key: "Props.Attributes", label: "Attribute columns", kind: "attributes" },
      { key: "Props.Editable", label: "Editable", kind: "bool", default: true },
      { key: "Props.ExpandCols", label: "Column levels open at first", kind: "number", min: 1, default: 2 },
      { key: "Props.ExpandRows", label: "Row levels open at first", kind: "number", min: 1, default: 3 },
      { key: "Props.ShowTotals", label: "Show totals (flat tables)", kind: "bool", default: true }
    ]),
    create(widget, ctx) {
      const grid = new PlanGrid();
      const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content: grid });
      return wire(card, widget, async () => {
        const b = widget.Binding;
        const model = await ctx.provider.getModel(b.ModelId);
        const versions = await ctx.provider.listVersions(b.ModelId);
        const filters = FilterEngine.merge(ctx.filters || {}, b.Filters || {});
        if (b.Measure && !(filters.MEASURE && filters.MEASURE.length)) { filters.MEASURE = [b.Measure]; }
        const facts = await ctx.provider.readFacts(b.ModelId, QueryEngine.expandFilters(model, filters));
        const comments = ctx.provider.capabilities.comments ? await ctx.provider.listComments(b.ModelId) : [];
        grid.setContext({ model, facts, versions, plan: ctx.plan, comments,
          readReference: (versionId) => ctx.provider.readFacts(b.ModelId, QueryEngine.expandFilters(model, Object.assign({}, filters, { VERSION: [versionId] }))),
          spec: { rows: b.Rows || [], columns: b.Columns || [], filters, hierarchies: activeHierarchies(b) },
          options: { editable: widget.Props.Editable !== false, expandRows: Math.max(1, Number(widget.Props.ExpandRows) || 3), expandCols: Math.max(1, Number(widget.Props.ExpandCols) || 2),
            attributes: widget.Props.Attributes || [], showTotals: widget.Props.ShowTotals !== false } });
      });
    }
  });

  WidgetRegistry.register("dataaction.trigger", {
    name: "Data action trigger", icon: "sap-icon://play", group: "Planning", size: { w: 4, h: 3 },
    defaults: { Binding: emptyBinding(), Props: { ActionId: "", Subtitle: "Run the data action", ParamDims: [] } },
    builder: [
      { key: "Title", label: "Title", kind: "text" },
      { key: "Binding.ModelId", label: "Model", kind: "model" },
      { key: "Props.ActionId", label: "Data action", kind: "dataaction" },
      { key: "Props.Subtitle", label: "Subtitle", kind: "text" },
      { key: "Props.ParamDims", label: "Extra data filter the planner can set", kind: "dimensions" }
    ],
    create(widget, ctx) {
      const box = new VBox({ width: "100%" });
      const card = new WidgetCard({ title: "", widgetId: widget.Id, bare: false, content: box });
      const params = {};
      let declared = null;
      let lastValues;
      const run = async () => {
        const id = widget.Props.ActionId;
        if (!id) { MessageToast.show("Choose a data action in the builder panel"); return; }
        try {
          if (ctx.plan && ctx.plan.dirty) {
            const ok = await new Promise((resolve) => MessageBox.confirm("A data action runs on published data. Publish your " + ctx.plan.count + " unpublished changes first?", {
              actions: ["Publish and run", MessageBox.Action.CANCEL], emphasizedAction: "Publish and run", onClose: (a) => resolve(a === "Publish and run") }));
            if (!ok) { return; }
            await PlanPublisher.publish(ctx.plan, ctx.provider);
          }
          const filter = {};
          Object.keys(params).forEach((d) => { if (params[d].length) { filter[d] = params[d]; } });
          const r = await ctx.provider.executeDataAction(id, { Filter: filter, Values: declared ? declared.values : undefined });
          MessageToast.show(r.Changed + " values changed");
          ctx.bus.fire("refresh-all", {});
        } catch (e) {
          MessageBox.error(e.message || String(e));
        }
      };
      return wire(card, widget, async () => {
        box.destroyItems();
        const action = widget.Props.ActionId ? await ctx.provider.getDataAction(widget.Props.ActionId).catch(() => null) : null;
        card.setTitle(widget.Title || (action ? action.Name : "Data action"));
        box.addItem(new Button({ text: action ? action.Name : "Choose a data action", icon: "sap-icon://play", type: "Emphasized", width: "100%", press: run }));
        box.addItem(new Text({ text: widget.Props.Subtitle || "" }).addStyleClass("zsacSmall"));
        const model = await ctx.provider.getModel(widget.Binding.ModelId);
        const versions = await ctx.provider.listVersions(model.ModelId);
        lastValues = declared ? declared.values : lastValues;
        declared = null;
        if (action && (action.Parameters || []).length) {
          declared = DataActionRun.paramControls(action, model, versions, lastValues);
          box.addItem(declared.box);
        }
        for (const dimId of widget.Props.ParamDims || []) {
          let label = dimId;
          let members;
          if (dimId === "PERIOD") { label = "Date"; members = HierarchyEngine.monthRange(model.PeriodFrom, model.PeriodTo).map((p) => ({ Id: p, Text: p })); }
          else if (dimId === "VERSION") { label = "Version"; members = versions.map((v) => ({ Id: v.VersionId, Text: v.Name })); }
          else {
            const d = model.Dimensions.find((x) => x.DimId === dimId);
            if (!d) { continue; }
            label = d.Label; members = d.Members || [];
          }
          const select = new MultiComboBox({ width: "100%", placeholder: label + " (all)", selectionFinish: (e) => { params[dimId] = e.getParameter("selectedItems").map((i) => i.getKey()); } });
          members.forEach((m) => select.addItem(new Item({ key: m.Id, text: m.Id + (m.Text && m.Text !== m.Id ? " \u2013 " + m.Text : "") })));
          params[dimId] = ((ctx.filters || {})[dimId]) || params[dimId] || [];
          select.setSelectedKeys(params[dimId]);
          box.addItem(select);
        }
      });
    }
  });

  WidgetRegistry.register("multiaction.trigger", {
    name: "Multi action trigger", icon: "sap-icon://process", group: "Planning", size: { w: 4, h: 2 },
    defaults: { Binding: emptyBinding(), Props: { ActionId: "", Subtitle: "Run the multi action" } },
    builder: [
      { key: "Title", label: "Title", kind: "text" },
      { key: "Props.ActionId", label: "Multi action", kind: "multiaction" },
      { key: "Props.Subtitle", label: "Subtitle", kind: "text" }
    ],
    create(widget, ctx) {
      const box = new VBox({ width: "100%" });
      const card = new WidgetCard({ title: "", widgetId: widget.Id, bare: false, content: box });
      const run = async () => {
        const id = widget.Props.ActionId;
        if (!id) { MessageToast.show("Choose a multi action in the builder panel"); return; }
        try {
          if (ctx.plan && ctx.plan.dirty) {
            const ok = await new Promise((resolve) => MessageBox.confirm("A multi action runs on published data. Publish your " + ctx.plan.count + " unpublished changes first?", {
              actions: ["Publish and run", MessageBox.Action.CANCEL], emphasizedAction: "Publish and run", onClose: (a) => resolve(a === "Publish and run") }));
            if (!ok) { return; }
            await PlanPublisher.publish(ctx.plan, ctx.provider);
          }
          DataActionRun.openMulti({ provider: ctx.provider, actionId: id, onDone: () => ctx.bus.fire("refresh-all", {}) });
        } catch (e) {
          MessageBox.error(e.message || String(e));
        }
      };
      return wire(card, widget, async () => {
        box.destroyItems();
        const action = widget.Props.ActionId ? await ctx.provider.getMultiAction(widget.Props.ActionId).catch(() => null) : null;
        card.setTitle(widget.Title || (action ? action.Name : "Multi action"));
        box.addItem(new Button({ text: action ? action.Name : "Choose a multi action", icon: "sap-icon://play", type: "Emphasized", width: "100%", press: run }));
        box.addItem(new Text({ text: widget.Props.Subtitle || "" }).addStyleClass("zsacSmall"));
      }, { noModel: true });
    }
  });

  WidgetRegistry.register("filter", {
    name: "Input control", icon: "sap-icon://filter", group: "Controls", size: { w: 3, h: 2 },
    defaults: { Binding: emptyBinding(), Props: { Dimension: "" } },
    builder: [
      { key: "Title", label: "Title", kind: "text" },
      { key: "Binding.ModelId", label: "Model", kind: "model" },
      { key: "Props.Dimension", label: "Dimension", kind: "dimension", plain: true }
    ],
    create(widget, ctx) {
      const box = new MultiComboBox({ width: "100%", placeholder: "All" });
      box.attachSelectionFinish(() => {
        ctx.bus.fire("filter", { dim: widget.Props.Dimension, members: box.getSelectedKeys() });
      });
      const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content: box });
      return wire(card, widget, async () => {
        const dim = widget.Props.Dimension;
        if (!dim) { card.setMessage("Choose a dimension in the builder panel"); return; }
        const model = await ctx.provider.getModel(widget.Binding.ModelId);
        const d = model.Dimensions.find((x) => x.DimId === dim);
        const members = d && d.Members && d.Members.length ? d.Members : (await ctx.provider.query({ ModelId: model.ModelId, Rows: [dim], Filters: {} })).rowKeys.map((k) => ({ Id: k[0], Text: k[0] }));
        box.destroyItems();
        members.forEach((m) => box.addItem(new Item({ key: m.Id, text: m.Id + (m.Text && m.Text !== m.Id ? " – " + m.Text : "") })));
        box.setSelectedKeys(((ctx.filters || {})[dim]) || []);
      });
    }
  });

  WidgetRegistry.register("text", {
    name: "Text", icon: "sap-icon://text", group: "Controls", size: { w: 12, h: 1 },
    defaults: { Binding: emptyBinding(), Props: { Text: "Text" } },
    builder: [
      { key: "Title", label: "Heading", kind: "text" },
      { key: "Props.Text", label: "Text", kind: "textarea" }
    ],
    create(widget) {
      const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, bare: true, content: new Text({ text: (widget.Title ? widget.Title + ". " : "") + (widget.Props.Text || "") }) });
      card.addStyleClass("zsacTextWidget");
      card.refresh = () => Promise.resolve();
      return card;
    }
  });

  /**
   * Smart defaults for a freshly dropped widget: model of the story, first measure, first dimension(s),
   * the first public version. Placeholders $FIRST_DIM / $SECOND_DIM in the registry defaults are resolved here.
   */
  function autoBind(widget, model, versions) {
    const b = widget.Binding;
    const dims = (model && model.Dimensions) || [];
    const pick = (id) => (id === "$FIRST_DIM" ? (dims[0] && dims[0].DimId) : id === "$SECOND_DIM" ? ((dims[1] || dims[0]) && (dims[1] || dims[0]).DimId) : id);
    b.Rows = (b.Rows || []).map(pick).filter(Boolean);
    b.Columns = (b.Columns || []).map(pick).filter(Boolean);
    if (model) {
      b.ModelId = model.ModelId;
      if (!b.Measure && ["kpi", "table", "planning.table"].concat(WidgetRegistry.types().filter((t) => t.indexOf("chart.") === 0)).indexOf(widget.Type) >= 0) {
        b.Measure = model.Measures[0] ? model.Measures[0].MeasureId : "";
      }
      if (widget.Props && "Dimension" in widget.Props && !widget.Props.Dimension && dims[0]) { widget.Props.Dimension = dims[0].DimId; }
    }
    // a planning table starts on an unlocked budget version, everything else on the first public one
    const first = widget.Type === "planning.table"
      ? ((versions || []).find((v) => v.Category === "BUDGET" && !v.Locked) || (versions || []).find((v) => v.Category !== "PRIVATE" && !v.Locked))
      : (versions || []).find((v) => v.Category !== "PRIVATE");
    if (first && widget.Type !== "filter" && widget.Type !== "text" && widget.Type !== "dataaction.trigger" && widget.Type !== "multiaction.trigger" && !(b.Filters && b.Filters.VERSION) && !(b.Columns || []).includes("VERSION")) {
      b.Filters = Object.assign({}, b.Filters, { VERSION: [first.VersionId] });
    }
    return widget;
  }

  return { autoBind, runQuery };
});
