/*!
 * zsac.lib - reusable analytics and planning building blocks (SAC-style) for Fiori.
 */
sap.ui.define([
  "sap/ui/core/Lib",
  "sap/ui/dom/includeStylesheet",
  "sap/ui/core/library",
  "sap/m/library",
  "sap/f/library",
  "sap/tnt/library",
  "sap/ui/layout/library"
], function (Lib, includeStylesheet) {
  "use strict";

  const lib = Lib.init({
    name: "zsac.lib",
    version: "${version}",
    dependencies: ["sap.ui.core", "sap.m", "sap.f", "sap.tnt", "sap.ui.layout"],
    types: [],
    interfaces: [],
    controls: [
      "zsac.lib.widget.SvgChart",
      "zsac.lib.widget.WidgetCard",
      "zsac.lib.widget.KpiTile",
      "zsac.lib.widget.PivotTable",
      "zsac.lib.designer.StoryCanvas",
      "zsac.lib.designer.StoryViewer",
      "zsac.lib.designer.BuilderPanel",
      "zsac.lib.planning.PlanningTable"
    ],
    elements: [],
    noLibraryCSS: true
  });

  // library css is shipped as a plain stylesheet (no LESS step needed in a consuming project)
  includeStylesheet(sap.ui.require.toUrl("zsac/lib/css/zsac.css"), "zsac-lib-css");

  return lib;
});
