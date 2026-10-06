sap.ui.define([
  "./BaseController",
  "sap/ui/core/Item",
  "sap/ui/core/IconPool",
  "sap/m/MenuItem", "sap/m/Popover", "sap/m/List", "sap/m/StandardListItem", "sap/m/Title", "sap/m/Button",
  "sap/m/Dialog", "sap/m/Select", "sap/m/MultiComboBox", "sap/m/Input", "sap/m/Label", "sap/m/VBox", "sap/m/CheckBox", "sap/m/Text",
  "zsac/lib/calendar/CalendarEngine",
  "zsac/lib/calendar/CalendarView",
  "zsac/lib/core/StorySchema",
  "zsac/lib/calendar/TaskRunner",
  "zsac/lib/planning/DataActionRun",
  "../model/EventPanel",
  "../model/EventWizard"
], function (BaseController, Item, IconPool, MenuItem, Popover, List, StandardListItem, Title, Button, Dialog, Select, MultiComboBox, Input, Label, VBox, CheckBox, Text, Engine, View, StorySchema, TaskRunner, Run, EventPanel, EventWizard) {
  "use strict";

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const today = () => new Date().toISOString().slice(0, 10);
  const COLUMN_KEY = "zsac.calendar.columns";
  const DUE = { TODAY: "Due today", NEXT7: "Due in the next 7 days", NEXT30: "Due in the next 30 days", THIS_MONTH: "Due this month", OVERDUE: "Overdue" };
  const storedColumns = () => { try { const c = JSON.parse(window.localStorage.getItem(COLUMN_KEY)); return Array.isArray(c) && c.length ? c : null; } catch (e) { return null; } };

  /**
   * Planning calendar, as in SAC: a Calendar workspace (day, week and month) and a List workspace (a tree of events and processes with a
   * timeline); events open in a panel on the right. The data is in zsac.lib/calendar (CalendarEngine and CalendarView).
   */
  return BaseController.extend("zsac.fiori.controller.Calendar", {
    onInit() {
      this._space = "list";
      this._zoom = { calendar: "month", list: "month" };
      this._cursor = today();
      this._collapsed = new Set();
      this._selected = "";
      this._q = ""; this._mine = false;
      this._filters = { due: "", types: [], statuses: [], assignee: "", model: "" };
      this._columns = storedColumns() || View.DEFAULT_COLUMNS.slice();
      this._checked = new Set();
      this._events = []; this._templates = [];
      const menu = this.byId("newItems");
      [["GENERAL", 0], ["REVIEW", 0], ["COMPOSITE", 0], ["PROCESS", 0], ["TEMPLATE", 0], ["LOCK", 1], ["DATAACTION", 0], ["MULTIACTION", 0], ["WIZARD", 1]].forEach(([key, section]) => {
        const label = key === "TEMPLATE" ? "Process from Template" : key === "WIZARD" ? "Generate Events with Wizard" : Engine.TYPES[key].label;
        const icon = key === "TEMPLATE" ? "sap-icon://process" : key === "WIZARD" ? "sap-icon://wizard" : Engine.TYPES[key].icon;
        menu.addItem(new MenuItem({ text: label, icon, startsSection: !!section }).data("t", key));
      });
      ["Start", "Hold", "Resume", "Complete", "Cancel", "Reopen"].forEach((a) => this.byId("bulkItems").addItem(new MenuItem({ text: a }).data("a", a)));
      this.getView().addEventDelegate({ onAfterRendering: () => this._bind() }, this);
      this.onRoute("calendar", (args) => this._load().then(() => { if ((args["?query"] || {}).reminders) { this._openReminders(); } }));
    },

    // ---- data -------------------------------------------------------------------------------------------------------------------------
    async _load() {
      this._p = await this.provider();
      const [tasks, models, versions, me, das, mas, stories] = await Promise.all([this._p.listTasks(), this._p.listModels(), this._p.listVersions(), this._p.currentUser(),
        this._p.listDataActions(), this._p.listMultiActions(), this._p.listStories()]);
      const all = tasks.map(Engine.normalize);
      this._templates = Engine.savedTemplates(all); // saved processes are kept like events but are not events of the calendar
      this._events = all.filter((e) => !e.Config.Template); this._models = models; this._versions = versions; this._me = me; this._dataActions = das; this._multiActions = mas;
      // what a work file can point at: the stories, datasets and actions the user may open
      this._files = stories.map((x) => ({ Type: "STORY", Id: x.Id, Name: x.Name })).concat(models.map((x) => ({ Type: "MODEL", Id: x.ModelId, Name: x.Name })),
        das.map((x) => ({ Type: "DATAACTION", Id: x.Id, Name: x.Name })), mas.map((x) => ({ Type: "MULTIACTION", Id: x.Id, Name: x.Name })));
      if (this._selected && !this._events.some((e) => e.Id === this._selected)) { this._selected = ""; this._hidePanel(); }
      this._checked = new Set(Array.from(this._checked).filter((id) => this._events.some((e) => e.Id === id)));
      this._render();
      sap.ui.getCore().getEventBus().publish("zsac", "remindersChanged"); // the bell in the header counts them too
    },

    _rows() {
      const built = Engine.build(this._events, today());
      const f = this._filters;
      return Engine.filterRows(built.rows, { q: this._q, mine: this._mine, user: this._me, statuses: f.statuses, types: f.types, assignee: f.assignee, model: f.model, due: f.due ? Engine.dueRange(f.due, today()) : null });
    },

    _icon(name) {
      const info = IconPool.getIconInfo(name);
      return info ? '<span class="zsacCalIco" style="font-family:\'' + info.fontFamily + '\'">' + info.content + "</span>" : "";
    },

    // ---- drawing -------------------------------------------------------------------------------------------------------------------------
    _render() {
      const rows = this._rows();
      const t = today();
      const zoom = this._zoom[this._space];
      const opts = { selected: this._selected, icon: (n) => this._icon(n), today: t };
      let html;
      if (this._space === "list") {
        this._gantt = Engine.gantt(rows, { zoom, today: t });
        html = View.listHtml(rows, Object.assign({ collapsed: this._collapsed, gantt: this._gantt, columns: this._columns, selection: this._checked }, opts));
      } else if (zoom === "month") {
        const [y, m] = this._cursor.split("-").map(Number);
        html = View.gridHtml(Engine.monthGrid(rows, y, m, t), Object.assign({ mode: "month" }, opts));
      } else if (zoom === "week") {
        html = View.gridHtml([Engine.weekDays(rows, this._cursor, t)], Object.assign({ mode: "week" }, opts));
      } else {
        html = View.dayHtml(Engine.weekDays(rows, this._cursor, t).find((d) => d.date === this._cursor), opts);
      }
      this.byId("main").setContent("<div>" + html + "</div>");
      this.byId("space").setSelectedKey(this._space);
      this.byId("zoom").setSelectedKey(zoom);
      this.byId("yearItem").setVisible(this._space === "list");
      this.byId("period").setText(new Date(Engine.toDay(this._cursor) * 86400000).toLocaleDateString("en", zoom === "day" ? { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" } : { month: "long", year: "numeric", timeZone: "UTC" }));
      const due = Engine.reminders(this._events, this._me, t).length;
      this.byId("reminders").setText(String(due)); this.byId("reminders").setType(due ? "Emphasized" : "Default");
      const sel = this._events.find((e) => e.Id === this._selected);
      this.byId("copy").setEnabled(!!sel);
      this.byId("del").setEnabled(this._checked.size > 0 || (!!sel && sel.Access !== "READ"));
      this.byId("del").setTooltip(this._checked.size ? "Delete the " + this._checked.size + " checked events" : "Delete the selected event");
      this.byId("bulk").setEnabled(this._checked.size > 0);
      this._renderChips();
    },

    /** One chip for each filter that is on, to see what hides events and to take it off. */
    _renderChips() {
      const box = this.byId("chips"); const f = this._filters;
      box.destroyItems();
      const chip = (text, remove) => box.addItem(new Button({ text, icon: "sap-icon://decline", iconFirst: false, type: "Transparent", tooltip: "Remove this filter", press: () => { remove(); this._render(); } }));
      if (f.due) { chip(DUE[f.due], () => { f.due = ""; }); }
      if (f.types.length) { chip("Type: " + f.types.map((t) => Engine.TYPES[t].label).join(", "), () => { f.types = []; }); }
      if (f.statuses.length) { chip("Status: " + f.statuses.map((t) => Engine.STATUSES[t].label).join(", "), () => { f.statuses = []; }); }
      if (f.assignee) { chip("Assignee: " + f.assignee, () => { f.assignee = ""; }); }
      if (f.model) { const m = (this._models || []).find((x) => x.ModelId === f.model); chip("Plan: " + (m ? m.Name : f.model), () => { f.model = ""; }); }
      const on = box.getItems().length > 0;
      if (on) { box.addItem(new Button({ text: "Clear all", type: "Transparent", press: () => { this._filters = { due: "", types: [], statuses: [], assignee: "", model: "" }; this._render(); } })); }
      box.setVisible(on);
      this.byId("filters").setType(on ? "Emphasized" : "Default");
    },

    /** One set of listeners for the whole page: the content is replaced at every draw. */
    _bind() {
      const el = this.byId("mainScroll").getDomRef();
      if (!el || el.__zsacCal) { return; }
      el.__zsacCal = true;
      el.addEventListener("click", (e) => {
        if (this._dragged) { this._dragged = false; return; } // the click that ends a drag is not a selection
        const all = e.target.closest("[data-chk-all]");
        if (all) { const ids = View.visibleRows(this._rows(), this._collapsed).map((r) => r.event.Id); ids.forEach((id) => { if (all.checked) { this._checked.add(id); } else { this._checked.delete(id); } }); this._render(); return; }
        const chk = e.target.closest("[data-chk]");
        if (chk) { const id = chk.getAttribute("data-chk"); if (chk.checked) { this._checked.add(id); } else { this._checked.delete(id); } this._render(); return; }
        const tog = e.target.closest("[data-tog]");
        if (tog) { const id = tog.getAttribute("data-tog"); if (this._collapsed.has(id)) { this._collapsed.delete(id); } else { this._collapsed.add(id); } this._render(); return; }
        const more = e.target.closest(".zsacCalMore");
        if (more) { this._cursor = more.getAttribute("data-date"); this._zoom.calendar = "day"; this._render(); return; }
        const hit = e.target.closest("[data-id]");
        if (hit) { this._select(hit.getAttribute("data-id")); }
      });

      // a bar of the timeline is moved, or its start or end is, by dragging; the dates change in whole days
      el.addEventListener("pointerdown", (e) => {
        const bar = e.target.closest(".zsacCalGBar[data-drag]");
        if (!bar || e.button !== 0) { return; }
        const edge = e.target.closest(".zsacCalGH");
        const how = edge ? edge.getAttribute("data-edge") : "move";
        const ppd = Number(bar.closest(".zsacCalRight").getAttribute("data-ppd")) || 1;
        const x0 = e.clientX; const left0 = parseFloat(bar.style.left); const width0 = parseFloat(bar.style.width);
        const days = (ev) => Math.round((ev.clientX - x0) / ppd);
        try { bar.setPointerCapture(e.pointerId); } catch (err) { /* no capture: the move events still arrive while the pointer is over the bar */ }
        bar.classList.add("zsacCalGMoving");
        const move = (ev) => {
          const d = days(ev) * ppd;
          if (how === "move") { bar.style.left = left0 + d + "px"; }
          else if (how === "start") { bar.style.left = Math.min(left0 + d, left0 + width0 - ppd) + "px"; bar.style.width = Math.max(ppd, width0 - d) + "px"; }
          else { bar.style.width = Math.max(ppd, width0 + d) + "px"; }
        };
        const up = (ev) => {
          bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); bar.removeEventListener("pointercancel", up); bar.classList.remove("zsacCalGMoving");
          const d = days(ev);
          if (d !== 0) { this._dragged = true; setTimeout(() => { this._dragged = false; }, 300); this._reschedule(bar.getAttribute("data-id"), how, d); } else { bar.style.left = left0 + "px"; bar.style.width = width0 + "px"; }
        };
        bar.addEventListener("pointermove", move); bar.addEventListener("pointerup", up); bar.addEventListener("pointercancel", up);
      });

      // an event in the calendar is moved to another day by dragging it there
      el.addEventListener("dragstart", (e) => {
        const chip = e.target.closest && e.target.closest(".zsacCalChip[data-drag]");
        if (!chip) { return; }
        const from = chip.closest("[data-date]");
        e.dataTransfer.setData("text/plain", chip.getAttribute("data-id") + "|" + (from ? from.getAttribute("data-date") : ""));
        e.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragover", (e) => { const day = e.target.closest && e.target.closest(".zsacCalDay"); if (day) { e.preventDefault(); day.classList.add("zsacCalDrop"); } });
      el.addEventListener("dragleave", (e) => { const day = e.target.closest && e.target.closest(".zsacCalDay"); if (day) { day.classList.remove("zsacCalDrop"); } });
      el.addEventListener("drop", (e) => {
        const day = e.target.closest && e.target.closest(".zsacCalDay");
        if (!day) { return; }
        e.preventDefault(); day.classList.remove("zsacCalDrop");
        const [id, from] = String(e.dataTransfer.getData("text/plain")).split("|");
        const d = Engine.toDay(day.getAttribute("data-date")) - Engine.toDay(from);
        if (id && from && d) { this._reschedule(id, "move", d); }
      });
    },

    async _reschedule(id, how, days) {
      try {
        const ev = this._events.find((x) => x.Id === id);
        if (!ev) { return; }
        const moved = Engine.reschedule(ev, how, days);
        await this._p.saveTask(Engine.toRecord(moved));
        await this._load();
        if (this._selected === id) { this._showPanel(this._events.find((x) => x.Id === id), false); }
        this.toast(moved.Title + ": " + moved.StartDate + " to " + moved.EndDate);
      } catch (e) { this.fail(e); await this._load(); }
    },

    _scrollToCursor() {
      if (this._space !== "list" || !this._gantt) { return; }
      setTimeout(() => {
        const left = this.byId("main").getDomRef() && this.byId("main").getDomRef().querySelector(".zsacCalLeft");
        const x = (Engine.toDay(this._cursor) - Engine.toDay(this._gantt.from)) * this._gantt.ppd + (left ? left.offsetWidth : 0) - 360;
        this.byId("mainScroll").scrollTo(Math.max(0, x), 0, 150);
      }, 0);
    },

    // ---- toolbar ---------------------------------------------------------------------------------------------------------------------
    onSpace(e) { this._space = e.getParameter("item").getKey(); this._render(); this._scrollToCursor(); },
    onZoom(e) { this._zoom[this._space] = e.getParameter("item").getKey(); this._render(); this._scrollToCursor(); },
    onSearch(e) { this._q = e.getParameter("newValue") || ""; this._render(); },

    onFilters() {
      const f = this._filters;
      const due = new Select({ width: "100%", selectedKey: f.due });
      due.addItem(new Item({ key: "", text: "Any time" })); Object.keys(DUE).forEach((k) => due.addItem(new Item({ key: k, text: DUE[k] })));
      const types = new MultiComboBox({ width: "100%", selectedKeys: f.types, placeholder: "All types" });
      Object.keys(Engine.TYPES).forEach((k) => types.addItem(new Item({ key: k, text: Engine.TYPES[k].label })));
      const statuses = new MultiComboBox({ width: "100%", selectedKeys: f.statuses, placeholder: "All statuses" });
      Object.keys(Engine.STATUSES).forEach((k) => statuses.addItem(new Item({ key: k, text: Engine.STATUSES[k].label })));
      const who = new Input({ width: "100%", value: f.assignee, placeholder: "User name" });
      const model = new Select({ width: "100%", selectedKey: f.model });
      model.addItem(new Item({ key: "", text: "Any plan" })); (this._models || []).forEach((m) => model.addItem(new Item({ key: m.ModelId, text: m.Name })));
      const dlg = new Dialog({ title: "Filter events", contentWidth: "24rem", content: [new VBox({ items: [new Label({ text: "Due" }), due, new Label({ text: "Type" }), types, new Label({ text: "Status" }), statuses,
        new Label({ text: "Assignee" }), who, new Label({ text: "Plan" }), model] }).addStyleClass("sapUiSmallMargin")],
      beginButton: new Button({ text: "Apply", type: "Emphasized", press: () => { this._filters = { due: due.getSelectedKey(), types: types.getSelectedKeys(), statuses: statuses.getSelectedKeys(), assignee: who.getValue().trim(), model: model.getSelectedKey() }; dlg.close(); this._render(); } }),
      endButton: new Button({ text: "Cancel", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
      dlg.open();
    },

    onColumns(e) {
      const box = new VBox().addStyleClass("sapUiSmallMargin");
      const labels = View.COLUMNS;
      Object.keys(labels).forEach((k) => box.addItem(new CheckBox({ text: labels[k].label, selected: this._columns.indexOf(k) >= 0, select: (ev) => {
        const on = ev.getParameter("selected");
        this._columns = Object.keys(labels).filter((c) => (c === k ? on : this._columns.indexOf(c) >= 0));
        try { window.localStorage.setItem(COLUMN_KEY, JSON.stringify(this._columns)); } catch (err) { /* not kept */ }
        this._render();
      } })));
      const pop = new Popover({ title: "Columns", placement: "Bottom", content: [box, new Text({ text: "The narrower the list, the fewer columns fit: the least important drop out first." }).addStyleClass("sapUiSmallMarginBegin sapUiSmallMarginBottom zsacSmall")], afterClose: () => pop.destroy() });
      pop.openBy(e.getSource());
    },

    onExport() {
      const csv = "\uFEFF" + Engine.toCsv(this._rows());
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = "calendar-" + today() + ".csv"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    /** The same status change for every checked event it is possible for (and the user may change); says how many it did. */
    onBulkStatus(e) {
      const action = e.getParameter("item").data("a");
      this.guard(async () => {
        let done = 0; const skipped = [];
        for (const id of Array.from(this._checked)) {
          const ev = this._events.find((x) => x.Id === id);
          if (!ev) { continue; }
          if (ev.Access === "READ" || Engine.actionsFor(ev).indexOf(action) < 0 || !Engine.canDo(ev, action, this._me)) { skipped.push(ev.Title); continue; }
          const changed = Engine.apply(ev, action, { user: this._me || "" });
          await this._p.saveTask(Engine.toRecord(changed));
          done++;
        }
        await this._load();
        for (const id of Array.from(this._checked)) { const ev = this._events.find((x) => x.Id === id); if (ev) { await this._advance(ev); } }
        this.toast(action + ": " + done + " changed" + (skipped.length ? ", " + skipped.length + " not possible for their status or your access" : ""));
      })();
    },
    onMine(e) { this._mine = e.getSource().getPressed(); this._render(); },
    onRefresh: function () { this.guard(() => this._load())(); },

    _shift(dir) {
      const z = this._zoom[this._space];
      if (this._space === "calendar") {
        this._cursor = z === "month" ? Engine.addMonths(this._cursor, dir) : Engine.addDays(this._cursor, z === "week" ? 7 * dir : dir);
      } else {
        this._cursor = Engine.addDays(this._cursor, dir * { day: 7, week: 28, month: 90, year: 365 }[z]);
      }
      this._render(); this._scrollToCursor();
    },
    onPrev() { this._shift(-1); },
    onNext() { this._shift(1); },
    onToday() { this._cursor = today(); this._render(); this._scrollToCursor(); },

    // ---- the panel -------------------------------------------------------------------------------------------------------------------
    _hidePanel() { const p = this.byId("panel"); p.destroyItems(); p.setVisible(false); },

    _showPanel(event, isNew) {
      const panel = this.byId("panel");
      const children = this._events.some((e) => e.ParentId === event.Id);
      EventPanel.show(panel, {
        event, isNew, events: this._events.filter((e) => e.Id !== event.Id || !isNew), models: this._models, versions: this._versions, hasChildren: children,
        provider: this._p, me: this._me, dataActions: this._dataActions, multiActions: this._multiActions, files: this._files, onRun: (e) => this._runTask(e), onSaveTemplate: (e) => this._saveTemplate(e), onOpenFile: (f) => this._openFile(f),
        canEdit: event.Access !== "READ", canDelete: event.Access === "OWNER" || !event.Owner,
        onSave: (e, o) => this._save(e, isNew, o), onDelete: (e) => this._deleteEvent(e), onClose: () => { this._selected = ""; this._hidePanel(); this._render(); },
        onOpenPlan: (e) => this.router().navTo("planning", { query: { model: e.ModelId, version: e.VersionId } })
      });
      panel.setVisible(true);
    },

    _select(id) {
      const e = this._events.find((x) => x.Id === id);
      if (!e) { return; }
      this._selected = id;
      this._showPanel(e, false);
      this._render();
    },

    async _save(event, isNew, opts) {
      try {
        await this._p.saveTask(Engine.toRecord(event));
        // who may see and edit the event is kept as shares; only the owner of the event can change them
        if (opts && opts.shares && this._p.capabilities && this._p.capabilities.sharing) { await this._p.saveShares("CALEVENT", event.Id, Engine.sharesOf(event)).catch((err) => { this.fail(err); }); }
        await this._load();
        const started = await this._advance(event);
        this._selected = event.Id;
        this._showPanel(this._events.find((e) => e.Id === event.Id) || event, false);
        this._render();
        this.toast((isNew ? "Event created" : "Saved") + (started.length ? ". Started: " + started.map((x) => x.Title).join(", ") : ""));
      } catch (e) { this.fail(e); }
      void opts;
    },

    /** A completed event starts the ones that waited for it (see CalendarEngine.advance). Returns the events it started. */
    async _advance(event) {
      if (event.Status !== "DONE") { return []; }
      const started = Engine.advance(this._events, event.Id);
      for (const e of started) { await this._p.saveTask(Engine.toRecord(e)); }
      if (started.length) { await this._load(); }
      return started;
    },

    // ---- reminders -----------------------------------------------------------------------------------------------------------------------
    onReminders() { this._openReminders(); },

    _openReminders() {
      const items = Engine.reminders(this._events, this._me, today());
      const ICON = { REVIEW: "sap-icon://approvals", OVERDUE: "sap-icon://alert", DELAYED: "sap-icon://past", DUE_SOON: "sap-icon://history", STARTING: "sap-icon://begin" };
      const STATE = { REVIEW: "Warning", OVERDUE: "Error", DELAYED: "Warning", DUE_SOON: "Information", STARTING: "Success" };
      const list = new List({ noDataText: "Nothing needs your attention", items: items.map((r) => new StandardListItem({ title: r.title, description: r.text, icon: ICON[r.kind], info: r.kind === "REVIEW" ? "Review" : r.kind === "OVERDUE" ? "Overdue" : r.kind === "DELAYED" ? "Delayed" : r.kind === "DUE_SOON" ? "Soon" : "Starts",
        infoState: STATE[r.kind], type: "Active", press: () => { pop.close(); this._focus(r.Id); } })) });
      const pop = new Popover({ title: "Reminders", contentWidth: "24rem", placement: "Bottom", content: [list], afterClose: () => pop.destroy(),
        endButton: new Button({ text: "Close", press: () => pop.close() }) });
      pop.openBy(this.byId("reminders"));
    },

    /** Shows an event: selects it and moves the page to its dates. */
    _focus(id) {
      const e = this._events.find((x) => x.Id === id);
      if (!e) { return; }
      this._cursor = e.StartDate || this._cursor;
      this._select(id);
      this._scrollToCursor();
    },

    _openFile(f) {
      if (f.Type === "URL") { window.open(f.Url, "_blank", "noopener,noreferrer"); return; }
      const route = { STORY: "story", MODEL: "modeller", DATAACTION: "dataaction", MULTIACTION: "multiaction" }[f.Type];
      if (route) { this.navTo(route, { id: f.Id }); }
    },

    // ---- running a planning task ------------------------------------------------------------------------------------------------------
    /** Data action and multi action tasks are run in the dialog of the action (parameters kept in the task, trace of the result); a locking task asks first. */
    _runTask(event) {
      const record = async (outcome) => {
        const current = this._events.find((x) => x.Id === event.Id) || event;
        const updated = Engine.afterRun(current, outcome);
        await this._p.saveTask(Engine.toRecord(updated));
        await this._load();
        const started = await this._advance(updated);
        this._select(event.Id);
        if (started.length) { this.toast("Started: " + started.map((x) => x.Title).join(", ")); }
      };
      const done = (outcome) => record(outcome).catch((e) => this.fail(e));
      if (event.Type === "DATAACTION") {
        Run.open({ provider: this._p, actionId: event.Config.ActionId, values: event.Config.Values,
          onDone: (r, err) => done(r ? { ok: true, message: r.Changed + " values changed" } : { ok: false, message: err && err.message }) });
      } else if (event.Type === "MULTIACTION") {
        Run.openMulti({ provider: this._p, actionId: event.Config.ActionId, values: event.Config.Values,
          onDone: (r) => done({ ok: r.Status === "S", message: r.Status === "S" ? "Done" + (r.Changed ? ", " + r.Changed + " values changed" : "") : "Stopped at a failing step" }) });
      } else if (event.Type === "LOCK") {
        this.guard(async () => {
          if (!(await this.confirm(TaskRunner.target(event) + "?", "Run"))) { return; }
          let outcome;
          try { outcome = await TaskRunner.lock(this._p, event); } catch (e) { outcome = { ok: false, message: e.message }; }
          await record(outcome);
          this.toast(outcome.message);
        })();
      }
    },

    // ---- new, copy, delete ------------------------------------------------------------------------------------------------------------
    onNewItem(e) {
      const key = e.getParameter("item").data("t");
      this.guard(async () => {
        const sel = this._events.find((x) => x.Id === this._selected);
        const parentId = sel && Engine.TYPES[sel.Type].container ? sel.Id : (sel ? sel.ParentId : "");
        if (key === "WIZARD" || key === "TEMPLATE") {
          const made = await (key === "WIZARD" ? EventWizard.generate : EventWizard.fromTemplate)({ models: this._models, versions: this._versions, parentId, saved: this._templates, deleteTemplate: async (id) => { await this._p.deleteTask(id); await this._load(); } });
          if (!made) { return; }
          for (const ev of made) { await this._p.saveTask(Engine.toRecord(ev)); }
          this._cursor = made[0].StartDate;
          await this._load();
          this._selected = made[0].Id; this._showPanel(this._events.find((x) => x.Id === made[0].Id), false); this._render(); this._scrollToCursor();
          this.toast(made.length + " events created");
          return;
        }
        const start = today();
        const days = Engine.TYPES[key].container ? 13 : key === "LOCK" ? 0 : 6;
        const me = this._me ? [this._me] : [];
        const draft = Engine.normalize({ Id: EventWizard.newId(), Type: key, Title: "", Status: "OPEN", StartDate: start, EndDate: Engine.addDays(start, days), ParentId: key === "PROCESS" ? "" : parentId, People: { Owners: me, Assignees: me, Viewers: [] } });
        this._selected = ""; this._showPanel(draft, true); this._render();
      })();
    },

    onCopy() {
      const sel = this._events.find((x) => x.Id === this._selected);
      if (!sel) { return; }
      const copy = Engine.normalize(Object.assign(clone(sel), { Id: EventWizard.newId(), Title: sel.Title + " (copy)", Status: "OPEN", Progress: 0, Owner: undefined, Access: undefined }));
      this._selected = ""; this._showPanel(copy, true); this._render();
    },

    onDelete() {
      if (this._checked.size) { this._deleteChecked(); return; }
      const sel = this._events.find((x) => x.Id === this._selected);
      if (sel) { this._deleteEvent(sel); }
    },

    /** The checked events and everything inside them, the tasks of a process first. */
    _deleteChecked() {
      this.guard(async () => {
        const ids = new Set(); Array.from(this._checked).forEach((id) => { ids.add(id); Engine.descendants(this._events, id).forEach((d) => ids.add(d)); });
        if (!(await this.confirm("Delete " + ids.size + " event" + (ids.size > 1 ? "s" : "") + " (the checked ones and what is inside them)?", "Delete"))) { return; }
        const depth = (id) => { let n = 0; let e = this._events.find((x) => x.Id === id); const seen = new Set(); while (e && e.ParentId && !seen.has(e.Id)) { seen.add(e.Id); n++; e = this._events.find((x) => x.Id === e.ParentId); } return n; };
        const failed = [];
        for (const id of Array.from(ids).sort((a, b) => depth(b) - depth(a))) { try { await this._p.deleteTask(id); } catch (err) { failed.push(err.message); } }
        this._checked.clear(); this._selected = ""; this._hidePanel();
        await this._load();
        if (failed.length) { this.fail(new Error(failed.length + " could not be deleted: " + failed[0])); }
      })();
    },

    /** A process and the tasks directly inside it are kept as a template (an event that is not shown), to start new processes from. */
    _saveTemplate(event) {
      const name = new Input({ width: "100%", value: event.Title });
      const dlg = new Dialog({ title: "Save as template", contentWidth: "22rem", content: [new VBox({ items: [new Label({ text: "Name of the template" }), name] }).addStyleClass("sapUiSmallMargin")],
        beginButton: new Button({ text: "Save", type: "Emphasized", press: this.guard(async () => {
          const tpl = Engine.toTemplate(event.Id, this._events);
          tpl.Title = name.getValue().trim() || event.Title;
          await this._p.saveTask(Engine.toRecord(tpl));
          dlg.close(); await this._load();
          this.toast("Template saved: it is in New, Process from Template");
        }) }), endButton: new Button({ text: "Cancel", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
      dlg.open();
    },

    _deleteEvent(event) {
      this.guard(async () => {
        const below = Array.from(Engine.descendants(this._events, event.Id));
        const text = "Delete \"" + event.Title + "\"" + (below.length ? " and the " + below.length + " event" + (below.length > 1 ? "s" : "") + " inside it" : "") + "?";
        if (!(await this.confirm(text, "Delete"))) { return; }
        for (const id of below.reverse()) { await this._p.deleteTask(id); }
        await this._p.deleteTask(event.Id);
        this._selected = ""; this._hidePanel();
        await this._load();
      })();
    }
  });
});
