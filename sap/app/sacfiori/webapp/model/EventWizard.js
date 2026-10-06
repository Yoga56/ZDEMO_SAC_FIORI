sap.ui.define([
  "sap/ui/core/Item",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/Label", "sap/m/VBox", "sap/m/DatePicker", "sap/m/StepInput", "sap/m/Text", "sap/m/MessageStrip",
  "zsac/lib/calendar/CalendarEngine", "zsac/lib/core/StorySchema", "zsac/lib/designer/ValueHelp"
], function (Item, Dialog, Button, Input, Select, Label, VBox, DatePicker, StepInput, Text, MessageStrip, Engine, StorySchema, ValueHelp) {
  "use strict";

  const newId = () => StorySchema.uid("E");
  const today = () => new Date().toISOString().slice(0, 10);

  function dialog(title, controls, onCreate) {
    const strip = new VBox();
    const dlg = new Dialog({ title, contentWidth: "26rem", content: [new VBox({ items: controls.concat([strip]) }).addStyleClass("sapUiSmallMargin")],
      beginButton: new Button({ text: "Create", type: "Emphasized", press: () => {
        try { const made = onCreate(); dlg.close(); dlg.__resolve(made); } catch (e) { strip.destroyItems(); strip.addItem(new MessageStrip({ text: e.message, type: "Error", showIcon: true }).addStyleClass("sapUiTinyMarginTop")); }
      } }),
      endButton: new Button({ text: "Cancel", press: () => { dlg.close(); dlg.__resolve(undefined); } }), afterClose: () => dlg.destroy() });
    return new Promise((resolve) => { dlg.__resolve = resolve; dlg.open(); });
  }

  const plan = (models, versions) => {
    const model = new Select({ width: "100%", forceSelection: false });
    const version = new Select({ width: "100%", forceSelection: false });
    model.addItem(new Item({ key: "", text: "(no plan)" }));
    models.forEach((m) => model.addItem(new Item({ key: m.ModelId, text: m.Name })));
    const fill = () => { version.destroyItems(); version.addItem(new Item({ key: "", text: "(no version)" })); versions.filter((v) => v.ModelId === model.getSelectedKey()).forEach((v) => version.addItem(new Item({ key: v.VersionId, text: v.Name + " (" + v.VersionId + ")" }))); };
    model.attachChange(fill); fill();
    return { model, version, controls: [new Label({ text: "Plan (model)" }), model, new Label({ text: "Version" }), version] };
  };

  /** "Generate events with wizard": the same event again and again. Resolves to the new events, or undefined. */
  function generate(ctx) {
    const title = new Input({ width: "100%", placeholder: "e.g. Close books" });
    const type = new Select({ width: "100%" });
    ["GENERAL", "REVIEW", "COMPOSITE", "PROCESS", "LOCK"].forEach((t) => type.addItem(new Item({ key: t, text: Engine.TYPES[t].label })));
    const start = new DatePicker({ width: "100%", valueFormat: "yyyy-MM-dd", displayFormat: "medium", value: today() });
    const days = new StepInput({ value: 1, min: 1, max: 366, width: "8rem" });
    const repeat = new Select({ width: "100%", selectedKey: "MONTHLY" });
    [["DAILY", "Every day"], ["WEEKLY", "Every week"], ["MONTHLY", "Every month"], ["QUARTERLY", "Every quarter"], ["YEARLY", "Every year"]].forEach((r) => repeat.addItem(new Item({ key: r[0], text: r[1] })));
    const count = new StepInput({ value: 12, min: 1, max: 60, width: "8rem" });
    const approver = ValueHelp.input({ items: ValueHelp.lazyUsers(ctx.provider), title: "Users", placeholder: "CFO (review tasks)", maxLength: 12 });
    const p = plan(ctx.models, ctx.versions);
    return dialog("Generate events", [new Label({ text: "Title", required: true }), title, new Label({ text: "Type" }), type, new Label({ text: "First start" }), start,
      new Label({ text: "Lasts (days)" }), days, new Label({ text: "Repeats" }), repeat, new Label({ text: "How many events (1 to 60)" }), count].concat(p.controls, [new Label({ text: "Reviewer" }), approver]), () => {
      if (!title.getValue().trim()) { throw new Error("Enter a title"); }
      return Engine.generate({ Title: title.getValue().trim(), Type: type.getSelectedKey(), Start: start.getValue(), Days: days.getValue(), Repeat: repeat.getSelectedKey(), Count: count.getValue(),
        ModelId: p.model.getSelectedKey(), VersionId: p.version.getSelectedKey(), Approver: approver.getValue().trim(), ParentId: ctx.parentId || "", newId });
    });
  }

  /** "Process from template": a process with its tasks. Resolves to the new events, or undefined. */
  function fromTemplate(ctx) {
    let templates = Engine.TEMPLATES.concat(ctx.saved || []); // the built-in ones and the processes the user saved as templates
    const tpl = new Select({ width: "100%" });
    const fill = () => { tpl.destroyItems(); templates.forEach((t) => tpl.addItem(new Item({ key: t.id, text: t.name + (t.saved ? " (saved)" : "") }))); };
    fill();
    const current = () => templates.find((t) => t.id === tpl.getSelectedKey()) || templates[0];
    const info = new Text({ text: templates[0].description + " " + templates[0].steps.length + " tasks." }).addStyleClass("zsacSmall");
    const drop = new Button({ text: "Delete this template", type: "Reject", visible: false, press: async () => {
      const t = current();
      try { await ctx.deleteTemplate(t.id); templates = templates.filter((x) => x.id !== t.id); fill(); tpl.setSelectedKey(templates[0].id); tpl.fireChange({ selectedItem: tpl.getSelectedItem() }); } catch (e) { info.setText(e.message); }
    } });
    tpl.attachChange(() => { const t = current(); info.setText((t.description ? t.description + " " : "") + t.steps.length + " tasks."); drop.setVisible(!!t.saved); });
    const title = new Input({ width: "100%", placeholder: "Name of the process (e.g. Budget 2027)" });
    const start = new DatePicker({ width: "100%", valueFormat: "yyyy-MM-dd", displayFormat: "medium", value: today() });
    const approver = ValueHelp.input({ items: ValueHelp.lazyUsers(ctx.provider), title: "Users", placeholder: "CFO", maxLength: 12 });
    const p = plan(ctx.models, ctx.versions);
    return dialog("Process from template", [new Label({ text: "Template" }), tpl, info, drop, new Label({ text: "Name" }), title, new Label({ text: "Start" }), start].concat(p.controls, [new Label({ text: "Reviewer of the review tasks" }), approver]), () =>
      Engine.instantiate(current(), { Title: title.getValue().trim(), Start: start.getValue(), ModelId: p.model.getSelectedKey(), VersionId: p.version.getSelectedKey(),
        Approver: approver.getValue().trim(), ParentId: ctx.parentId || "", newId }));
  }

  return { generate, fromTemplate, newId };
});
