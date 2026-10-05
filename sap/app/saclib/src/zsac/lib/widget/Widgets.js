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
  "../core/ModelSchema"
], function (MultiComboBox, Text, Item, WidgetRegistry, FilterEngine, QueryEngine, SvgChart, WidgetCard, KpiTile, PivotTable, ChartData, ModelSchema) {
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
    return ctx.provider.query({ ModelId: b.ModelId, Rows: b.Rows || [], Columns: b.Columns || [], Filters: filters, Hierarchies: activeHierarchies(b) });
  }

  const noModel = (card, widget) => {
    if (widget.Binding && widget.Binding.ModelId) { return false; }
    card.setMessage("Choose a model in the builder panel");
    return true;
  };

  /** Wraps a loader into card.refresh with busy and error handling. */
  function wire(card, widget, load) {
    card.refresh = async function () {
      card.setBusy(true);
      try {
        if (noModel(card, widget)) { return; }
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
      if (!b.Measure && ["kpi", "table"].concat(WidgetRegistry.types().filter((t) => t.indexOf("chart.") === 0)).indexOf(widget.Type) >= 0) {
        b.Measure = model.Measures[0] ? model.Measures[0].MeasureId : "";
      }
      if (widget.Props && "Dimension" in widget.Props && !widget.Props.Dimension && dims[0]) { widget.Props.Dimension = dims[0].DimId; }
    }
    const first = (versions || []).find((v) => v.Category !== "PRIVATE");
    if (first && widget.Type !== "filter" && widget.Type !== "text" && !(b.Filters && b.Filters.VERSION) && !(b.Columns || []).includes("VERSION")) {
      b.Filters = Object.assign({}, b.Filters, { VERSION: [first.VersionId] });
    }
    return widget;
  }

  return { autoBind, runQuery };
});
