sap.ui.define([
  "./BaseController",
  "sap/ui/core/Item",
  "sap/ui/core/IconPool",
  "sap/m/MenuItem",
  "zsac/lib/calendar/CalendarEngine",
  "zsac/lib/calendar/CalendarView",
  "zsac/lib/core/StorySchema",
  "zsac/lib/calendar/TaskRunner",
  "zsac/lib/planning/DataActionRun",
  "../model/EventPanel",
  "../model/EventWizard"
], function (BaseController, Item, IconPool, MenuItem, Engine, View, StorySchema, TaskRunner, Run, EventPanel, EventWizard) {
  "use strict";

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const today = () => new Date().toISOString().slice(0, 10);

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
      this._q = ""; this._status = ""; this._mine = false;
      this._events = [];
      const menu = this.byId("newItems");
      [["GENERAL", 0], ["REVIEW", 0], ["COMPOSITE", 0], ["PROCESS", 0], ["TEMPLATE", 0], ["LOCK", 1], ["DATAACTION", 0], ["MULTIACTION", 0], ["WIZARD", 1]].forEach(([key, section]) => {
        const label = key === "TEMPLATE" ? "Process from Template" : key === "WIZARD" ? "Generate Events with Wizard" : Engine.TYPES[key].label;
        const icon = key === "TEMPLATE" ? "sap-icon://process" : key === "WIZARD" ? "sap-icon://wizard" : Engine.TYPES[key].icon;
        menu.addItem(new MenuItem({ text: label, icon, startsSection: !!section }).data("t", key));
      });
      const status = this.byId("statusFilter");
      status.addItem(new Item({ key: "", text: "All statuses" }));
      Object.keys(Engine.STATUSES).forEach((k) => status.addItem(new Item({ key: k, text: Engine.STATUSES[k].label })));
      this.getView().addEventDelegate({ onAfterRendering: () => this._bind() }, this);
      this.onRoute("calendar", () => this._load());
    },

    // ---- data -------------------------------------------------------------------------------------------------------------------------
    async _load() {
      this._p = await this.provider();
      const [tasks, models, versions, me, das, mas, stories] = await Promise.all([this._p.listTasks(), this._p.listModels(), this._p.listVersions(), this._p.currentUser(),
        this._p.listDataActions(), this._p.listMultiActions(), this._p.listStories()]);
      this._events = tasks.map(Engine.normalize); this._models = models; this._versions = versions; this._me = me; this._dataActions = das; this._multiActions = mas;
      // what a work file can point at: the stories, datasets and actions the user may open
      this._files = stories.map((x) => ({ Type: "STORY", Id: x.Id, Name: x.Name })).concat(models.map((x) => ({ Type: "MODEL", Id: x.ModelId, Name: x.Name })),
        das.map((x) => ({ Type: "DATAACTION", Id: x.Id, Name: x.Name })), mas.map((x) => ({ Type: "MULTIACTION", Id: x.Id, Name: x.Name })));
      if (this._selected && !this._events.some((e) => e.Id === this._selected)) { this._selected = ""; this._hidePanel(); }
      this._render();
    },

    _rows() {
      const built = Engine.build(this._events, today());
      return Engine.filterRows(built.rows, { q: this._q, status: this._status, mine: this._mine, user: this._me });
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
        html = View.listHtml(rows, Object.assign({ collapsed: this._collapsed, gantt: this._gantt }, opts));
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
      const sel = this._events.find((e) => e.Id === this._selected);
      this.byId("copy").setEnabled(!!sel);
      this.byId("del").setEnabled(!!sel && sel.Access !== "READ");
    },

    /** One listener for the whole page: the content is replaced at every draw. */
    _bind() {
      const el = this.byId("mainScroll").getDomRef();
      if (!el || el.__zsacCal) { return; }
      el.__zsacCal = true;
      el.addEventListener("click", (e) => {
        const tog = e.target.closest("[data-tog]");
        if (tog) { const id = tog.getAttribute("data-tog"); if (this._collapsed.has(id)) { this._collapsed.delete(id); } else { this._collapsed.add(id); } this._render(); return; }
        const more = e.target.closest(".zsacCalMore");
        if (more) { this._cursor = more.getAttribute("data-date"); this._zoom.calendar = "day"; this._render(); return; }
        const hit = e.target.closest("[data-id]");
        if (hit) { this._select(hit.getAttribute("data-id")); }
      });
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
    onStatusFilter(e) { this._status = e.getParameter("selectedItem").getKey(); this._render(); },
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
        provider: this._p, dataActions: this._dataActions, multiActions: this._multiActions, files: this._files, onRun: (e) => this._runTask(e), onOpenFile: (f) => this._openFile(f),
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
        this._selected = event.Id;
        this._showPanel(this._events.find((e) => e.Id === event.Id) || event, false);
        this._render();
        this.toast(isNew ? "Event created" : "Saved");
      } catch (e) { this.fail(e); }
      void opts;
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
        await this._p.saveTask(Engine.toRecord(Engine.afterRun(current, outcome)));
        await this._load();
        this._select(event.Id);
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
          const made = await (key === "WIZARD" ? EventWizard.generate : EventWizard.fromTemplate)({ models: this._models, versions: this._versions, parentId });
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

    onDelete() { const sel = this._events.find((x) => x.Id === this._selected); if (sel) { this._deleteEvent(sel); } },

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
