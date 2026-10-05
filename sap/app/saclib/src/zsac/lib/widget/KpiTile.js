/** Big number with a comparison: value, delta against `compare`, colored by whether higher or lower is better. */
sap.ui.define(["sap/ui/core/Control", "../core/Format"], function (Control, Format) {
  "use strict";

  return Control.extend("zsac.lib.widget.KpiTile", {
    metadata: {
      properties: {
        value: { type: "float", defaultValue: 0 },
        compare: { type: "float", defaultValue: null },
        compareLabel: { type: "string", defaultValue: "" },
        unit: { type: "string", defaultValue: "" },
        format: { type: "string", defaultValue: "compact" },
        lowerIsBetter: { type: "boolean", defaultValue: false },
        scale: { type: "float", defaultValue: 1 },
        decimals: { type: "int", defaultValue: 0 }
      }
    },

    renderer: {
      apiVersion: 2,
      render(rm, tile) {
        const v = tile.getValue();
        const c = tile.getCompare();
        rm.openStart("div", tile).class("zsacKpi").openEnd();
        rm.openStart("div").class("zsacKpiValue").openEnd()
          .text(tile.getFormat() === "measure" ? Format.full(v / tile.getScale(), tile.getDecimals()) : tile.getFormat() === "full" ? Format.full(v) : Format.compact(v))
          .openStart("span").class("zsacKpiUnit").openEnd().text(tile.getUnit()).close("span").close("div");
        if (c !== null && c !== undefined && c !== 0) {
          const delta = ((v - c) / Math.abs(c)) * 100;
          const good = tile.getLowerIsBetter() ? delta <= 0 : delta >= 0;
          rm.openStart("div").class("zsacKpiDelta").class(good ? "zsac-good-text" : "zsac-bad-text").openEnd()
            .text((delta >= 0 ? "▲ +" : "▼ -") + Math.abs(delta).toFixed(1) + "%")
            .openStart("span").class("zsacKpiRef").openEnd().text(" vs " + (tile.getCompareLabel() || "compare") + " (" + Format.compact(c) + ")").close("span")
            .close("div");
        }
        rm.close("div");
      }
    }
  });
});
