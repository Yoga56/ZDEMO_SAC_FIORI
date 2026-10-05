sap.ui.define([
  "./BaseController",
  "../model/FileTypes",
  "sap/ui/model/json/JSONModel",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Input",
  "sap/m/Select",
  "sap/m/Label",
  "sap/m/VBox",
  "sap/ui/core/Item"
], function (BaseController, FileTypes, JSONModel, Dialog, Button, Input, Select, Label, VBox, Item) {
  "use strict";

  /** Files: folders and every saved object (stories, datasets, actions) with favourites, sharing and move. */
  return BaseController.extend("zsac.fiori.controller.Files", {
    onInit() {
      this._model = new JSONModel({ items: [], path: "Files", inFolder: false });
      this._folder = "";
      this._type = "ALL";
      this._q = "";
      this.getView().setModel(this._model, "view");
      this.onRoute("files", () => this._load());
    },

    icon: (t) => FileTypes.icon(t),
    typeLabel: (t) => FileTypes.label(t),
    date: (d) => (d ? new Date(d).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" }) : ""),

    async _load() {
      this._files = await (await this.provider()).listFiles();
      this._render();
    },

    _render() {
      const q = this._q.toLowerCase();
      const items = this._files.filter((f) => {
        if (q) { return f.Name.toLowerCase().includes(q) && (this._type === "ALL" || this._match(f)); }
        return (f.ParentId || "") === this._folder && (this._type === "ALL" || f.Type === "FOLDER" || this._match(f));
      }).sort((a, b) => (a.Type === "FOLDER" ? 0 : 1) - (b.Type === "FOLDER" ? 0 : 1) || a.Name.localeCompare(b.Name));
      const cur = this._files.find((f) => f.Id === this._folder);
      this._model.setData({ items, path: cur ? "Files / " + cur.Name : "Files", inFolder: !!this._folder });
    },

    _match(f) { return this._type === "ACTION" ? /ACTION$/.test(f.Type) : f.Type === this._type; },
    _file(e) { return e.getSource().getBindingContext("view").getObject(); },

    onSearch(e) { this._q = e.getParameter("newValue") || ""; this._render(); },
    onFilter(e) { this._type = e.getParameter("item").getKey(); this._render(); },
    onUp() { const cur = this._files.find((f) => f.Id === this._folder); this._folder = cur ? (cur.ParentId || "") : ""; this._render(); },

    onOpen(e) {
      const f = e.getSource().getBindingContext("view").getObject();
      if (f.Type === "FOLDER") { this._folder = f.Id; this._q = ""; this._render(); } else { FileTypes.open(this, f); }
    },

    onFavourite: function (e) { this.guard(async () => { const f = this._file(e); f.Favourite = !f.Favourite; await (await this.provider()).saveFile(f); await this._load(); })(); },
    onShare: function (e) { this.guard(async () => { const f = this._file(e); f.Shared = !f.Shared; await (await this.provider()).saveFile(f); await this._load(); this.toast(f.Shared ? "Shared" : "Not shared"); })(); },

    onDelete: function (e) {
      this.guard(async () => {
        const f = this._file(e);
        if (!(await this.confirm("Delete " + f.Name + "?", "Delete"))) { return; }
        const p = await this.provider();
        if (f.Type === "STORY") { await p.deleteStory(f.ObjectId); }
        else if (f.Type === "MODEL") { await p.deleteModel(f.ObjectId); }
        else if (f.Type === "DATAACTION") { await p.deleteDataAction(f.ObjectId); }
        else if (f.Type === "MULTIACTION") { await p.deleteMultiAction(f.ObjectId); }
        else {
          if (this._files.some((x) => x.ParentId === f.Id)) { throw new Error("The folder is not empty"); }
          await p.deleteFile(f.Id);
        }
        await this._load();
      })();
    },

    onNewFolder() {
      const name = new Input({ placeholder: "Folder name", width: "100%" });
      const dlg = new Dialog({
        title: "New folder", content: [this._margin({ items: [name] })],
        beginButton: new Button({ text: "Create", type: "Emphasized", press: this.guard(async () => {
          if (!name.getValue().trim()) { return; }
          await (await this.provider()).saveFile({ Id: "F_FOLDER_" + Date.now().toString(36), ParentId: this._folder, Type: "FOLDER", ObjectId: "",
            Name: name.getValue().trim(), Description: "", Owner: "ME", Favourite: false, Shared: false, ChangedAt: new Date().toISOString() });
          dlg.close(); await this._load();
        }) }),
        endButton: new Button({ text: "Cancel", press: () => dlg.close() }),
        afterClose: () => dlg.destroy()
      });
      dlg.open();
    },

    onMove(e) {
      const file = this._file(e);
      const sel = new Select({ width: "100%" });
      sel.addItem(new Item({ key: "", text: "Files (top level)" }));
      this._files.filter((f) => f.Type === "FOLDER" && f.Id !== file.Id).forEach((f) => sel.addItem(new Item({ key: f.Id, text: f.Name })));
      sel.setSelectedKey(file.ParentId || "");
      const dlg = new Dialog({
        title: "Move " + file.Name, content: [this._margin({ items: [new Label({ text: "Folder" }), sel] })],
        beginButton: new Button({ text: "Move", type: "Emphasized", press: this.guard(async () => {
          file.ParentId = sel.getSelectedKey();
          await (await this.provider()).saveFile(file);
          dlg.close(); await this._load();
        }) }),
        endButton: new Button({ text: "Cancel", press: () => dlg.close() }),
        afterClose: () => dlg.destroy()
      });
      dlg.open();
    }
  });
});
