sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/core/Item",
  "sap/m/GroupHeaderListItem",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/Label", "sap/m/VBox", "sap/m/DatePicker",
  "zsac/lib/core/StorySchema"
], function (BaseController, JSONModel, Item, GroupHeaderListItem, Dialog, Button, Input, Select, Label, VBox, DatePicker, StorySchema) {
  "use strict";

  const STATUS = { OPEN: ["Open", "Information"], IN_REVIEW: ["In review", "Warning"], DONE: ["Done", "Success"] };

  /** Planning calendar: tasks and approvals tied to a model and version (submit, approve, reject). */
  return BaseController.extend("zsac.fiori.controller.Calendar", {
    onInit() {
      this._model = new JSONModel({ items: [] });
      this._filter = "ALL";
      this.getView().setModel(this._model, "view");
      this.onRoute("calendar", () => this._load());
    },

    groupHeader: (g) => new GroupHeaderListItem({ title: /^\d{4}-\d{2}$/.test(g.key) ? new Date(g.key + "-01").toLocaleDateString("en", { month: "long", year: "numeric" }) : g.key }),

    async _load() {
      this._p = await this.provider();
      this._tasks = await this._p.listTasks();
      this._render();
    },

    _render() {
      const today = new Date().toISOString().slice(0, 10);
      const items = this._tasks.filter((t) => this._filter === "ALL" || (this._filter === "MINE" ? t.Assignee === "ME" : t.Status === this._filter)).map((t) => Object.assign({}, t, {
        month: t.DueDate ? t.DueDate.slice(0, 7) : "No date",
        statusText: (STATUS[t.Status] || [t.Status])[0], statusState: (STATUS[t.Status] || [0, "None"])[1],
        dueState: t.Status !== "DONE" && t.DueDate && t.DueDate < today ? "Error" : "None"
      }));
      this._model.setProperty("/items", items);
    },

    _t(e) { const o = e.getSource().getBindingContext("view").getObject(); return this._tasks.find((t) => t.Id === o.Id); },

    async _set(e, status) { const t = this._t(e); t.Status = status; await this._p.saveTask(t); this._render(); },

    onFilter(e) { this._filter = e.getParameter("item").getKey(); this._render(); },
    onSubmit: function (e) { this.guard(() => this._set(e, "IN_REVIEW"))(e); },
    onApprove: function (e) { this.guard(async () => { await this._set(e, "DONE"); this.toast("Approved"); })(e); },
    onReject: function (e) { this.guard(() => this._set(e, "OPEN"))(e); },
    onOpenPlan(e) { const t = this._t(e); this.router().navTo("planning", { query: { model: t.ModelId, version: t.VersionId } }); },

    onDelete: function (e) {
      this.guard(async () => {
        const t = this._t(e);
        if (!(await this.confirm("Delete task " + t.Title + "?", "Delete"))) { return; }
        await this._p.deleteTask(t.Id);
        await this._load();
      })();
    },

    onNew: function () {
      this.guard(async () => {
        const models = await this._p.listModels();
        const versions = await this._p.listVersions();
        const title = new Input({ width: "100%" });
        const model = new Select({ width: "100%", forceSelection: false });
        const version = new Select({ width: "100%", forceSelection: false });
        const fill = () => { version.destroyItems(); versions.filter((v) => v.ModelId === model.getSelectedKey()).forEach((v) => version.addItem(new Item({ key: v.VersionId, text: v.Name + " (" + v.VersionId + ")" }))); };
        models.forEach((m) => model.addItem(new Item({ key: m.ModelId, text: m.Name })));
        model.attachChange(fill); fill();
        const due = new DatePicker({ width: "100%", valueFormat: "yyyy-MM-dd", displayFormat: "medium" });
        const who = new Input({ width: "100%", value: "ME" });
        const approver = new Input({ width: "100%", placeholder: "CFO" });
        const notes = new Input({ width: "100%" });
        const dlg = new Dialog({ title: "New task",
          content: [this._margin({ width: "24rem", items: [new Label({ text: "Title", required: true }), title, new Label({ text: "Plan" }), model, new Label({ text: "Version" }), version,
            new Label({ text: "Due" }), due, new Label({ text: "Assignee" }), who, new Label({ text: "Approver" }), approver, new Label({ text: "Notes" }), notes] })],
          beginButton: new Button({ text: "Create", type: "Emphasized", press: this.guard(async () => {
            if (!title.getValue().trim()) { throw new Error("Enter a title"); }
            await this._p.saveTask({ Id: StorySchema.uid("T"), Title: title.getValue().trim(), ModelId: model.getSelectedKey(), VersionId: version.getSelectedKey(), Assignee: who.getValue(),
              DueDate: due.getValue() || null, Status: "OPEN", Approver: approver.getValue(), Notes: notes.getValue() });
            dlg.close(); await this._load();
          }) }),
          endButton: new Button({ text: "Cancel", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
        dlg.open();
      })();
    }
  });
});
