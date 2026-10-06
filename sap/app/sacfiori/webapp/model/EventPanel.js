sap.ui.define([
  "sap/ui/core/Item",
  "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/Label", "sap/m/Text", "sap/m/Title", "sap/m/VBox", "sap/m/HBox", "sap/m/TextArea", "sap/m/DatePicker", "sap/m/StepInput",
  "sap/m/MessageStrip", "sap/m/MultiComboBox", "sap/m/ObjectStatus", "sap/m/Link", "sap/m/FlexItemData",
  "sap/m/MultiInput", "sap/m/Token", "sap/m/CheckBox", "sap/m/Dialog", "sap/m/List", "sap/m/StandardListItem", "sap/m/SearchField", "sap/m/MenuButton", "sap/m/Menu", "sap/m/MenuItem",
  "zsac/lib/calendar/CalendarEngine", "zsac/lib/calendar/TaskRunner", "zsac/lib/planning/DataActionRun", "zsac/lib/core/Access", "zsac/lib/core/WebContent", "zsac/lib/designer/ValueHelp"
], function (Item, Button, Input, Select, Label, Text, Title, VBox, HBox, TextArea, DatePicker, StepInput, MessageStrip, MultiComboBox, ObjectStatus, Link, FlexItemData,
  MultiInput, Token, CheckBox, Dialog, List, StandardListItem, SearchField, MenuButton, Menu, MenuItem, Engine, TaskRunner, Run, Access, WebContent, ValueHelp) {
  "use strict";

  const clone = (o) => JSON.parse(JSON.stringify(o));

  /**
   * The details of one event, on the right of the calendar: its fields, what can be done with its status, Save and Delete.
   *
   * EventPanel.show(box, { event, isNew, events, models, versions, provider, dataActions, multiActions, files, me, onRun(event), onOpenFile(file), onSaveTemplate(event), canEdit, canDelete, onSave(event), onDelete(event), onClose(), onOpenPlan(event) })
   * Nothing is written until Save; a status change on an event that exists is saved at once, as in SAC.
   */
  function show(box, ctx) {
    box.destroyItems();
    let draft = Engine.normalize(clone(ctx.event));
    const readOnly = ctx.canEdit === false;
    const users = ValueHelp.lazyUsers(ctx.provider);
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
    const decide = (action) => new Promise((resolve) => {
      // approving or rejecting asks for a comment (a rejection must say why); it is kept in the history of the event
      const comment = new TextArea({ rows: 3, width: "100%", maxLength: 255, placeholder: action === "Reject" ? "Say what has to change" : "Comment (optional)" });
      const err = new VBox();
      const dlg = new Dialog({ title: action + " " + draft.Title, contentWidth: "24rem", content: [new VBox({ items: [comment, err] }).addStyleClass("sapUiSmallMargin")],
        beginButton: new Button({ text: action, type: action === "Approve" ? "Accept" : "Reject", press: () => {
          if (action === "Reject" && !comment.getValue().trim()) { err.destroyItems(); err.addItem(new MessageStrip({ text: "A rejection needs a comment", type: "Error", showIcon: true })); return; }
          dlg.close(); resolve(comment.getValue().trim());
        } }), endButton: new Button({ text: "Cancel", press: () => { dlg.close(); resolve(undefined); } }), afterClose: () => dlg.destroy() });
      dlg.open();
    });
    const showFlow = () => {
      flow.destroyItems(); status.setText(Engine.STATUSES[draft.Status].label); status.setState(Engine.STATUSES[draft.Status].state);
      if (readOnly) { return; }
      Engine.actionsFor(draft).filter((a) => Engine.canDo(draft, a, ctx.me)).forEach((a) => flow.addItem(new Button({ text: a, type: a === "Approve" ? "Accept" : a === "Reject" || a === "Cancel" ? "Reject" : "Transparent", press: async () => {
        let comment = "";
        if (a === "Approve" || a === "Reject") { comment = await decide(a); if (comment === undefined) { return; } }
        draft = Engine.apply(draft, a, { user: ctx.me || "", comment }); progress.setValue(draft.Progress); showFlow(); showHistory();
        if (!ctx.isNew) { ctx.onSave(clone(draft), { keepOpen: true }); }
      } }).addStyleClass("sapUiTinyMarginEnd")));
      const waiting = Engine.actionsFor(draft).filter((a) => !Engine.canDo(draft, a, ctx.me));
      if (waiting.length) { flow.addItem(new Text({ text: "Only the reviewer (" + (draft.Approver || draft.Owner) + ") can " + waiting.join(" or ").toLowerCase() + "." }).addStyleClass("zsacSmall")); }
    };
    body.addItem(flow);
    const historyBox = new VBox();
    const showHistory = () => {
      historyBox.destroyItems();
      (draft.Config.History || []).slice().reverse().slice(0, 10).forEach((h) => historyBox.addItem(new Text({ text: Engine.describeHistory(h) }).addStyleClass("zsacCalHist")));
    };
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
    const color = new Select({ width: "100%", selectedKey: draft.Config.Color || "", enabled: !readOnly, change: (e) => { const k = e.getParameter("selectedItem").getKey(); if (k) { draft.Config.Color = k; } else { delete draft.Config.Color; } } });
    color.addItem(new Item({ key: "", text: "Standard" }));
    Object.keys(Engine.COLORS).forEach((k) => color.addItem(new Item({ key: k, text: k.charAt(0).toUpperCase() + k.slice(1) })));
    field("Colour", color);
    const remind = new Select({ width: "100%", selectedKey: String(draft.Config.Remind === undefined ? 3 : draft.Config.Remind), enabled: !readOnly, change: (e) => { draft.Config.Remind = Number(e.getParameter("selectedItem").getKey()); } });
    [["0", "Never"], ["1", "1 day before the end"], ["3", "3 days before the end"], ["7", "A week before the end"], ["14", "Two weeks before the end"]].forEach((o) => remind.addItem(new Item({ key: o[0], text: o[1] })));
    field("Remind the people on it", remind);
    if (draft.Type === "REVIEW" || draft.Approver) { field("Reviewer", ValueHelp.input({ items: users, title: "Users", value: draft.Approver, placeholder: "CFO", maxLength: 12, enabled: !readOnly, liveChange: (e) => { draft.Approver = e.getParameter("value"); showFlow(); } }), draft.Type === "REVIEW"); }

    // planning tasks: which action or version, the parameters kept for the run, what the last run did, and Run
    if (Engine.isRunnable(draft)) {
      body.addItem(new Title({ text: "Task", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
      const kind = draft.Type === "MULTIACTION" ? "MULTI" : "DATA";
      if (draft.Type === "DATAACTION" || draft.Type === "MULTIACTION") {
        const actions = (draft.Type === "DATAACTION" ? ctx.dataActions : ctx.multiActions) || [];
        const pick = new Select({ width: "100%", forceSelection: false, selectedKey: draft.Config.ActionId || "", enabled: !readOnly, change: (e) => {
          draft.Config.ActionId = e.getParameter("selectedItem").getKey(); draft.Config.Values = {};
          const a = actions.find((x) => x.Id === draft.Config.ActionId);
          if (a && a.ModelId) { draft.ModelId = a.ModelId; model.setSelectedKey(a.ModelId); draft.VersionId = ""; fillVersions(); }
        } });
        pick.addItem(new Item({ key: "", text: "(choose an action)" }));
        actions.forEach((a) => pick.addItem(new Item({ key: a.Id, text: a.Name })));
        field(draft.Type === "DATAACTION" ? "Data action" : "Multi action", pick, true);
        if (ctx.provider) {
          body.addItem(new Button({ text: "Parameters", icon: "sap-icon://syntax", type: "Transparent", enabled: !readOnly, press: async () => {
            if (!draft.Config.ActionId) { note("Choose the action first"); return; }
            const v = await Run.chooseValues({ provider: ctx.provider, kind, actionId: draft.Config.ActionId, values: draft.Config.Values });
            if (v) { draft.Config.Values = v; note("The parameters are kept when you save.", "Information"); }
          } }));
        }
      } else {
        const mode = new Select({ width: "100%", selectedKey: draft.Config.Mode === "UNLOCK" ? "UNLOCK" : "LOCK", enabled: !readOnly, change: (e) => { draft.Config.Mode = e.getParameter("selectedItem").getKey(); } });
        mode.addItem(new Item({ key: "LOCK", text: "Lock the version" })); mode.addItem(new Item({ key: "UNLOCK", text: "Unlock the version" }));
        field("What it does", mode);
      }
      const last = Engine.describeRun(draft);
      if (last) { body.addItem(new ObjectStatus({ text: last, state: draft.Config.LastRun.Status === "S" ? "Success" : "Error", icon: draft.Config.LastRun.Status === "S" ? "sap-icon://sys-enter-2" : "sap-icon://error" }).addStyleClass("sapUiTinyMarginTop")); }
      if (!ctx.isNew && ctx.onRun) {
        body.addItem(new Button({ text: "Run now", icon: "sap-icon://play", type: "Emphasized", press: () => {
          if (JSON.stringify(draft) !== JSON.stringify(Engine.normalize(clone(ctx.event)))) { note("Save your changes first: the task runs as it was saved."); return; }
          ctx.onRun(clone(draft));
        } }).addStyleClass("sapUiTinyMarginTop"));
        body.addItem(new Text({ text: "Runs now, from your browser. Nothing runs by itself on the start date." }).addStyleClass("zsacSmall"));
      }
    }


    // people: owners and assignees may edit the event, viewers look at it; only the owner of the event decides
    const open = !ctx.isNew && Access.isOpen(ctx.event.Owner);
    const canPeople = !readOnly && (ctx.isNew || ctx.event.Access === "OWNER");
    body.addItem(new Title({ text: "People", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
    const peopleInput = (label, key) => {
      const mi = new MultiInput({ width: "100%", placeholder: canPeople ? "User names" : "", enabled: canPeople, showValueHelp: false });
      ValueHelp.attachTokens(mi, users, "Users");
      mi.addValidator((args) => { const t = String(args.text || "").trim().toUpperCase(); return t && t !== "*" ? new Token({ key: t, text: t }) : null; });
      (draft.People[key] || []).filter((u) => u !== "*").forEach((u) => mi.addToken(new Token({ key: u, text: u })));
      mi.attachTokenUpdate(() => setTimeout(() => { const keep = key === "Viewers" && draft.People.Viewers.indexOf("*") >= 0 ? ["*"] : []; draft.People[key] = keep.concat(mi.getTokens().map((t) => t.getKey())); }, 0));
      field(label, mi);
    };
    peopleInput("Owners", "Owners"); peopleInput("Assignees", "Assignees"); peopleInput("Viewers", "Viewers");
    body.addItem(new CheckBox({ text: "Everyone can view", selected: draft.People.Viewers.indexOf("*") >= 0, enabled: canPeople, select: (e) => {
      draft.People.Viewers = draft.People.Viewers.filter((u) => u !== "*").concat(e.getParameter("selected") ? ["*"] : []);
    } }));
    body.addItem(new Text({ text: open ? "This event has no owner, so everyone can open and change it." : "The creator owns the event. Owners and assignees can edit it, viewers can look at it, and nobody else sees it." }).addStyleClass("zsacSmall"));

    // work files: stories, datasets, actions of this system and web addresses
    body.addItem(new Title({ text: "Work files", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
    const filesBox = new VBox();
    const showFiles = () => {
      filesBox.destroyItems();
      draft.Files.forEach((f, i) => filesBox.addItem(new HBox({ alignItems: "Center", items: [
        new Link({ text: Engine.FILE_TYPES[f.Type] + ": " + f.Name, wrapping: true, layoutData: new FlexItemData({ growFactor: 1 }), press: () => { if (ctx.onOpenFile) { ctx.onOpenFile(f); } } }),
        new Button({ icon: "sap-icon://decline", type: "Transparent", tooltip: "Remove", visible: !readOnly, press: () => { draft.Files.splice(i, 1); showFiles(); } })] })));
      if (!draft.Files.length) { filesBox.addItem(new Text({ text: "None" }).addStyleClass("zsacSmall")); }
    };
    const add = (f) => { try { draft.Files = Engine.addFile(draft, f); showFiles(); } catch (e) { note(e.message); } };
    const pickFile = () => {
      const q = new SearchField({ width: "100%", liveChange: (e) => fill(e.getParameter("newValue")) });
      const list = new List({ mode: "SingleSelectMaster", noDataText: "Nothing found", selectionChange: (e) => { const f = e.getParameter("listItem").data("file"); dlg.close(); add(f); } });
      const fill = (text) => {
        list.destroyItems();
        (ctx.files || []).filter((f) => !text || f.Name.toLowerCase().indexOf(String(text).toLowerCase()) >= 0).slice(0, 200)
          .forEach((f) => list.addItem(new StandardListItem({ title: f.Name, description: Engine.FILE_TYPES[f.Type] }).data("file", f)));
      };
      fill("");
      const dlg = new Dialog({ title: "Add a file", contentWidth: "24rem", contentHeight: "22rem", content: [new VBox({ items: [q, list] }).addStyleClass("sapUiSmallMargin")],
        endButton: new Button({ text: "Cancel", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
      dlg.open();
    };
    const pickUrl = () => {
      const url = new Input({ width: "100%", placeholder: "https://..." }); const name = new Input({ width: "100%", placeholder: "Name (optional)" });
      const err = new VBox();
      const dlg = new Dialog({ title: "Add a web address", contentWidth: "24rem", content: [new VBox({ items: [url, name, err] }).addStyleClass("sapUiSmallMargin")],
        beginButton: new Button({ text: "Add", type: "Emphasized", press: () => {
          const c = WebContent.check(url.getValue(), "page");
          if (!c.ok || !/^https?:/i.test(c.url)) { err.destroyItems(); err.addItem(new MessageStrip({ text: c.error || "Only http and https addresses can be added", type: "Error", showIcon: true })); return; }
          dlg.close(); add({ Type: "URL", Url: c.url, Name: name.getValue().trim() || c.url });
        } }), endButton: new Button({ text: "Cancel", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
      dlg.open();
    };
    body.addItem(filesBox);
    if (!readOnly) {
      const menu = new Menu({ itemSelected: (e) => { if (e.getParameter("item").data("t") === "URL") { pickUrl(); } else { pickFile(); } } });
      menu.addItem(new MenuItem({ text: "Story, dataset or action" }).data("t", "FILE")); menu.addItem(new MenuItem({ text: "Web address" }).data("t", "URL"));
      body.addItem(new MenuButton({ text: "Add file", icon: "sap-icon://add", type: "Transparent", menu }));
    }
    showFiles();

    body.addItem(new Title({ text: "Activity", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
    body.addItem(historyBox); showHistory();
    if (!(draft.Config.History || []).length) { historyBox.addItem(new Text({ text: "Nothing yet" }).addStyleClass("zsacSmall")); }
    if (!ctx.isNew && Engine.TYPES[draft.Type].container && ctx.hasChildren && ctx.onSaveTemplate && !readOnly) {
      body.addItem(new Button({ text: "Save as template", icon: "sap-icon://save", type: "Transparent", tooltip: "Keep this process and its tasks to start new ones from", press: () => ctx.onSaveTemplate(clone(draft)) }).addStyleClass("sapUiSmallMarginTop"));
    }
    const buttons = new HBox({ justifyContent: "End", items: [
      new Button({ text: "Delete", type: "Reject", visible: !ctx.isNew && ctx.canDelete !== false, press: () => ctx.onDelete(draft) }).addStyleClass("sapUiTinyMarginEnd"),
      new Button({ text: ctx.isNew ? "Create" : "Save", type: "Emphasized", visible: !readOnly, press: () => {
        const r = Engine.validate(draft, ctx.events);
        if (canPeople) { r.errors.push.apply(r.errors, Access.normalize(Engine.sharesOf(draft), "").errors); }
        if (r.errors.length) { note(r.errors.join("\n")); return; }
        note(r.warnings.join("\n"), "Warning");
        ctx.onSave(clone(draft), { shares: canPeople });
      } })] }).addStyleClass("sapUiSmallMarginTop");
    body.addItem(buttons); body.addItem(notes);
    if (readOnly) { body.addItem(new MessageStrip({ text: "You can look at this event but not change it.", type: "Information", showIcon: true }).addStyleClass("sapUiSmallMarginTop")); }
    box.addItem(head); box.addItem(body);
    showFlow();
    void title; void progress;
  }

  return { show };
});
