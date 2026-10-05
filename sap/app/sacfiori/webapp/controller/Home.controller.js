sap.ui.define([
  "./BaseController",
  "../model/FileTypes",
  "sap/m/GenericTile",
  "sap/m/TileContent",
  "sap/m/ImageContent",
  "sap/m/Title",
  "sap/m/Text",
  "sap/m/HBox",
  "sap/m/List",
  "sap/m/StandardListItem",
  "sap/m/ObjectStatus",
  "zsac/lib/core/WidgetRegistry",
  "zsac/lib/core/EventBus"
], function (BaseController, FileTypes, GenericTile, TileContent, ImageContent, Title, Text, HBox, List, StandardListItem, ObjectStatus, WidgetRegistry, EventBus) {
  "use strict";

  const STATUS = { OPEN: "Information", IN_REVIEW: "Warning", DONE: "Success" };

  return BaseController.extend("zsac.fiori.controller.Home", {
    onInit() {
      this.onRoute("home", () => this._load());
    },

    async _load() {
      const p = await this.provider();
      this._files = await p.listFiles();
      this._tasks = await p.listTasks();
      const now = new Date();
      this.byId("hello").setText("Hello, WCS ARNESA");
      this.byId("date").setText(now.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }));
      this._tab(this.byId("tabs").getSelectedKey());
      this._metrics(p);
    },

    async _metrics(p) {
      const box = this.byId("metrics");
      box.destroyItems();
      const models = await p.listModels();
      const m = models.find((x) => x.ModelId === "SALES_PLAN") || models[0];
      if (!m || !m.Measures.length) { return; }
      const versions = await p.listVersions(m.ModelId);
      const act = versions.find((v) => v.Category === "ACTUAL");
      const bud = versions.find((v) => v.Category === "BUDGET");
      if (!act) { return; }
      const ctx = { provider: p, bus: new EventBus(), filters: {} };
      const periods = Array.from(new Set((await p.readFacts(m.ModelId, { VERSION: [act.VersionId] })).map((f) => f.Period))).sort();
      m.Measures.slice(0, 2).forEach((ms, i) => {
        const w = { Id: "HOME_KPI" + i, Title: m.Name + ": " + ms.Label + " (actual, year to date)", Type: "kpi",
          Binding: { ModelId: m.ModelId, Rows: [], Columns: [], Measure: ms.MeasureId, Filters: { VERSION: [act.VersionId], PERIOD: periods } },
          Props: { CompareVersion: bud ? bud.VersionId : "", Format: "compact", LowerIsBetter: ms.MeasureId === "COST" } };
        const card = WidgetRegistry.get("kpi").create(w, ctx);
        card.addStyleClass("zsacTile zsacMetric");
        box.addItem(card);
        card.refresh();
      });
    },

    _tile(file) {
      return new GenericTile({
        header: file.Name, subheader: FileTypes.label(file.Type), frameType: "OneByOne",
        tileContent: new TileContent({ footer: file.ChangedAt ? new Date(file.ChangedAt).toLocaleDateString("en", { month: "short", day: "numeric" }) : "",
          content: new ImageContent({ src: FileTypes.icon(file.Type) }) }),
        press: () => FileTypes.open(this, file)
      }).addStyleClass("zsacTile");
    },

    _tab(key) {
      const box = this.byId("content");
      box.destroyItems();
      const objects = this._files.filter((f) => f.Type !== "FOLDER");
      const wrap = (tiles) => new HBox({ wrap: "Wrap", items: tiles });
      if (key === "today") {
        const recent = objects.slice().sort((a, b) => String(b.ChangedAt).localeCompare(String(a.ChangedAt))).slice(0, 6);
        box.addItem(new Title({ text: "Recently changed", level: "H5" }));
        box.addItem(recent.length ? wrap(recent.map((f) => this._tile(f))) : new Text({ text: "Nothing yet. Create a story or a dataset." }));
        const open = this._tasks.filter((t) => t.Status !== "DONE").sort((a, b) => String(a.DueDate).localeCompare(String(b.DueDate)));
        box.addItem(new Title({ text: "Tasks due", level: "H5" }).addStyleClass("sapUiMediumMarginTop sapUiTinyMarginBottom"));
        const list = new List({ inset: false, noDataText: "No open tasks" });
        open.slice(0, 6).forEach((t) => list.addItem(new StandardListItem({ title: t.Title, description: "Due " + t.DueDate + (t.Assignee ? " - " + t.Assignee : ""),
          icon: "sap-icon://task", type: "Navigation", press: () => this.navTo("calendar") ,
          info: t.Status.replace("_", " "), infoState: STATUS[t.Status] || "None" })));
        box.addItem(list);
        return;
      }
      const shown = key === "favourites" ? objects.filter((f) => f.Favourite) : key === "shared" ? objects.filter((f) => f.Shared) : objects;
      box.addItem(shown.length ? wrap(shown.map((f) => this._tile(f))) : new Text({ text: key === "favourites" ? "Star a file in Files to see it here." : "Nothing here." }));
    },

    onTab(e) { this._tab(e.getParameter("key")); },
    onCreateStory() { this.navTo("stories"); },
    onPlanning() { this.navTo("planning"); },
    onAnalyser() { this.navTo("analyser"); },
    onCreateDataset() { this.navTo("modeller", { id: "new" }); }
  });
});
