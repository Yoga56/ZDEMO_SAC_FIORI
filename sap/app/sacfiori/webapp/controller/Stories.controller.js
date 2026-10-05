sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/Label", "sap/m/VBox", "sap/ui/core/Item",
  "zsac/lib/core/StorySchema"
], function (BaseController, JSONModel, Dialog, Button, Input, Select, Label, VBox, Item, StorySchema) {
  "use strict";

  return BaseController.extend("zsac.fiori.controller.Stories", {
    onInit() {
      this._model = new JSONModel({ items: [] });
      this.getView().setModel(this._model, "view");
      this.onRoute("stories", () => this._load());
    },

    async _load() { this._model.setProperty("/items", await (await this.provider()).listStories()); },
    _story(e) { return e.getSource().getBindingContext("view").getObject(); },

    onOpen(e) { this.navTo("story", { id: e.getSource().getBindingContext("view").getObject().Id }); },

    onCreate: function () {
      this.guard(async () => {
        const models = await (await this.provider()).listModels();
        const name = new Input({ placeholder: "Story name", width: "100%", value: "New Story" });
        const model = new Select({ width: "100%" });
        models.forEach((m) => model.addItem(new Item({ key: m.ModelId, text: m.Name })));
        const dlg = new Dialog({
          title: "Create story",
          content: [this._margin({ items: [new Label({ text: "Name", required: true }), name, new Label({ text: "Model" }), model] })],
          beginButton: new Button({ text: "Create", type: "Emphasized", press: this.guard(async () => {
            const story = StorySchema.newStory(name.getValue().trim(), model.getSelectedKey());
            if (!story.Name) { return; }
            await (await this.provider()).saveStory(story);
            dlg.close();
            this.navTo("story", { id: story.Id });
          }) }),
          endButton: new Button({ text: "Cancel", press: () => dlg.close() }),
          afterClose: () => dlg.destroy()
        });
        dlg.open();
      })();
    },

    onDuplicate: function (e) {
      this.guard(async () => {
        const p = await this.provider();
        const copy = await p.getStory(this._story(e).Id);
        copy.Id = StorySchema.uid("STORY");
        copy.Name += " copy";
        copy.Status = "D";
        await p.saveStory(copy);
        await this._load();
      })();
    },

    onDelete: function (e) {
      this.guard(async () => {
        const s = this._story(e);
        if (!(await this.confirm("Delete story " + s.Name + "?", "Delete"))) { return; }
        await (await this.provider()).deleteStory(s.Id);
        await this._load();
      })();
    }
  });
});
