/**
 * Plug-in point for the story designer. A widget type is one registration:
 *
 *   WidgetRegistry.register("chart.bar", {
 *     name: "Bar chart", icon: "sap-icon://vertical-bar-chart", group: "Chart",
 *     size: { w: 6, h: 4 },                       // grid cells (12 columns)
 *     defaults: { rows: [], columns: [], measure: "", ... },   // initial widget.binding / widget.props
 *     builder: [ { key, label, kind } ... ],      // fields the Builder panel renders (see BuilderPanel)
 *     create: function (widget, ctx) -> Control   // ctx = { provider, model, filters, bus }
 *   });
 *
 * The designer, the viewer and the palette read only this registry, so a new widget never touches them.
 */
sap.ui.define([], function () {
  "use strict";

  const types = new Map();

  return {
    register(type, def) {
      if (!def || typeof def.create !== "function") { throw new Error("Widget " + type + " needs create()"); }
      types.set(type, Object.assign({ type, name: type, group: "Other", size: { w: 4, h: 3 },
        defaults: {}, builder: [] }, def));
    },
    get(type) { return types.get(type); },
    has(type) { return types.has(type); },
    list() { return Array.from(types.values()); },
    types() { return Array.from(types.keys()); }
  };
});
