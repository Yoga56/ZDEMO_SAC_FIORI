sap.ui.define([
  "./BaseController",
  "sap/ui/core/Theming"
], function (BaseController, Theming) {
  "use strict";

  const ROUTE_TO_KEY = { home: "home", files: "files", stories: "stories", story: "stories", analyser: "analyser", datasets: "datasets",
    modelers: "modelers", modeller: "modelers", planning: "planning", dataactions: "dataactions", dataaction: "dataactions", multiactions: "multiactions", multiaction: "multiactions", calendar: "calendar" };

  return BaseController.extend("zsac.fiori.controller.App", {
    onInit() {
      this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
      // phone and narrow panes: start with the navigation collapsed
      this._narrow = () => window.innerWidth < 900;
      this.byId("toolPage").setSideExpanded(!this._narrow());
      this.router().attachRouteMatched((e) => {
        const key = ROUTE_TO_KEY[e.getParameter("name")];
        if (key) { this.byId("side").setSelectedKey(key); }
      });
      this.provider().then((p) => {
        this.byId("providerBadge").setText("Data: " + p.id);
        this.byId("resetBtn").setVisible(p.id === "mock");
      });
    },

    onToggleSide() {
      const page = this.byId("toolPage");
      page.setSideExpanded(!page.getSideExpanded());
    },

    onNavSelect(e) {
      const key = e.getParameter("item").getKey();
      if (key) { this.navTo(key); }
      if (this._narrow()) { this.byId("toolPage").setSideExpanded(false); }
    },

    onTheme() {
      Theming.setTheme(Theming.getTheme() === "sap_horizon_dark" ? "sap_horizon" : "sap_horizon_dark");
    },

    onResetMock: function () {
      this.guard(async () => {
        if (!(await this.confirm("Reset all sample data and discard your changes?", "Reset"))) { return; }
        (await this.provider()).reset();
        window.location.hash = "";
        window.location.reload();
      })();
    }
  });
});
