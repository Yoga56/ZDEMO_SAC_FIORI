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
  "../core/CalcMeasures",
  "../core/HierarchyEngine",
  "../core/Format",
  "../planning/PlanGrid",
  "../planning/LockEngine",
  "../planning/GridView",
  "../planning/PlanPublisher",
  "../planning/DataActionRun",
  "../core/VarianceEngine",
  "./VarianceView",
  "./VarianceDialog",
  "../core/GeoLocations",
  "../core/ValueTree",
  "../core/WebContent",
  "../core/ButtonAction",
  "../core/Feed",
  "../core/CommentThread",
  "./ValueTreeView",
  "../core/Compass",
  "./CompassView",
  "sap/ui/core/HTML",
  "sap/m/Link",
  "sap/m/VBox", "sap/m/Button", "sap/m/MessageBox", "sap/m/MessageToast",
  "sap/ui/core/Icon"
], function (MultiComboBox, Text, Item, WidgetRegistry, FilterEngine, QueryEngine, SvgChart, WidgetCard, KpiTile, PivotTable, ChartData, ModelSchema, CalcMeasures, HierarchyEngine, Format,
  PlanGrid, LockEngine, GridView, PlanPublisher, DataActionRun, VarianceEngine, VarianceView, VarianceDialog, GeoLocations, ValueTree, WebContent, ButtonAction, Feed, CommentThread, ValueTreeView, Compass, CompassView, HTML, Link, VBox, Button, MessageBox, MessageToast, Icon) {
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
      builder: queryBuilder(rowsLabel, colsLabel, maxRows).concat([{ key: "Props.Level", label: "Hierarchy level shown (1 = top)", kind: "number", min: 1 }])
        .concat(type === "chart.bar" ? [{ key: "Props.Stacked", label: "Stack the series", kind: "bool" }] : [])
        .concat(type === "chart.geomap" ? [{ key: "Props.Locations", label: "Own places, one per line: Name = latitude, longitude", kind: "textarea" }] : [])
        .concat(type === "chart.waterfall" ? [{ key: "Props.ShowTotal", label: "Show the total as the last bar", kind: "bool", default: true }] : []),
      create(widget, ctx) {
        const content = new SvgChart({ type });
        const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content });
        return wire(card, widget, async () => {
          const result = await runQuery(widget, ctx);
          const measure = (result.model.Measures || []).find((m) => m.MeasureId === widget.Binding.Measure);
          content.setData(ChartData.fromResult(type, result, measure && measure.Label, Object.keys(activeHierarchies(widget.Binding)).length ? Math.max(1, Number(widget.Props.Level) || 1) : 0, { stacked: !!widget.Props.Stacked, total: widget.Props.ShowTotal !== false, places: GeoLocations.parseList(widget.Props.Locations).places }));
        });
      }
    });
  }

  chart("chart.bar", "Bar chart", "sap-icon://vertical-bar-chart", { w: 6, h: 4 }, "Categories", "Series", 1);
  chart("chart.line", "Line chart", "sap-icon://line-chart", { w: 6, h: 4 }, "X axis", "Series", 1);
  chart("chart.donut", "Donut chart", "sap-icon://donut-chart", { w: 4, h: 4 }, "Slices", null, 1);
  chart("chart.funnel", "Funnel chart", "sap-icon://upstacked-chart", { w: 4, h: 4 }, "Stages", null, 1);
  chart("chart.waterfall", "Waterfall chart", "sap-icon://vertical-waterfall-chart", { w: 6, h: 4 }, "Steps", null, 1);
  chart("chart.heatmap", "Heatmap", "sap-icon://heatmap-chart", { w: 6, h: 4 }, "Rows", "Columns", 1);
  chart("chart.treemap", "Treemap", "sap-icon://grid", { w: 6, h: 4 }, "Groups (or the tiles)", "Tiles inside a group", 1);
  chart("chart.geomap", "Geo map", "sap-icon://map-2", { w: 6, h: 4 }, "Places", null, 1);
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
      // "Why?" opens the variance explainer for the comparison the tile shows: this tile's version against the version it is compared with
      const why = new Link({ text: "Why?", visible: false, tooltip: "Explain the difference to the comparison version", press: () => {
        const b = widget.Binding;
        const filters = FilterEngine.merge(ctx.filters || {}, b.Filters || {});
        const own = (filters.VERSION && filters.VERSION.length) ? filters.VERSION : null;
        const common = Object.assign({}, filters); delete common.VERSION; delete common.MEASURE;
        VarianceDialog.open({ provider: ctx.provider, modelId: b.ModelId, measure: b.Measure, base: { VERSION: [widget.Props.CompareVersion] },
          compare: own ? { VERSION: own } : {}, filters: common, lowerIsBetter: !!widget.Props.LowerIsBetter });
      } }).addStyleClass("zsacKpiWhy");
      const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content: new VBox({ items: [tile, why] }) });
      return wire(card, widget, async () => {
        why.setVisible(!!widget.Props.CompareVersion);
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

  WidgetRegistry.register("variance", {
    name: "Variance explainer", icon: "sap-icon://compare", group: "Indicators", size: { w: 6, h: 4 },
    defaults: { Binding: emptyBinding(), Props: { CompareVersion: "", BaseVersion: "", LowerIsBetter: false } },
    builder: baseBuilder.concat([
      { key: "Binding.Measure", label: "Measure", kind: "measure" },
      { key: "Binding.Filters", label: "Filters", kind: "filters" },
      { key: "Props.CompareVersion", label: "Explain version", kind: "version" },
      { key: "Props.BaseVersion", label: "Against version", kind: "version" },
      { key: "Props.LowerIsBetter", label: "Lower is better", kind: "bool" }
    ]),
    create(widget, ctx) {
      const holder = new HTML({ content: "<div></div>" });
      const open = () => {
        const b = widget.Binding;
        const filters = FilterEngine.merge(ctx.filters || {}, b.Filters || {});
        const common = Object.assign({}, filters); delete common.VERSION; delete common.MEASURE;
        VarianceDialog.open({ provider: ctx.provider, modelId: b.ModelId, measure: b.Measure, base: { VERSION: [widget.Props.BaseVersion] }, compare: { VERSION: [widget.Props.CompareVersion] },
          filters: common, lowerIsBetter: !!widget.Props.LowerIsBetter });
      };
      const box = new VBox({ width: "100%", items: [holder, new Link({ text: "Explore the difference", press: open }).addStyleClass("sapUiTinyMarginTop")] });
      const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content: box });
      return wire(card, widget, async () => {
        const b = widget.Binding;
        if (!b.Measure || !widget.Props.CompareVersion || !widget.Props.BaseVersion) { holder.setContent('<div class="zsacVMsg">Choose a measure and the two versions in the builder panel.</div>'); return; }
        const model = await ctx.provider.getModel(b.ModelId);
        const versions = await ctx.provider.listVersions(b.ModelId);
        const filters = FilterEngine.merge(ctx.filters || {}, b.Filters || {});
        const common = Object.assign({}, filters); delete common.VERSION; delete common.MEASURE;
        const side = { base: { VERSION: [widget.Props.BaseVersion] }, compare: { VERSION: [widget.Props.CompareVersion] } };
        const need = QueryEngine.expandFilters(model, VarianceEngine.loadFilter(Object.assign({ filters: common }, side)));
        const facts = ctx.plan && ctx.plan.overlay ? ctx.plan.overlay(await ctx.provider.readFacts(b.ModelId, need)) : await ctx.provider.readFacts(b.ModelId, need);
        const name = (id) => ((versions.find((v) => v.VersionId === id) || {}).Name) || id;
        const labels = { base: name(widget.Props.BaseVersion), compare: name(widget.Props.CompareVersion) };
        const aligned = VarianceEngine.commonPeriods(model, facts, Object.assign({ measure: b.Measure, filters: common }, side));
        const r = VarianceEngine.explain(model, facts, Object.assign({ measure: b.Measure, filters: aligned.periods.length ? Object.assign({}, common, { PERIOD: aligned.periods }) : common,
          lowerIsBetter: !!widget.Props.LowerIsBetter, labels }, side));
        const measure = (model.Measures || []).find((m) => m.MeasureId === b.Measure);
        holder.setContent("<div>" + (aligned.note ? '<div class="zsacVMsg">' + aligned.note + "</div>" : "") + VarianceView.summaryHtml(r, labels, measure && measure.UnitType !== "None" ? measure.Unit : "") + (r.dims[0] ? VarianceView.barsHtml(Object.assign({}, r.dims[0], { rows: r.dims[0].rows.slice(0, 5) }), 5).replace(/<div class="zsacVRow" data-m=/g, '<div class="zsacVRow" data-x=') : "") + "</div>");
      });
    }
  });

  /**
   * The tree of a value tree or Compass widget with the data of its leaves: one aggregate per leaf, with the leaf's own filters and
   * measure on top of the story and widget filters. compare = the same leaves read for the compare version (value tree only).
   */
  async function loadTree(widget, ctx) {
    const b = widget.Binding;
    const parsed = ValueTree.parse(widget.Props.Tree);
    if (!parsed.tree) { return { tree: null, errors: parsed.errors }; }
    const model = await ctx.provider.getModel(b.ModelId);
    const versions = widget.Props.CompareVersion ? await ctx.provider.listVersions(b.ModelId) : [];
    const leaves = ValueTree.leaves(parsed.tree);
    const problems = parsed.errors.slice();
    leaves.forEach((l) => {
      if (!(l.measure || b.Measure)) { problems.push("'" + l.label + "' needs a measure (measure=ID) or a measure in the builder panel"); }
      Object.keys(l.filters).forEach((d) => { if (d !== "PERIOD" && d !== "VERSION" && !(model.Dimensions || []).some((x) => x.DimId === d)) { problems.push("'" + l.label + "': " + d + " is not a dimension of the model"); } });
    });
    const read = async (version) => {
      const out = {};
      await Promise.all(leaves.map(async (l) => {
        if (!(l.measure || b.Measure)) { return; }
        const r = await runQuery(widget, ctx, (f) => {
          Object.keys(l.filters).forEach((d) => { f[d] = l.filters[d]; });
          f.MEASURE = [l.measure || b.Measure];
          if (version) { f.VERSION = [version]; }
        });
        out[l.id] = r.grand;
      }));
      return out;
    };
    const values = await read(null);
    const compare = widget.Props.CompareVersion ? await read(widget.Props.CompareVersion) : null;
    const ver = versions.find((v) => v.VersionId === widget.Props.CompareVersion);
    // the unit of the numbers: the one unit all the leaves share (a leaf takes its own measure or the widget's). A product or ratio node
    // changes what the number means, so then no unit is shown. A scaled leaf (scale=1000) is in another unit, so it is left out too.
    const unitOf = (id) => {
      const m = (model.Measures || []).find((x) => x.MeasureId === id);
      if (m) { return m.UnitType === "None" ? "" : (m.Unit || ""); }
      const c = CalcMeasures.find(model, id);
      return c ? (c.Percent ? "%" : c.Unit || "") : "";
    };
    const units = new Set(leaves.map((l) => (l.scale && l.scale !== 1 ? "" : unitOf(l.measure || b.Measure))));
    let mixes = false;
    (function walk(n) { if (n.op === "product" || n.op === "ratio") { mixes = true; } n.children.forEach(walk); })(parsed.tree);
    const unit = !mixes && units.size === 1 ? Array.from(units)[0] : "";
    return { tree: parsed.tree, values, compare, errors: problems, compareLabel: ver ? ver.Name || ver.VersionId : widget.Props.CompareVersion, unit, model };
  }

  WidgetRegistry.register("valuetree", {
    name: "Value driver tree", icon: "sap-icon://tree", group: "Indicators", size: { w: 12, h: 8 },
    defaults: { Binding: emptyBinding(), Props: { Tree: "", CompareVersion: "", LowerIsBetter: false, Simulate: true } },
    builder: baseBuilder.concat([
      { key: "Binding.Measure", label: "Measure (for nodes that name none)", kind: "measure" },
      { key: "Binding.Filters", label: "Filters", kind: "filters" },
      { key: "Props.Tree", label: "Tree: each node has a name and an operator; data nodes read a measure and members", kind: "valuetree" },
      { key: "Props.CompareVersion", label: "Compare with version", kind: "version" },
      { key: "Props.LowerIsBetter", label: "Lower is better (nodes can say good=up or good=down)", kind: "bool" },
      { key: "Props.Simulate", label: "Allow simulation (change a driver, see the effect)", kind: "bool", default: true }
    ]),
    create(widget, ctx) {
      const holder = new HTML({ content: "<div></div>" });
      let state = null; // { tree, values, compare, labels, unit }
      const overrides = {};
      let view = null;   // the pan and zoom of the tree: { x, y, z }; kept while the numbers are redrawn
      const draw = () => {
        if (!state) { return; }
        const live = Object.keys(overrides).reduce((o, k) => { if (overrides[k].pct !== "" && overrides[k].pct !== undefined) { o[k] = overrides[k]; } return o; }, {});
        const tree = ValueTree.annotate(state.tree, state.values, { compare: state.compare, overrides: live, lowerIsBetter: !!widget.Props.LowerIsBetter });
        holder.setContent('<div class="zsacVTView">' + (state.errors.length ? '<div class="zsacVMsg">' + state.errors.map((e) => Format.esc(e)).join("<br>") + "</div>" : "")
          + '<div class="zsacVTBar"><span>' + (Object.keys(live).length ? '<a class="zsacVTReset" href="#">Reset simulation</a>' : (widget.Props.Simulate !== false ? '<span class="zsacVMsg">Type a % under a driver to simulate its effect on the top.</span>' : "")) + "</span>"
          + '<span class="zsacVTTools"><button type="button" data-z="out" title="Zoom out">\u2212</button><span class="zsacVTZoom">100%</span><button type="button" data-z="in" title="Zoom in">+</button>'
          + '<button type="button" data-z="fit" title="Fit the whole tree and centre it">Fit</button></span></div>'
          + '<div class="zsacVTPane" title="Drag to move the tree, Ctrl and the wheel to zoom">' + ValueTreeView.html(tree, { hasCompare: !!state.compare, compareLabel: state.labels.compare, simulate: widget.Props.Simulate !== false, overrides: live, unit: state.unit }) + "</div></div>");
        bind(); // setContent updates a rendered control in place, without an afterRendering
      };
      const parts = () => { const el = holder.getDomRef(); const pane = el && el.querySelector(".zsacVTPane"); const inner = pane && pane.querySelector(".zsacVT"); return pane && inner ? { el, pane, inner } : null; };
      const apply = () => {
        const p = parts();
        if (!p || !view) { return; }
        p.inner.style.transform = "translate(" + Math.round(view.x) + "px," + Math.round(view.y) + "px) scale(" + view.z + ")";
        const label = p.el.querySelector(".zsacVTZoom");
        if (label) { label.textContent = Math.round(view.z * 100) + "%"; }
      };
      /** The whole tree in view and in the middle of the pane (never bigger than its natural size). */
      const fit = () => {
        const p = parts();
        if (!p) { return; }
        p.pane.style.minHeight = Math.min(p.inner.offsetHeight + 16, 640) + "px";
        const pw = p.pane.clientWidth; const ph = p.pane.clientHeight;
        const z = Math.max(0.3, Math.min(1, (pw - 16) / p.inner.offsetWidth, (ph - 16) / p.inner.offsetHeight));
        view = { z, x: (pw - p.inner.offsetWidth * z) / 2, y: Math.max(8, (ph - p.inner.offsetHeight * z) / 2) };
        apply();
      };
      const zoomBy = (factor, cx, cy) => {
        const p = parts();
        if (!p || !view) { return; }
        const z = Math.max(0.3, Math.min(2, view.z * factor));
        const px = cx === undefined ? p.pane.clientWidth / 2 : cx; const py = cy === undefined ? p.pane.clientHeight / 2 : cy;
        view = { z, x: px - (px - view.x) * (z / view.z), y: py - (py - view.y) * (z / view.z) };
        apply();
      };
      const bind = () => {
        const el = holder.getDomRef();
        if (!el) { return; }
        const first = parts();
        if (first && first.pane._zsacBound) { return; }          // the first render can reach this twice (after draw and after rendering)
        if (first) { first.pane._zsacBound = true; }
        el.querySelectorAll(".zsacVTPct").forEach((inp) => inp.addEventListener("change", () => {
          const id = inp.getAttribute("data-n");
          if (inp.value === "") { delete overrides[id]; } else { overrides[id] = { pct: Number(inp.value) }; }
          draw();
        }));
        const reset = el.querySelector(".zsacVTReset");
        if (reset) { reset.addEventListener("click", (e) => { e.preventDefault(); Object.keys(overrides).forEach((k) => { delete overrides[k]; }); draw(); }); }
        const p = parts();
        if (!p) { return; }
        if (view) { p.pane.style.minHeight = Math.min(p.inner.offsetHeight * view.z + 16, 640) + "px"; apply(); } else { fit(); }
        el.querySelectorAll("[data-z]").forEach((b) => b.addEventListener("click", () => { const k = b.getAttribute("data-z"); if (k === "fit") { fit(); } else { zoomBy(k === "in" ? 1.2 : 1 / 1.2); } }));
        p.pane.addEventListener("wheel", (e) => {
          if (!e.ctrlKey && !e.metaKey) { return; }
          e.preventDefault();
          const r = p.pane.getBoundingClientRect();
          zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
        }, { passive: false });
        // drag the tree to move it (not when the pointer is on an input or a link)
        p.pane.addEventListener("pointerdown", (e) => {
          if (e.button !== 0 || e.target.closest("input, a, button, select")) { return; }
          const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
          p.pane.classList.add("zsacVTGrab");
          try { p.pane.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer cannot be captured */ }
          const move = (ev) => { view.x = start.vx + ev.clientX - start.x; view.y = start.vy + ev.clientY - start.y; apply(); };
          const up = () => { p.pane.classList.remove("zsacVTGrab"); p.pane.removeEventListener("pointermove", move); p.pane.removeEventListener("pointerup", up); p.pane.removeEventListener("pointercancel", up); };
          p.pane.addEventListener("pointermove", move); p.pane.addEventListener("pointerup", up); p.pane.addEventListener("pointercancel", up);
          e.preventDefault();
        });
      };
      holder.addEventDelegate({ onAfterRendering: bind });
      const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content: holder });
      return wire(card, widget, async () => {
        const loaded = await loadTree(widget, ctx);
        if (!loaded.tree) { holder.setContent('<div class="zsacVMsg">' + Format.esc(loaded.errors[0] || "Write the tree in the builder panel.") + "</div>"); state = null; return; }
        state = { tree: loaded.tree, values: loaded.values, compare: loaded.compare, errors: loaded.errors, labels: { compare: loaded.compareLabel }, unit: loaded.unit };
        draw();
      });
    }
  });

  WidgetRegistry.register("compass", {
    name: "Compass simulation", icon: "sap-icon://simulate", group: "Indicators", size: { w: 12, h: 9 },
    defaults: { Binding: emptyBinding(), Props: { Tree: "", Mode: "medium", Pessimistic: 5, Optimistic: 5, LowerIsBetter: false } },
    builder: baseBuilder.concat([
      { key: "Binding.Measure", label: "Measure (for nodes that name none)", kind: "measure" },
      { key: "Binding.Filters", label: "Filters (the baseline is read for these, choose one version)", kind: "filters" },
      { key: "Props.Tree", label: "Target and drivers: the target on top, its drivers below; give a driver's uncertainty under More", kind: "drivertree" },
      { key: "Props.Mode", label: "Precision", kind: "select", options: [["preview", "Preview (1,000 calculations)"], ["medium", "Medium (10,000)"], ["high", "High (100,000)"]] },
      { key: "Props.Pessimistic", label: "Pessimistic case: share of the results (%)", kind: "number", min: 0, default: 5 },
      { key: "Props.Optimistic", label: "Optimistic case: share of the results (%)", kind: "number", min: 0, default: 5 },
      { key: "Props.LowerIsBetter", label: "Lower is better (the pessimistic case is then the high end)", kind: "bool" }
    ]),
    create(widget, ctx) {
      const holder = new HTML({ content: "<div></div>" });
      let loaded = null;
      let scenarios = [{ name: "Scenario 1", settings: {}, result: null }];
      let current = 0; let compareWith = -1; let mode = widget.Props.Mode || "medium"; let threshold = ""; let busy = false;
      const cur = () => scenarios[current];
      const unit = () => (loaded && loaded.unit) || "";
      let lastWidth = 0;
      const draw = () => {
        if (!loaded) { return; }
        const sc = cur();
        const results = [{ name: sc.name, result: sc.result }].concat(compareWith >= 0 && compareWith !== current && scenarios[compareWith] && scenarios[compareWith].result ? [{ name: scenarios[compareWith].name, result: scenarios[compareWith].result }] : []);
        const opt = (v, t, sel) => '<option value="' + v + '"' + (sel ? " selected" : "") + ">" + Format.esc(t) + "</option>";
        const others = scenarios.map((s, i) => ({ s, i })).filter((x) => x.i !== current && x.s.result);
        const dom = holder.getDomRef();
        const width = dom ? dom.clientWidth : 0;
        lastWidth = width;
        const wide = width >= 760;
        const chartW = Math.max(300, Math.min(900, (wide ? width - 17 * 16 - 16 : width) - 36));
        const drivers = Compass.drivers(loaded.tree, loaded.values, sc.settings);
        const uncertain = drivers.filter((d) => d.min !== null && d.max !== null && (sc.settings[d.id] ? sc.settings[d.id].active !== false : true)).length;
        let h = '<div class="zsacCp">' + (loaded.errors.length ? '<div class="zsacVMsg">' + loaded.errors.map((e) => Format.esc(e)).join("<br>") + "</div>" : "")
          + '<div class="zsacCpBar"><div class="zsacCpGroup"><select data-a="scenario" title="Scenario">' + scenarios.map((s, i) => opt(i, s.name, i === current)).join("") + "</select>"
          + '<button type="button" data-a="new" title="A new scenario starts from the settings of this one">+ New</button>'
          + (scenarios.length > 1 ? '<button type="button" data-a="delete" title="Delete this scenario">Delete</button>' : "") + "</div>"
          + '<div class="zsacCpGroup">' + (others.length ? '<label>Compare <select data-a="compare">' + opt(-1, "(none)", compareWith < 0) + others.map((x) => opt(x.i, x.s.name, x.i === compareWith)).join("") + "</select></label>" : "")
          + '<select data-a="mode" title="Precision: how many times the simulation draws random values for the drivers and works out the target. More runs give steadier percentages and take longer.">' + [["preview", "Preview \u00b7 1,000 runs"], ["medium", "Medium \u00b7 10,000 runs"], ["high", "High \u00b7 100,000 runs"]].map((m) => opt(m[0], m[1], m[0] === mode)).join("") + "</select>"
          + '<button type="button" class="zsacCpRun" data-a="run"' + (busy ? " disabled" : "") + ">" + (busy ? "Running..." : "\u25B6 Run simulation") + "</button></div></div>"
          + '<details class="zsacCpDet"' + (sc.result ? "" : " open") + '><summary>Drivers <span class="zsacCpSub">' + drivers.length + " \u00b7 " + uncertain + " with a range</span></summary>"
          + CompassView.driversHtml(drivers, sc.settings, unit()) + "</details>";
        if (sc.result) {
          const thr = '<div class="zsacCpKpi zsacCpKpiIn" title="Type a target (in the units of the numbers, for example 100000). A new tile then shows the share of the simulated results that reach it or more."><span class="zsacVCap">Chance that ' + Format.esc(loaded.tree.label) + ' reaches ...</span><span class="zsacCpKpiV zsacCpTarget"><input type="number" step="any" data-a="threshold" placeholder="a number" value="' + Format.esc(threshold) + '"><span class="zsacCpOrMore">or more</span></span></div>';
          h += '<div class="zsacCpResult">' + CompassView.statsHtml(sc.result, unit(), threshold, thr)
            + '<div class="zsacCpMain"><div class="zsacCpChartBox">' + CompassView.chartSvg(results, { w: chartW, h: 230 }) + CompassView.casesHtml(sc.result, unit()) + "</div>"
            + '<div class="zsacCpSide">' + CompassView.influenceHtml(sc.result) + "</div></div>"
            + '<div class="zsacVCap zsacCpFoot">' + sc.result.n.toLocaleString("en") + " calculations, seed " + sc.result.seed + ". Drivers without a range stay at their booked value.</div></div>";
        } else { h += '<div class="zsacVMsg">Enter a minimum and a maximum for the drivers you are unsure about, then run the simulation.</div>'; }
        holder.setContent(h + "</div>");
        bind();
      };
      const bind = () => {
        const el = holder.getDomRef();
        if (!el) { return; }
        const sc = cur();
        el.querySelectorAll("[data-d]").forEach((inp) => inp.addEventListener("change", () => {
          const id = inp.getAttribute("data-d"); const f = inp.getAttribute("data-f");
          const s = sc.settings[id] = sc.settings[id] || {};
          const d = Compass.drivers(loaded.tree, loaded.values, {}).find((x) => x.id === id);
          if (f === "active") { s.active = inp.checked; } else if (f === "dist") { s.dist = inp.value; }
          else if (f === "pct") {
            if (inp.value !== "" && d && d.baseline !== null) { const delta = Math.abs(d.baseline) * Number(inp.value) / 100; s.min = d.baseline - delta; s.max = d.baseline + delta; draw(); }
          } else { s[f] = inp.value === "" ? "" : Number(inp.value); }
          sc.result = null;
          if (f === "min" || f === "max") { const row = inp.closest(".zsacCpDRow"); const lo = row.querySelector('[data-f="min"]').value; const hi = row.querySelector('[data-f="max"]').value; row.classList.toggle("zsacCpBad", lo !== "" && hi !== "" && Number(lo) > Number(hi)); }
          if (f === "active") { inp.closest(".zsacCpDRow").classList.toggle("zsacCpOff", !inp.checked); }
        }));
        const act = (a) => el.querySelector('[data-a="' + a + '"]');
        const on = (a, ev, fn) => { const n = act(a); if (n) { n.addEventListener(ev, fn); } };
        on("scenario", "change", (e) => { current = Number(e.target.value); compareWith = -1; draw(); });
        on("new", "click", () => { scenarios.push({ name: "Scenario " + (scenarios.length + 1), settings: JSON.parse(JSON.stringify(sc.settings)), result: null }); current = scenarios.length - 1; draw(); });
        on("delete", "click", () => { scenarios.splice(current, 1); current = Math.max(0, current - 1); compareWith = -1; draw(); });
        on("mode", "change", (e) => { mode = e.target.value; });
        on("compare", "change", (e) => { compareWith = Number(e.target.value); draw(); });
        on("threshold", "change", (e) => { threshold = e.target.value; draw(); });
        on("run", "click", () => {
          busy = true; draw();
          setTimeout(() => { // let the button show "Running" before the loop blocks the page
            try {
              sc.result = Compass.run(loaded.tree, loaded.values, { drivers: sc.settings, mode, seed: Number(widget.Props.Seed) || undefined, pessimistic: widget.Props.Pessimistic === undefined ? 5 : Number(widget.Props.Pessimistic), optimistic: widget.Props.Optimistic === undefined ? 5 : Number(widget.Props.Optimistic), lowerIsBetter: !!widget.Props.LowerIsBetter });
            } catch (err) { MessageToast.show(err.message || String(err)); }
            busy = false; draw();
          }, 20);
        });
      };
      holder.addEventDelegate({ onAfterRendering: bind });
      // the chart is drawn at the width it has, so its text stays small; redraw when the widget is resized (not while someone types in it)
      let sizeTimer = null;
      const watch = () => {
        const dom = holder.getDomRef();
        if (!dom || dom._zsacWatched || typeof ResizeObserver === "undefined") { return; }
        dom._zsacWatched = true;
        new ResizeObserver(() => {
          clearTimeout(sizeTimer);
          sizeTimer = setTimeout(() => {
            const el = holder.getDomRef();
            if (!el || !loaded || !cur().result || busy || Math.abs(el.clientWidth - lastWidth) < 40 || el.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) { return; }
            draw();
          }, 250);
        }).observe(dom);
      };
      holder.addEventDelegate({ onAfterRendering: watch });
      const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content: holder });
      return wire(card, widget, async () => {
        const l = await loadTree(widget, ctx);
        if (!l.tree) { holder.setContent('<div class="zsacVMsg">' + Format.esc(l.errors[0] || "Write the target and its drivers in the builder panel.") + "</div>"); loaded = null; return; }
        loaded = l;
        scenarios.forEach((s) => { s.result = null; }); // the baseline may have changed
        draw();
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
      { key: "Props.ShowTotals", label: "Show totals (flat tables)", kind: "bool", default: true },
      { key: "Props.SuppressZero", label: "Hide rows with only zeros", kind: "bool", default: false },
      { key: "Props.Swap", label: "Swap rows and columns", kind: "bool", default: false },
      { key: "Props.Scale", label: "Scale (1, 1000, 1000000)", kind: "number", default: 1 },
      { key: "Props.Decimals", label: "Decimals (empty: from the measure)", kind: "number" },
      { key: "Props.VarianceVs", label: "Variance to version (id, empty: none)", kind: "text" },
      { key: "Props.Calcs", label: "Calculations, for example Growth % = BUD/ACT-1", kind: "text" },
      { key: "Props.Thresholds", label: "Thresholds, for example < 0 : bad; >= 100 : good", kind: "text" }
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
        const lock = { compiled: LockEngine.compile(model), user: await ctx.provider.currentUser() };
        const p = widget.Props;
        const view = Object.assign({ suppressZero: !!p.SuppressZero, swap: !!p.Swap, scale: Number(p.Scale) || 1, decimals: p.Decimals === undefined || p.Decimals === "" ? -1 : p.Decimals,
          variance: p.VarianceVs ? { vs: p.VarianceVs, mode: "ABS" } : null, thresholds: GridView.parseThresholds(p.Thresholds), calcs: GridView.parseCalcs(p.Calcs) }, p.View);
        grid.setContext({ model, facts, versions, plan: ctx.plan, comments, lock, view,
          readReference: (versionId, measureId) => ctx.provider.readFacts(b.ModelId, QueryEngine.expandFilters(model, Object.assign({}, filters, { VERSION: [versionId] }, measureId ? { MEASURE: [measureId] } : {}))),
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

  // ---- content widgets: they show what the author put in, not data of a model
  const THEME_COLORS = [["blue", "Blue"], ["teal", "Teal"], ["green", "Green"], ["orange", "Orange"], ["red", "Red"], ["grey", "Grey"], ["white", "White"]];
  const colorSelect = (key, label) => ({ key, label, kind: "select", options: THEME_COLORS });
  const staticCard = (widget, content, bare) => {
    const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, bare: !!bare, content });
    card.refresh = () => Promise.resolve();
    return card;
  };

  WidgetRegistry.register("image", {
    name: "Image", icon: "sap-icon://picture", group: "Content", size: { w: 4, h: 3 }, static: true,
    defaults: { Binding: emptyBinding(), Props: { Url: "", Alt: "", Fit: "contain" } },
    builder: [
      { key: "Title", label: "Title", kind: "text" },
      { key: "Props.Url", label: "Address of the picture (https://... or a path)", kind: "text" },
      { key: "Props.Alt", label: "Description for screen readers", kind: "text" },
      { key: "Props.Fit", label: "Fit", kind: "select", options: [["contain", "Whole picture"], ["cover", "Fill the box"]] }
    ],
    create(widget) {
      const c = WebContent.check(widget.Props.Url, "image");
      const html = c.ok
        ? '<div class="zsacImage"><img src="' + Format.esc(c.url) + '" alt="' + Format.esc(widget.Props.Alt || widget.Title || "") + '" style="object-fit:' + (widget.Props.Fit === "cover" ? "cover" : "contain") + '"></div>'
        : '<div class="zsacVMsg">' + Format.esc(widget.Props.Url ? c.error : "Enter the address of a picture in the builder panel.") + "</div>";
      return staticCard(widget, new HTML({ content: html }));
    }
  });

  WidgetRegistry.register("webpage", {
    name: "Web page", icon: "sap-icon://internet-browser", group: "Content", size: { w: 6, h: 5 }, static: true,
    defaults: { Binding: emptyBinding(), Props: { Url: "" } },
    builder: [
      { key: "Title", label: "Title", kind: "text" },
      { key: "Props.Url", label: "Address of the page (https://...)", kind: "text" }
    ],
    create(widget) {
      const c = WebContent.check(widget.Props.Url, "page");
      const html = c.ok
        ? '<div class="zsacWebPage"><iframe src="' + Format.esc(c.url) + '" title="' + Format.esc(widget.Title || "Web page") + '" sandbox="' + WebContent.sandbox(c.url, window.location.origin) + '" referrerpolicy="no-referrer" loading="lazy"></iframe></div>'
        : '<div class="zsacVMsg">' + Format.esc(widget.Props.Url ? c.error : "Enter the address of a page in the builder panel. Some sites do not allow being shown inside another page.") + "</div>";
      return staticCard(widget, new HTML({ content: html }));
    }
  });

  WidgetRegistry.register("shape", {
    name: "Shape", icon: "sap-icon://border", group: "Content", size: { w: 4, h: 1 }, static: true,
    defaults: { Binding: emptyBinding(), Props: { Kind: "rectangle", Color: "blue" } },
    builder: [
      { key: "Props.Kind", label: "Shape", kind: "select", options: [["rectangle", "Rectangle"], ["rounded", "Rounded rectangle"], ["line", "Line"], ["circle", "Circle"]] },
      colorSelect("Props.Color", "Colour")
    ],
    create(widget) {
      const kind = ["rectangle", "rounded", "line", "circle"].indexOf(widget.Props.Kind) >= 0 ? widget.Props.Kind : "rectangle";
      return staticCard(widget, new HTML({ content: '<div class="zsacShape zsacShape-' + kind + " zsacColor-" + Format.esc(widget.Props.Color || "blue") + '"></div>' }), true);
    }
  });

  WidgetRegistry.register("header", {
    name: "Header", icon: "sap-icon://header", group: "Content", size: { w: 12, h: 2 }, static: true,
    defaults: { Binding: emptyBinding(), Props: { Text: "Heading", Subtitle: "", Color: "blue" } },
    builder: [
      { key: "Props.Text", label: "Heading", kind: "text" },
      { key: "Props.Subtitle", label: "Subtitle", kind: "text" },
      colorSelect("Props.Color", "Colour")
    ],
    create(widget) {
      const html = '<div class="zsacHeader zsacColor-' + Format.esc(widget.Props.Color || "blue") + '"><div class="zsacHeaderText">' + Format.esc(widget.Props.Text || "")
        + '</div>' + (widget.Props.Subtitle ? '<div class="zsacHeaderSub">' + Format.esc(widget.Props.Subtitle) + "</div>" : "") + "</div>";
      return staticCard(widget, new HTML({ content: html }), true);
    }
  });

  // ---- button, symbol: a story can move around and open things
  const actionFields = [
    { key: "Props.Action", label: "When pressed", kind: "select", options: ButtonAction.KINDS },
    { key: "Props.Page", label: "Page number (for: go to a page of the story)", kind: "number", min: 1 },
    { key: "Props.Url", label: "Web address (for: open a web address)", kind: "text" },
    { key: "Props.Route", label: "Page of the app (for: go to a page of the app), e.g. stories/STORY_SALES", kind: "text" }
  ];
  function runAction(props, ctx) {
    if (ctx.isEditable && ctx.isEditable()) { MessageToast.show("Buttons work when the story is shown, not while it is edited"); return; }
    const r = ButtonAction.resolve(props, ctx.story);
    if (!r.ok) { MessageToast.show(r.error); return; }
    if (r.kind === "page") { ctx.bus.fire("goto-page", { page: r.page }); }
    else if (r.kind === "url") { window.open(r.url, "_blank", "noopener,noreferrer"); }
    else if (r.kind === "app") { window.location.hash = r.hash; }
    else if (r.kind === "refresh") { ctx.bus.fire("refresh-all"); }
  }

  WidgetRegistry.register("button", {
    name: "Button", icon: "sap-icon://cursor-arrow", group: "Controls", size: { w: 3, h: 1 }, static: true,
    defaults: { Binding: emptyBinding(), Props: { Text: "Button", Icon: "", ButtonType: "Emphasized", Action: "none", Page: 1, Url: "", Route: "" } },
    builder: [
      { key: "Props.Text", label: "Text", kind: "text" },
      { key: "Props.Icon", label: "Icon, e.g. sap-icon://home (optional)", kind: "text" },
      { key: "Props.ButtonType", label: "Look", kind: "select", options: [["Emphasized", "Emphasized"], ["Default", "Default"], ["Transparent", "Transparent"], ["Accept", "Positive"], ["Reject", "Negative"]] }
    ].concat(actionFields),
    create(widget, ctx) {
      const type = ["Emphasized", "Default", "Transparent", "Accept", "Reject"].indexOf(widget.Props.ButtonType) >= 0 ? widget.Props.ButtonType : "Default";
      const btn = new Button({ text: widget.Props.Text || "", type, width: "100%", icon: ButtonAction.isIcon(widget.Props.Icon) ? widget.Props.Icon : "", press: () => runAction(widget.Props, ctx) });
      return staticCard(widget, btn, true);
    }
  });

  WidgetRegistry.register("symbol", {
    name: "Symbol", icon: "sap-icon://favorite", group: "Content", size: { w: 2, h: 2 }, static: true,
    defaults: { Binding: emptyBinding(), Props: { Icon: "sap-icon://home", Size: "medium", Color: "blue", Label: "", Action: "none", Page: 1, Url: "", Route: "" } },
    builder: [
      { key: "Props.Icon", label: "Icon, e.g. sap-icon://home (the SAP icon names)", kind: "text" },
      { key: "Props.Size", label: "Size", kind: "select", options: [["small", "Small"], ["medium", "Medium"], ["large", "Large"], ["huge", "Huge"]] },
      colorSelect("Props.Color", "Colour"),
      { key: "Props.Label", label: "Text under the symbol", kind: "text" }
    ].concat(actionFields),
    create(widget, ctx) {
      const size = { small: "1.5rem", medium: "2.5rem", large: "4rem", huge: "6rem" }[widget.Props.Size] || "2.5rem";
      const clickable = (widget.Props.Action || "none") !== "none";
      const icon = new Icon({ src: ButtonAction.isIcon(widget.Props.Icon) ? widget.Props.Icon : "sap-icon://question-mark", size, useIconTooltip: false, decorative: !clickable, tooltip: widget.Props.Label || "" }).addStyleClass("zsacSymbol zsacColor-" + (widget.Props.Color || "blue"));
      if (clickable) { icon.attachPress(() => runAction(widget.Props, ctx)); }
      const items = [icon].concat(widget.Props.Label ? [new Text({ text: widget.Props.Label, textAlign: "Center" })] : []);
      return staticCard(widget, new VBox({ alignItems: "Center", justifyContent: "Center", height: "100%", items }), true);
    }
  });

  // ---- RSS reader
  const FEED_MOCK = "mock://news";
  WidgetRegistry.register("rss", {
    name: "RSS reader", icon: "sap-icon://marketing-campaign", group: "Content", size: { w: 4, h: 4 }, static: true,
    defaults: { Binding: emptyBinding(), Props: { Url: FEED_MOCK, Max: 5, Proxy: "" } },
    builder: [
      { key: "Title", label: "Title", kind: "text" },
      { key: "Props.Url", label: "Address of the feed (RSS or Atom). mock://news shows a sample", kind: "text" },
      { key: "Props.Max", label: "Number of items", kind: "number", min: 1, default: 5 },
      { key: "Props.Proxy", label: "Proxy address, if the feed's site does not allow other pages to read it (the feed address is added at the end)", kind: "text" }
    ],
    create(widget) {
      const holder = new HTML({ content: "<div></div>" });
      const card = staticCard(widget, holder);
      const show = (h) => holder.setContent("<div>" + h + "</div>");
      const bind = () => { const el = holder.getDomRef(); const a = el && el.querySelector(".zsacRssReload"); if (a) { a.addEventListener("click", (e) => { e.preventDefault(); card.refresh(); }); } };
      holder.addEventDelegate({ onAfterRendering: bind });
      card.refresh = async function () {
        const reload = '<div class="zsacRssBar"><a href="#" class="zsacRssReload">Reload</a></div>';
        const fail = (msg) => { show('<div class="zsacVMsg">' + Format.esc(msg) + "</div>" + reload); bind(); };
        const max = Math.max(1, Number(widget.Props.Max) || 5);
        let text;
        const raw = String(widget.Props.Url || "").trim();
        if (!raw) { return fail("Enter the address of a feed in the builder panel."); }
        if (raw === FEED_MOCK) { text = Feed.SAMPLE; } else {
          const c = WebContent.check(raw, "page");
          if (!c.ok) { return fail(c.error); }
          let target = c.url;
          if (widget.Props.Proxy) { const px = WebContent.check(widget.Props.Proxy, "page"); if (!px.ok) { return fail("Proxy address: " + px.error); } target = px.url + encodeURIComponent(c.url); }
          try {
            const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 10000);
            const res = await fetch(target, { signal: ctl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
            clearTimeout(timer);
            if (!res.ok) { return fail("The feed answered " + res.status + "."); }
            text = await res.text();
          } catch (e) {
            return fail("The feed could not be read. Most sites do not allow other pages to read their feed (CORS): give a proxy address in the builder panel, or use a feed on this server.");
          }
        }
        const f = Feed.parse(text, max);
        if (f.error) { return fail(f.error); }
        const rows = f.items.map((i) => '<div class="zsacRssItem">' + (i.link ? '<a href="' + Format.esc(i.link) + '" target="_blank" rel="noopener noreferrer">' + Format.esc(i.title) + "</a>" : "<span>" + Format.esc(i.title) + "</span>")
          + (i.date ? '<div class="zsacRssDate">' + Format.esc(new Date(i.date).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" })) + "</div>" : "")
          + (i.summary ? '<div class="zsacRssSum">' + Format.esc(i.summary) + "</div>" : "") + "</div>").join("");
        show((f.title ? '<div class="zsacVCap">' + Format.esc(f.title) + "</div>" : "") + (rows || '<div class="zsacVMsg">The feed has no items.</div>') + reload);
        bind();
      };
      return card;
    }
  });

  // ---- comments of the story: the thread of a model and version, shown under the story's filters
  WidgetRegistry.register("comment", {
    name: "Comments", icon: "sap-icon://comment", group: "Controls", size: { w: 4, h: 5 },
    defaults: { Binding: emptyBinding(), Props: { Max: 20 } },
    builder: baseBuilder.concat([
      { key: "Binding.Measure", label: "Measure the comments are about (optional)", kind: "measure" },
      { key: "Binding.Filters", label: "Filters (choose one version: comments belong to a version)", kind: "filters" },
      { key: "Props.Max", label: "Comments shown (the latest)", kind: "number", min: 1, default: 20 }
    ]),
    create(widget, ctx) {
      const holder = new HTML({ content: "<div></div>" });
      const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content: holder });
      let model = null; let draft = "";
      const b = widget.Binding;
      const filters = () => FilterEngine.merge(ctx.filters || {}, b.Filters || {});
      const versionId = () => { const v = filters().VERSION; return v && v.length === 1 ? v[0] : ""; };
      const show = (h) => { holder.setContent("<div>" + h + "</div>"); bind(); };
      const bind = () => {
        const el = holder.getDomRef(); if (!el) { return; }
        const box = el.querySelector(".zsacCmText"); if (box) { box.addEventListener("input", () => { draft = box.value; }); }
        const add = el.querySelector(".zsacCmAdd");
        if (add) { add.addEventListener("click", async () => {
          const c = CommentThread.create(draft, { modelId: b.ModelId, versionId: versionId(), filters: filters(), measure: b.Measure });
          if (c.error) { MessageToast.show(c.error); return; }
          try { await ctx.provider.saveComment(c); draft = ""; await card.refresh(); } catch (e) { MessageToast.show(e.message || String(e)); }
        }); }
        el.querySelectorAll("[data-del]").forEach((a) => a.addEventListener("click", (e) => {
          e.preventDefault();
          MessageBox.confirm("Delete this comment?", { onClose: async (action) => { if (action === MessageBox.Action.OK) { try { await ctx.provider.deleteComment(a.getAttribute("data-del")); await card.refresh(); } catch (err) { MessageToast.show(err.message || String(err)); } } } });
        }));
      };
      holder.addEventDelegate({ onAfterRendering: bind });
      return wire(card, widget, async () => {
        if (!(ctx.provider.capabilities && ctx.provider.capabilities.comments)) { card.setMessage("This data source does not keep comments"); return; }
        model = await ctx.provider.getModel(b.ModelId);
        const vid = versionId();
        const list = CommentThread.visible(await ctx.provider.listComments(b.ModelId, vid || undefined), { versionId: vid, filters: filters() });
        const shown = list.slice(-Math.max(1, Number(widget.Props.Max) || 20));
        const items = shown.map((c) => { const where = CommentThread.where(c, model);
          return '<div class="zsacCmItem"><div class="zsacCmHead"><b>' + Format.esc(c.Author || "") + "</b> " + Format.esc(c.At ? new Date(c.At).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "")
            + (where ? ' <span class="zsacCmWhere">' + Format.esc(where) + "</span>" : "") + ' <a href="#" data-del="' + Format.esc(c.Id) + '" class="zsacCmDel">Delete</a></div><div class="zsacCmBody">' + Format.esc(c.Text) + "</div></div>"; }).join("");
        show((vid ? "" : '<div class="zsacVMsg">Choose one version in the filters of this widget to add comments.</div>')
          + (list.length > shown.length ? '<div class="zsacVCap">' + (list.length - shown.length) + " older comment(s) not shown</div>" : "")
          + (items || '<div class="zsacVMsg">No comments yet.</div>')
          + '<div class="zsacCmNew"><textarea class="zsacCmText" rows="2" maxlength="' + CommentThread.MAX + '" placeholder="Write a comment">' + Format.esc(draft) + '</textarea><button type="button" class="zsacCmAdd"' + (vid ? "" : " disabled") + ">Add comment</button></div>");
      });
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
    const def = WidgetRegistry.get(widget.Type);
    if (first && !(def && def.static) && widget.Type !== "filter" && widget.Type !== "text" && widget.Type !== "dataaction.trigger" && widget.Type !== "multiaction.trigger" && !(b.Filters && b.Filters.VERSION) && !(b.Columns || []).includes("VERSION")) {
      b.Filters = Object.assign({}, b.Filters, { VERSION: [first.VersionId] });
    }
    return widget;
  }

  return { autoBind, runQuery };
});
