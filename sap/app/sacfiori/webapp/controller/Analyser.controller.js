sap.ui.define([
  "./BaseController",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Select", "sap/m/Label", "sap/m/VBox", "sap/ui/core/Item",
  "zsac/lib/core/WidgetRegistry",
  "zsac/lib/core/StorySchema",
  "zsac/lib/core/EventBus",
  "zsac/lib/widget/Widgets",
  "zsac/lib/widget/PivotTable"
], function (BaseController, Dialog, Button, Select, Label, VBox, Item, WidgetRegistry, StorySchema, EventBus, Widgets, PivotTable) {
  "use strict";

  /**
   * Ad-hoc analysis. It is a single widget configured live by the same builder panel the designer uses, so any
   * analysis can be switched between table and charts and dropped into a story unchanged.
   */
  return BaseController.extend("zsac.fiori.controller.Analyser", {
    onInit() { this.onRoute("analyser", () => this._load()); },

    async _load() {
      const p = (this._p = await this.provider());
      if (!this._w) {
        const models = await p.listModels();
        const w = { Id: "ANALYSER", Page: 1, Type: "table", Title: "Analysis", X: 0, Y: 0, W: 12, H: 6,
          Binding: { ModelId: "", Rows: [], Columns: [], Measure: "", Filters: {} }, Props: { ShowTotals: true, Decimals: 0 } };
        if (models.length) {
          const m = models.find((x) => !(x.Source && x.Source.Mode === "LIVE")) || models[0];   // start on a model held here: a live one needs its source
          w.Binding.Rows = [m.Dimensions[0].DimId];
          w.Binding.Columns = ["VERSION"];
          Widgets.autoBind(w, m, await p.listVersions(m.ModelId));
          w.Binding.Filters = {};
        }
        this._w = w;
      }
      await this.byId("builder").bind(this._w, p);
      this._render();
    },

    _ctx() { return { provider: this._p, bus: new EventBus(), filters: {} }; },

    _render() {
      const box = this.byId("result");
      box.destroyItems();
      const def = WidgetRegistry.get(this._w.Type);
      const card = def.create(this._w, this._ctx());
      card.addStyleClass("zsacAnalysisCard");
      box.addItem(card);
      card.refresh();
    },

    onChange() { this._render(); },

    onType(e) {
      this._w.Type = e.getParameter("item").getKey();
      this.byId("builder").bind(this._w, this._p);
      this._render();
    },

    onExport: function () {
      this.guard(async () => {
        const r = await Widgets.runQuery(this._w, this._ctx());
        const csv = new PivotTable({ result: r }).toCsv();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = "analysis.csv";
        a.click();
        URL.revokeObjectURL(a.href);
      })();
    },

    onAddToStory: function () {
      this.guard(async () => {
        const stories = await this._p.listStories();
        if (!stories.length) { throw new Error("Create a story first"); }
        const sel = new Select({ width: "100%" });
        stories.forEach((s) => sel.addItem(new Item({ key: s.Id, text: s.Name })));
        const dlg = new Dialog({
          title: "Add to story", content: [this._margin({ items: [new Label({ text: "Story" }), sel] })],
          beginButton: new Button({ text: "Add", type: "Emphasized", press: this.guard(async () => {
            const story = await this._p.getStory(sel.getSelectedKey());
            const copy = JSON.parse(JSON.stringify(this._w));
            copy.Id = StorySchema.uid("W");
            copy.Title = this._w.Title === "Analysis" ? WidgetRegistry.get(copy.Type).name : this._w.Title;
            const page = story.Pages[story.Pages.length - 1].Id;
            const spot = StorySchema.freeSpot(story, page, copy.W, copy.H);
            Object.assign(copy, { Page: page, X: spot.X, Y: spot.Y });
            story.Widgets.push(copy);
            await this._p.saveStory(story);
            dlg.close();
            this.toast("Added to " + story.Name);
          }) }),
          endButton: new Button({ text: "Cancel", press: () => dlg.close() }), afterClose: () => dlg.destroy()
        });
        dlg.open();
      })();
    }
  });
});
