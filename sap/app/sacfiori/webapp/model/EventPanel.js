sap.ui.define([
  "sap/ui/core/Item",
  "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/Label", "sap/m/Text", "sap/m/Title", "sap/m/VBox", "sap/m/HBox", "sap/m/TextArea", "sap/m/DatePicker", "sap/m/StepInput",
  "sap/m/MessageStrip", "sap/m/MultiComboBox", "sap/m/ObjectStatus", "sap/m/Link", "sap/m/FlexItemData",
  "zsac/lib/calendar/CalendarEngine"
], function (Item, Button, Input, Select, Label, Text, Title, VBox, HBox, TextArea, DatePicker, StepInput, MessageStrip, MultiComboBox, ObjectStatus, Link, FlexItemData, Engine) {
  "use strict";

  const clone = (o) => JSON.parse(JSON.stringify(o));

  /**
   * The details of one event, on the right of the calendar: its fields, what can be done with its status, Save and Delete.
   *
   * EventPanel.show(box, { event, isNew, events, models, versions, canEdit, canDelete, onSave(event), onDelete(event), onClose(), onOpenPlan(event) })
   * Nothing is written until Save; a status change on an event that exists is saved at once, as in SAC.
   */
  function show(box, ctx) {
    box.destroyItems();
    let draft = Engine.normalize(clone(ctx.event));
    const readOnly = ctx.canEdit === false;
    const notes = new VBox();
    const note = (text, type) => { notes.destroyItems(); if (text) { notes.addItem(new MessageStrip({ text, type: type || "Error", showIcon: true }).addStyleClass("sapUiTinyMarginTop")); } };
    const field = (label, control, required) => { body.addItem(new Label({ text: label, required: !!required })); body.addItem(control); return control; };
    const body = new VBox().addStyleClass("zsacCalPanelBody");
    const head = new HBox({ alignItems: "Center", justifyContent: "SpaceBetween", items: [
      new Title({ text: Engine.TYPES[draft.Type].label + (ctx.isNew ? " (new)" : ""), level: "H4" }),
      new Button({ icon: "sap-icon://decline", type: "Transparent", tooltip: "Close", press: () => ctx.onClose() })] }).addStyleClass("sapUiSmallMargin");

    const title = field("Title", new Input({ value: draft.Title, width: "100%", maxLength: 120, enabled: !readOnly, liveChange: (e) => { draft.Title = e.getParameter("value"); } }), true);
    const status = new ObjectStatus({ text: Engine.STATUSES[draft.Status].label, state: Engine.STATUSES[draft.Status].state, inverted: true }).addStyleClass("sapUiTinyMarginTop");
    body.addItem(new Label({ text: "Status" })); body.addItem(status);

    // status changes: the ones the status allows; saved at once for an event that exists
    const flow = new HBox({ wrap: "Wrap" });
    const showFlow = () => {
      flow.destroyItems(); status.setText(Engine.STATUSES[draft.Status].label); status.setState(Engine.STATUSES[draft.Status].state);
      if (readOnly) { return; }
      Engine.actionsFor(draft).forEach((a) => flow.addItem(new Button({ text: a, type: a === "Approve" ? "Accept" : a === "Reject" || a === "Cancel" ? "Reject" : "Transparent", press: () => {
        draft = Engine.apply(draft, a); progress.setValue(draft.Progress); showFlow();
        if (!ctx.isNew) { ctx.onSave(clone(draft), { keepOpen: true }); }
      } }).addStyleClass("sapUiTinyMarginEnd")));
    };
    body.addItem(flow);
    const progress = field("Progress (%)", new StepInput({ value: draft.Progress, min: 0, max: 100, step: 5, width: "9rem", enabled: !readOnly && !(Engine.TYPES[draft.Type].container && ctx.hasChildren),
      change: (e) => { draft.Progress = e.getParameter("value"); } }));
    if (Engine.TYPES[draft.Type].container && ctx.hasChildren) { body.addItem(new Text({ text: "A process shows the average progress of what is inside it." }).addStyleClass("zsacSmall")); }

    const start = new DatePicker({ valueFormat: "yyyy-MM-dd", displayFormat: "medium", value: draft.StartDate, width: "100%", enabled: !readOnly, change: (e) => { draft.StartDate = e.getParameter("value"); } });
    const end = new DatePicker({ valueFormat: "yyyy-MM-dd", displayFormat: "medium", value: draft.EndDate, width: "100%", enabled: !readOnly, change: (e) => { draft.EndDate = e.getParameter("value"); } });
    field("Start date", start, true); field("End date", end, true);
    field("Description", new TextArea({ value: draft.Description, rows: 3, width: "100%", maxLength: 255, enabled: !readOnly, liveChange: (e) => { draft.Description = e.getParameter("value"); } }));

    // where it sits: inside a process or a composite task, after other events
    const banned = new Set([draft.Id].concat(Array.from(Engine.descendants(ctx.events, draft.Id))));
    const parent = new Select({ width: "100%", selectedKey: draft.ParentId, enabled: !readOnly, change: (e) => { draft.ParentId = e.getParameter("selectedItem").getKey(); } });
    parent.addItem(new Item({ key: "", text: "(not inside another event)" }));
    ctx.events.map(Engine.normalize).filter((e) => Engine.TYPES[e.Type].container && !banned.has(e.Id)).forEach((e) => parent.addItem(new Item({ key: e.Id, text: e.Title })));
    field("Inside", parent);
    const others = ctx.events.map(Engine.normalize).filter((e) => !banned.has(e.Id));
    const after = new MultiComboBox({ width: "100%", selectedKeys: draft.Config.After || [], placeholder: "Waits for no other event", enabled: !readOnly,
      selectionFinish: (e) => { draft.Config.After = e.getParameter("selectedItems").map((i) => i.getKey()); } });
    others.forEach((e) => after.addItem(new Item({ key: e.Id, text: e.Title })));
    field("Starts after", after);

    // the plan it is about, and the reviewer of a review task
    const model = new Select({ width: "100%", selectedKey: draft.ModelId, enabled: !readOnly, change: (e) => { draft.ModelId = e.getParameter("selectedItem").getKey(); draft.VersionId = ""; fillVersions(); } });
    model.addItem(new Item({ key: "", text: "(no plan)" }));
    (ctx.models || []).forEach((m) => model.addItem(new Item({ key: m.ModelId, text: m.Name })));
    const version = new Select({ width: "100%", enabled: !readOnly, change: (e) => { draft.VersionId = e.getParameter("selectedItem").getKey(); } });
    const fillVersions = () => {
      version.destroyItems(); version.addItem(new Item({ key: "", text: "(no version)" }));
      (ctx.versions || []).filter((v) => v.ModelId === draft.ModelId).forEach((v) => version.addItem(new Item({ key: v.VersionId, text: v.Name + " (" + v.VersionId + ")" })));
      version.setSelectedKey(draft.VersionId || "");
    };
    field("Plan (model)", model); field("Version", version); fillVersions();
    if (draft.ModelId && draft.VersionId && ctx.onOpenPlan) { body.addItem(new Link({ text: "Open the plan", press: () => ctx.onOpenPlan(draft) })); }
    if (draft.Type === "REVIEW" || draft.Approver) { field("Reviewer", new Input({ value: draft.Approver, width: "100%", placeholder: "CFO", maxLength: 12, enabled: !readOnly, liveChange: (e) => { draft.Approver = e.getParameter("value"); showFlow(); } }), draft.Type === "REVIEW"); }

    const extra = (ctx.sections || []).map((build) => build({ box: body, draft: () => draft, readOnly, field })); // sections of later steps (task settings, people, files)
    void extra;

    const buttons = new HBox({ justifyContent: "End", items: [
      new Button({ text: "Delete", type: "Reject", visible: !ctx.isNew && ctx.canDelete !== false, press: () => ctx.onDelete(draft) }).addStyleClass("sapUiTinyMarginEnd"),
      new Button({ text: ctx.isNew ? "Create" : "Save", type: "Emphasized", visible: !readOnly, press: () => {
        const r = Engine.validate(draft, ctx.events);
        if (r.errors.length) { note(r.errors.join("\n")); return; }
        note(r.warnings.join("\n"), "Warning");
        ctx.onSave(clone(draft), {});
      } })] }).addStyleClass("sapUiSmallMarginTop");
    body.addItem(buttons); body.addItem(notes);
    if (readOnly) { body.addItem(new MessageStrip({ text: "You can look at this event but not change it.", type: "Information", showIcon: true }).addStyleClass("sapUiSmallMarginTop")); }
    box.addItem(head); box.addItem(body);
    showFlow();
    void title; void progress;
  }

  return { show };
});
