/** Frame around every widget on a canvas: title, optional message, one content control. `refresh()` is set by the widget factory. */
sap.ui.define(["sap/ui/core/Control"], function (Control) {
  "use strict";

  return Control.extend("zsac.lib.widget.WidgetCard", {
    metadata: {
      properties: {
        title: { type: "string", defaultValue: "" },
        widgetId: { type: "string", defaultValue: "" },
        message: { type: "string", defaultValue: "" },
        bare: { type: "boolean", defaultValue: false }
      },
      defaultAggregation: "content",
      aggregations: { content: { type: "sap.ui.core.Control", multiple: false } }
    },

    /** Replaced by the widget factory: reloads data for the widget. */
    refresh() { return Promise.resolve(); },

    renderer: {
      apiVersion: 2,
      render(rm, card) {
        rm.openStart("div", card).class("zsacCard").class(card.getBare() ? "zsacCardBare" : "");
        rm.attr("data-widget", card.getWidgetId()).openEnd();
        if (card.getTitle() && !card.getBare()) {
          rm.openStart("div").class("zsacCardHead").openEnd().text(card.getTitle()).close("div");
        }
        rm.openStart("div").class("zsacCardBody").openEnd();
        if (card.getMessage()) {
          rm.openStart("div").class("zsacCardMsg").openEnd().text(card.getMessage()).close("div");
        } else if (card.getContent()) {
          rm.renderControl(card.getContent());
        }
        rm.close("div").close("div");
      }
    }
  });
});
