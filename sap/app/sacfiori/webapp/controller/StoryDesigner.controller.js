sap.ui.define([
  "./BaseController",
  "sap/m/SegmentedButtonItem",
  "sap/m/List",
  "sap/m/StandardListItem",
  "sap/m/GroupHeaderListItem",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/VBox",
  "zsac/lib/core/WidgetRegistry",
  "zsac/lib/core/StorySchema",
  "../model/ShareDialog",
  "zsac/lib/widget/Widgets"
], function (BaseController, SegmentedButtonItem, List, StandardListItem, GroupHeaderListItem, Dialog, Button, Input, VBox, WidgetRegistry, StorySchema, ShareDialog) {
  "use strict";

  /** Story designer and viewer: palette (from WidgetRegistry) | canvas | builder panel (generated from the widget's builder list). */
  return BaseController.extend("zsac.fiori.controller.StoryDesigner", {
    onInit() {
      this._dirty = false;
      this.onRoute("story", (args) => this._load(args.id));
    },

    async _load(id) {
      const p = await this.provider();
      this._p = p;
      const story = await p.getStory(id);
      this._story = story;
      this._dirty = false;
      const canvas = this.byId("canvas");
      canvas.setPage(story.Pages[0].Id);
      canvas.setContext({ provider: p, story });
      this.byId("plan").attach({ plan: canvas.getPlan(), provider: p, onChange: () => canvas.refreshAll() });
      this.byId("plan").setVisible(canvas.hasPlanning());
      this.byId("title").setText(story.Name);
      this.byId("name").setValue(story.Name);
      this._pages();
      this._palette();
      this._access();
      this._mode(story.Widgets.length || story.Access === "READ" ? "view" : "edit");
      this._status();
      await this.byId("builder").bind(null, p);
    },

    // ---- chrome ---------------------------------------------------------------------------
    _status() {
      this.byId("dirty").setText(this._dirty ? "Unsaved changes" : "");
      this.byId("publish").setText(this._story.Status === "P" ? "Unpublish" : "Publish");
    },

    /** What the user may do with this story: someone with view access only looks at it. Owner-less and new stories are open. */
    _access() {
      const a = this._story.Access;
      const readOnly = a === "READ";
      this.byId("mode").getItems()[1].setVisible(!readOnly);
      this.byId("save").setVisible(!readOnly);
      this.byId("share").setVisible(a === "OWNER");
      this.byId("access").setText(a === "READ" ? "Shared with you by " + this._story.Owner + ": you can view" : a === "WRITE" && this._story.Owner && this._story.Owner !== "*" ? "Shared with you by " + this._story.Owner + ": you can edit" : a === "OWNER" ? "You are the owner" : "");
    },

    onShare() {
      this.guard(async () => {
        if (this._dirty) { throw new Error("Save the story first"); }
        const saved = await ShareDialog.open({ provider: this._p, kind: "STORY", id: this._story.Id });
        if (saved) { this.toast(saved.length ? "Sharing saved" : "Not shared with anyone"); }
      })();
    },

    _mode(key) {
      if (this._story && this._story.Access === "READ") { key = "view"; }
      const edit = key === "edit";
      this.byId("mode").setSelectedKey(key);
      this.byId("canvas").setEditable(edit);
      ["palette", "right", "addPage", "renamePage", "deletePage", "tidy", "dup", "del", "publish"].forEach((id) => this.byId(id).setVisible(edit));
      this.byId("name").setVisible(edit);
      this.byId("title").setVisible(!edit);
      this.byId("canvas").invalidate();
    },

    onMode(e) { this._mode(e.getParameter("item").getKey()); },

    _pages() {
      const bar = this.byId("pages");
      bar.destroyItems();
      this._story.Pages.forEach((pg) => bar.addItem(new SegmentedButtonItem({ key: String(pg.Id), text: pg.Title })));
      bar.setSelectedKey(String(this.byId("canvas").getPage()));
      bar.setVisible(true);
    },

    _palette() {
      const box = this.byId("palette");
      box.destroyItems();
      const groups = {};
      WidgetRegistry.list().forEach((d) => { (groups[d.group] = groups[d.group] || []).push(d); });
      Object.keys(groups).forEach((g) => {
        const list = new List({ headerText: g, mode: "None" });
        groups[g].forEach((d) => list.addItem(new StandardListItem({ title: d.name, icon: d.icon, type: "Active", tooltip: "Add " + d.name,
          press: this.guard(async () => { await this.byId("canvas").addWidget(d.type); }) })));
        box.addItem(list);
      });
    },

    onPage(e) {
      this.byId("canvas").setPageNumber(Number(e.getParameter("item").getKey()));
      this.byId("builder").bind(null, this._p);
      this._selectionButtons(false);
    },

    /** A button in the story moved to another page: the page bar follows. */
    onPageChanged(e) { this.byId("pages").setSelectedKey(String(e.getParameter("page"))); },

    _selectionButtons(on) { this.byId("dup").setEnabled(on); this.byId("del").setEnabled(on); },

    // ---- pages ---------------------------------------------------------------------------
    onAddPage() {
      const next = Math.max.apply(null, this._story.Pages.map((x) => x.Id)) + 1;
      this._story.Pages.push({ Id: next, Title: "Page " + next });
      this.byId("canvas").setPage(next);
      this._pages();
      this.byId("canvas").setPageNumber(next);
      this.onStoryChange();
    },

    onRenamePage() {
      const cur = this._story.Pages.find((x) => x.Id === this.byId("canvas").getPage());
      const input = new Input({ value: cur.Title, width: "100%" });
      const dlg = new Dialog({
        title: "Rename page", content: [this._margin({ items: [input] })],
        beginButton: new Button({ text: "OK", type: "Emphasized", press: () => { cur.Title = input.getValue() || cur.Title; dlg.close(); this._pages(); this.onStoryChange(); } }),
        endButton: new Button({ text: "Cancel", press: () => dlg.close() }), afterClose: () => dlg.destroy()
      });
      dlg.open();
    },

    onDeletePage: function () {
      this.guard(async () => {
        if (this._story.Pages.length < 2) { throw new Error("A story needs at least one page"); }
        const id = this.byId("canvas").getPage();
        if (!(await this.confirm("Delete this page and its widgets?", "Delete"))) { return; }
        this._story.Pages = this._story.Pages.filter((x) => x.Id !== id);
        this._story.Widgets = this._story.Widgets.filter((w) => w.Page !== id);
        const first = this._story.Pages[0].Id;
        const canvas = this.byId("canvas");
        canvas.setContext({ provider: this._p, story: this._story });
        canvas.setPage(first);
        this._pages();
        this.onStoryChange();
      })();
    },

    // ---- widgets -------------------------------------------------------------------------
    onSelect(e) {
      const id = e.getParameter("widgetId");
      const w = id ? this._story.Widgets.find((x) => x.Id === id) : null;
      this._selectionButtons(!!w);
      this.byId("builder").bind(w, this._p);
    },

    onBuilderChange(e) { this.byId("canvas").updateWidget(e.getParameter("widget").Id); },
    onRemoveWidget() { const w = this.byId("canvas").getSelected(); if (w) { this.byId("canvas").removeWidget(w.Id); } },
    onTidy() { if (!this.byId("canvas").tidy()) { this.toast("The page is already tidy"); } },

    onDuplicateWidget() { const w = this.byId("canvas").getSelected(); if (w) { this.byId("canvas").duplicateWidget(w.Id); } },

    // ---- story ---------------------------------------------------------------------------
    onStoryChange() { this._dirty = true; this._status(); this.byId("plan").setVisible(this.byId("canvas").hasPlanning()); },

    onName(e) { this._story.Name = e.getParameter("value"); this.byId("title").setText(this._story.Name); this.onStoryChange(); },

    onPublish() { this._story.Status = this._story.Status === "P" ? "D" : "P"; this.onStoryChange(); },

    onSave: function () {
      this.guard(async () => {
        const problems = StorySchema.validate(this._story);
        if (problems.length) { throw new Error(problems.join("\n")); }
        this._story.Filters = JSON.parse(JSON.stringify(this.byId("canvas").getFilters()));
        const saved = await this._p.saveStory(this._story);
        if (saved && saved.Owner !== undefined) { this._story.Owner = saved.Owner; this._story.Access = saved.Access; this._access(); } // a new story now has its owner
        this._dirty = false;
        this._status();
        this.toast("Story saved");
      })();
    }
  });
});
