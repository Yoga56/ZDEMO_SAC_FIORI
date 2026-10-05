/**
 * "Why did it change?": opens an analysis of the difference between two slices of a model (see core/VarianceEngine).
 *
 *   VarianceDialog.open({ provider, modelId, measure, base, compare, filters, lowerIsBetter, labels })
 *     base / compare   the two slices, for example { VERSION: ["BUD"] } and { VERSION: ["ACT"] }, or { PERIOD: [...] } for periods against periods
 *     filters          restrictions common to both (the page filters)
 * The planner can change the measure and the two versions or period selections, sees the headline with a sentence, picks a dimension
 * (ranked by how clearly one member explains the change) and clicks a bar to drill into that member; the chips above remove a drill step.
 */
sap.ui.define([
  "sap/m/Dialog", "sap/m/Button", "sap/m/Select", "sap/m/MultiComboBox", "sap/m/Label", "sap/m/Text", "sap/m/VBox", "sap/m/HBox", "sap/m/SegmentedButton", "sap/m/SegmentedButtonItem",
  "sap/m/MessageStrip", "sap/m/MessageBox", "sap/m/BusyIndicator", "sap/ui/core/Item", "sap/ui/core/HTML",
  "../core/VarianceEngine", "../core/QueryEngine", "../core/HierarchyEngine", "./VarianceView"
], function (Dialog, Button, Select, MultiComboBox, Label, Text, VBox, HBox, SegmentedButton, SegmentedButtonItem, MessageStrip, MessageBox, BusyIndicator, Item, HTML,
  VarianceEngine, QueryEngine, HierarchyEngine, VarianceView) {
  "use strict";

  function open(opts) {
    const { provider } = opts;
    const fail = (e) => MessageBox.error((e && e.message) || String(e));
    Promise.all([provider.getModel(opts.modelId), provider.listVersions(opts.modelId)]).then(([model, versions]) => {
      const measures = (model.Measures || []).filter((m) => !VarianceEngine.check(model, m.MeasureId));
      if (!measures.length) { MessageBox.information("No measure of this model adds up, so none can be explained."); return; }
      const periods = HierarchyEngine.monthRange(model.PeriodFrom, model.PeriodTo);
      const state = {
        measure: measures.some((m) => m.MeasureId === opts.measure) ? opts.measure : measures[0].MeasureId,
        mode: opts.base && opts.base.PERIOD && !(opts.base.VERSION && opts.compare && opts.compare.VERSION) ? "PERIOD" : "VERSION",
        base: JSON.parse(JSON.stringify(opts.base || {})), compare: JSON.parse(JSON.stringify(opts.compare || {})), filters: JSON.parse(JSON.stringify(opts.filters || {})),
        drill: {}, dim: "", facts: [], result: null, align: true, common: { periods: [], note: "" }
      };
      const unitOf = () => { const m = measures.find((x) => x.MeasureId === state.measure); return m && m.UnitType !== "None" ? m.Unit : ""; };
      const nameOf = (id) => ((versions.find((v) => v.VersionId === id) || {}).Name) || id;
      const labels = () => state.mode === "VERSION"
        ? { base: nameOf((state.base.VERSION || [])[0]), compare: nameOf((state.compare.VERSION || [])[0]) }
        : { base: (state.base.PERIOD || []).map((p) => p).join(", ") || "reference months", compare: (state.compare.PERIOD || []).join(", ") || "compared months" };
      const lowerIsBetter = !!opts.lowerIsBetter;

      const spec = () => ({ measure: state.measure, base: state.base, compare: state.compare, lowerIsBetter, labels: labels(),
        filters: Object.assign({}, state.filters, state.align && state.common.periods.length ? { PERIOD: state.common.periods } : {}, state.drill) });
      const findCommon = () => {
        state.common = VarianceEngine.commonPeriods(model, state.facts, { measure: state.measure, base: state.base, compare: state.compare, filters: state.filters });
      };

      const dyn = new VBox({ width: "100%" });
      const controls = new VBox({ width: "100%" });
      const busy = new BusyIndicator({ size: "1.5rem", visible: false });

      async function reload() {
        busy.setVisible(true);
        try {
          const need = QueryEngine.expandFilters(model, VarianceEngine.loadFilter({ base: state.base, compare: state.compare, filters: state.filters }));
          state.facts = await provider.readFacts(opts.modelId, need);
          state.drill = {};
          state.dim = "";
          findCommon();
          render();
        } catch (e) { fail(e); }
        busy.setVisible(false);
      }

      function render() {
        dyn.destroyItems();
        if (!(state.base.VERSION || state.base.PERIOD) || !(state.compare.VERSION || state.compare.PERIOD)) { dyn.addItem(new Text({ text: "Choose what to compare." })); return; }
        const r = (state.result = VarianceEngine.explain(model, state.facts, spec()));
        if (state.common.periods.length) {
          dyn.addItem(new HBox({ alignItems: "Center", wrap: "Wrap", items: [new Text({ text: state.align ? state.common.note : "All months of both sides are compared, so a side that stops earlier shows as a gap." }).addStyleClass("zsacSmall sapUiTinyMarginEnd"),
            new Button({ text: state.align ? "Compare all months" : "Only common months", type: "Transparent", press: () => { state.align = !state.align; state.drill = {}; render(); } })] }));
        }
        dyn.addItem(new HTML({ content: VarianceView.summaryHtml(r, labels(), unitOf()), preferDOM: false }));
        // the drill path as buttons: All, then one per step
        const crumbs = new HBox({ wrap: "Wrap", alignItems: "Center" });
        crumbs.addItem(new Text({ text: "Showing" }).addStyleClass("sapUiTinyMarginEnd"));
        crumbs.addItem(new Button({ text: "All data", type: Object.keys(state.drill).length ? "Transparent" : "Emphasized", press: () => { state.drill = {}; state.dim = ""; render(); } }));
        Object.keys(state.drill).forEach((d) => {
          const dim = (model.Dimensions || []).find((x) => x.DimId === d);
          crumbs.addItem(new Button({ text: (dim ? dim.Label : d === "PERIOD" ? "Date" : d) + ": " + state.drill[d][0], icon: "sap-icon://decline", iconFirst: false, type: "Transparent",
            tooltip: "Remove this step", press: () => { delete state.drill[d]; state.dim = ""; render(); } }));
        });
        dyn.addItem(crumbs);
        if (r.error) { return; }
        if (!r.dims.length) { dyn.addItem(new HTML({ content: VarianceView.barsHtml(null) })); return; }
        if (!r.dims.some((d) => d.dimId === state.dim)) { state.dim = r.dims[0].dimId; }
        const seg = new SegmentedButton({ selectedKey: state.dim, selectionChange: (e) => { state.dim = e.getParameter("item").getKey(); render(); } });
        r.dims.forEach((d) => seg.addItem(new SegmentedButtonItem({ key: d.dimId, text: d.label + " " + Math.round(d.topShare * 100) + "%", tooltip: "How much of the movement the biggest single " + d.label + " member holds" })));
        dyn.addItem(seg.addStyleClass("sapUiSmallMarginTop"));
        dyn.addItem(new Text({ text: "Click a bar to look inside that member. The percentage is the share of all movement in this dimension." }).addStyleClass("zsacSmall sapUiTinyMarginTop"));
        const bars = new HTML({ content: VarianceView.barsHtml(r.dims.find((d) => d.dimId === state.dim), 12) });
        bars.attachAfterRendering(() => {
          const el = bars.getDomRef();
          if (!el) { return; }
          el.querySelectorAll(".zsacVRow[data-m]").forEach((row) => row.addEventListener("click", () => {
            state.drill[state.dim] = [row.getAttribute("data-m")];
            state.dim = "";
            render();
          }));
        });
        dyn.addItem(bars);
      }

      function buildControls() {
        controls.destroyItems();
        const row = new HBox({ wrap: "Wrap", alignItems: "End" });
        const field = (label, control) => row.addItem(new VBox({ items: [new Label({ text: label }), control] }).addStyleClass("sapUiSmallMarginEnd sapUiTinyMarginBottom"));
        field("Measure", new Select({ selectedKey: state.measure, items: measures.map((m) => new Item({ key: m.MeasureId, text: m.Label || m.MeasureId })),
          change: (e) => { state.measure = e.getParameter("selectedItem").getKey(); findCommon(); render(); } }));
        field("Compare", new Select({ selectedKey: state.mode, items: [new Item({ key: "VERSION", text: "Versions" }), new Item({ key: "PERIOD", text: "Periods" })],
          change: (e) => { switchMode(e.getParameter("selectedItem").getKey()); } }));
        const vsel = (own, key) => new Select({ selectedKey: (own.VERSION || [])[0] || "", items: versions.map((v) => new Item({ key: v.VersionId, text: v.Name })), change: (e) => { own.VERSION = [e.getParameter("selectedItem").getKey()]; reload(); } });
        const psel = (own) => new MultiComboBox({ width: "14rem", selectedKeys: own.PERIOD || [], items: periods.map((p) => new Item({ key: p, text: p })).concat(yearsAndQuarters().map((p) => new Item({ key: p, text: p }))),
          selectionFinish: (e) => { own.PERIOD = e.getParameter("selectedItems").map((i) => i.getKey()); reload(); } });
        if (state.mode === "VERSION") {
          field("Explain", vsel(state.compare)); field("against", vsel(state.base));
        } else {
          field("Explain months", psel(state.compare)); field("against months", psel(state.base));
          field("In version", new Select({ selectedKey: (state.filters.VERSION || [])[0] || "", items: versions.map((v) => new Item({ key: v.VersionId, text: v.Name })), change: (e) => { state.filters.VERSION = [e.getParameter("selectedItem").getKey()]; reload(); } }));
        }
        controls.addItem(row);
      }

      function yearsAndQuarters() {
        const out = [];
        periods.forEach((p) => { const y = p.slice(0, 4); const q = y + "-Q" + (Math.floor((+p.slice(5) - 1) / 3) + 1); [y, q].forEach((x) => { if (out.indexOf(x) < 0) { out.push(x); } }); });
        return out.sort();
      }

      function switchMode(mode) {
        state.mode = mode;
        if (mode === "VERSION") {
          const v = versions.map((x) => x.VersionId);
          state.base = { VERSION: [v.indexOf("BUD") >= 0 ? "BUD" : v[0]] }; state.compare = { VERSION: [v.indexOf("ACT") >= 0 ? "ACT" : v[v.length - 1]] };
          delete state.filters.VERSION;
        } else {
          const half = Math.max(1, Math.floor(periods.length / 2));
          state.base = { PERIOD: periods.slice(0, half) }; state.compare = { PERIOD: periods.slice(half, half * 2) };
          state.filters.VERSION = [(versions.find((v) => v.Category === "ACTUAL") || versions[0]).VersionId];
        }
        buildControls();
        reload();
      }

      buildControls();
      const dlg = new Dialog({ title: "Why did it change? " + (model.Name || ""), contentWidth: "48rem", draggable: true, resizable: true,
        content: [new VBox({ items: [controls, busy, dyn] }).addStyleClass("sapUiSmallMargin")],
        endButton: new Button({ text: "Close", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
      dlg.open();
      reload();
    }).catch(fail);
  }

  return { open };
});
