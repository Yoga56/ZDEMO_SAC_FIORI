/** Draws one of the chart types of ChartBuilders into its own box and redraws when the box is resized. */
sap.ui.define(["sap/ui/core/Control", "./ChartBuilders"], function (Control, ChartBuilders) {
  "use strict";

  const BUILDER = { "chart.bar": "bar", "chart.line": "line", "chart.donut": "donut", "chart.funnel": "funnel", "chart.gauge": "gauge", "chart.sankey": "sankey", "chart.waterfall": "waterfall" };

  return Control.extend("zsac.lib.widget.SvgChart", {
    metadata: {
      properties: {
        type: { type: "string", defaultValue: "chart.bar" },
        data: { type: "object", defaultValue: null }
      }
    },

    renderer: {
      apiVersion: 2,
      render(rm, control) {
        rm.openStart("div", control).class("zsacChart").openEnd().close("div");
      }
    },

    setData(data) {
      this.setProperty("data", data, true);
      this._draw();
      return this;
    },

    onAfterRendering() {
      this._draw();
      if (typeof ResizeObserver === "undefined" || this._resizeObs) { return; }
      this._resizeObs = new ResizeObserver(() => this._draw());
      this._resizeObs.observe(this.getDomRef());
    },

    exit() {
      if (this._resizeObs) { this._resizeObs.disconnect(); }
    },

    _draw() {
      const el = this.getDomRef();
      const data = this.getData();
      if (!el) { return; }
      const w = Math.max(120, el.clientWidth);
      const h = Math.max(80, el.clientHeight);
      if (el.firstChild && this._last && this._last.w === w && this._last.h === h && this._last.data === data) { return; }
      this._last = { w, h, data };
      const fn = ChartBuilders[BUILDER[this.getType()]];
      el.innerHTML = data && fn ? fn(data, w, h) : ChartBuilders.empty(w, h, "No data");
    }
  });
});
