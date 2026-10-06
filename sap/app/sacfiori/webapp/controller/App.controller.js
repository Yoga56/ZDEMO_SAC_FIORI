sap.ui.define([
  "./BaseController",
  "sap/ui/core/Theming",
  "zsac/lib/calendar/CalendarEngine"
], function (BaseController, Theming, Engine) {
  "use strict";

  const ROUTE_TO_KEY = { home: "home", files: "files", stories: "stories", story: "stories", analyser: "analyser", datasets: "datasets",
    modelers: "modelers", modeller: "modelers", planning: "planning", dataactions: "dataactions", dataaction: "dataactions", multiactions: "multiactions", multiaction: "multiactions", calendar: "calendar" };

  return BaseController.extend("zsac.fiori.controller.App", {
    onInit() {
      this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
      // light or dark follows the setting of the operating system (and changes with it); there is no switch in the app
      const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
      if (dark) {
        const follow = () => { const want = dark.matches ? "sap_horizon_dark" : "sap_horizon"; if (Theming.getTheme() !== want) { Theming.setTheme(want); } };
        follow();
        if (dark.addEventListener) { dark.addEventListener("change", follow); }
      }
      this.router().attachRouteMatched((e) => {
        const key = ROUTE_TO_KEY[e.getParameter("name")];
        if (key) { this._markNav(key); }
        this._refreshBell();
      });
      sap.ui.getCore().getEventBus().subscribe("zsac", "remindersChanged", () => this._refreshBell());
      this.provider().then((p) => {
        this.byId("providerBadge").setText("Data: " + p.id);
        this.byId("resetBtn").setVisible(p.id === "mock");
      });
    },

    /** The bell shows how many reminders the calendar has for the user (reviews waiting, overdue, ending soon); it is hidden when there are none. */
    async _refreshBell() {
      try {
        const p = await this.provider();
        const [tasks, me] = await Promise.all([p.listTasks(), p.currentUser()]);
        const n = Engine.reminders(tasks.map(Engine.normalize), me, new Date().toISOString().slice(0, 10)).length;
        const bell = this.byId("bell");
        bell.setVisible(n > 0); bell.setText(String(n)); bell.setTooltip(n + (n === 1 ? " reminder" : " reminders"));
      } catch (e) { this.byId("bell").setVisible(false); }
    },

    onBell() { this.navTo("calendar", { query: { reminders: "1" } }); },

    /** The floating button opens (or closes) the navigation menu above it. */
    onToggleSide(e) {
      const menu = this.byId("navMenu");
      if (menu.isOpen()) { menu.close(); } else { menu.openBy(e.getSource()); }
    },

    /** The item of the page that is open is marked in the menu. */
    _markNav(key) {
      this._navKey = key;
      this.byId("side").getItems().forEach((i) => i.setSelected(i.data("key") === key));
    },

    onNavSelect(e) {
      const key = e.getParameter("listItem").data("key");
      this.byId("navMenu").close();
      if (key) { this.navTo(key); }
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
