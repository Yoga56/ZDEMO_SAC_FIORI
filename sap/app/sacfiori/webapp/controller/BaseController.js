sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/VBox"
], function (Controller, History, MessageToast, MessageBox, VBox) {
  "use strict";

  /** Helpers every page controller shares: provider access, routing, toasts, confirmations. */
  return Controller.extend("zsac.fiori.controller.BaseController", {
    /** VBox with the standard dialog padding (ManagedObject settings cannot take a style class). */
    _margin(settings) { return new VBox(settings).addStyleClass("sapUiSmallMargin"); },

    /** Resolves to the data provider chosen by the Component (mock or OData). */
    provider() { return this.getOwnerComponent().getProvider(); },

    router() { return this.getOwnerComponent().getRouter(); },

    /** Calls fn each time the route is matched (after the provider is ready, because the router waits for it). */
    onRoute(name, fn) {
      this.router().getRoute(name).attachPatternMatched((e) => {
        Promise.resolve(fn.call(this, e.getParameter("arguments") || {})).catch((err) => this.fail(err));
      });
    },

    navTo(route, params) { this.router().navTo(route, params || {}); },

    toast(text) { MessageToast.show(text); },

    fail(err) {
      // eslint-disable-next-line no-console
      console.error(err);
      MessageBox.error((err && err.message) || String(err));
    },

    confirm(text, action) {
      return new Promise((resolve) => MessageBox.confirm(text, {
        actions: [action || MessageBox.Action.OK, MessageBox.Action.CANCEL],
        emphasizedAction: action || MessageBox.Action.OK,
        onClose: (a) => resolve(a !== MessageBox.Action.CANCEL)
      }));
    },

    /** Runs an async handler and reports errors in a message box. */
    guard(fn) {
      return (...args) => Promise.resolve(fn.apply(this, args)).catch((e) => this.fail(e));
    },

    onNavBack() {
      if (History.getInstance().getPreviousHash() !== undefined) { window.history.go(-1); } else { this.navTo("home"); }
    }
  });
});
