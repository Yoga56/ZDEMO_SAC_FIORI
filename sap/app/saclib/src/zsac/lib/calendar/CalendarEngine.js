/**
 * Planning calendar (pure): events and processes, the way SAC's Calendar has them.
 *
 * An event is a task or a process on a date range. A process (or composite task) holds child events and shows what its children
 * show: the date range they span, their average progress and a status worked out from theirs.
 *
 *   event = { Id, Type, Title, Description, ParentId, Status, Progress, StartDate, EndDate (YYYY-MM-DD), ModelId, VersionId, Approver,
 *             People: { Owners, Assignees, Viewers }, Files: [{ Type, Id, Name, Url }], Config: {...}, Owner, Access }
 *   Type     GENERAL | REVIEW | COMPOSITE | PROCESS | LOCK | DATAACTION | MULTIACTION
 *   Status   OPEN | ACTIVE | IN_REVIEW | ON_HOLD | DONE | CANCELLED (plus the flags overdue and delayed, which depend on the date)
 *
 *   normalize(event) -> event with every field filled (a task of the first calendar, with DueDate, Assignee and Notes, is converted)
 *   build(events, today) -> { rows: [{ event, eff: {start, end, progress, status}, depth, hasChildren, flags: {overdue, delayed} }], byId }
 *   monthGrid(rows, year, month) / weekDays(rows, date) -> days with the events that fall on them
 *   gantt(rows, { zoom, today, from, to }) -> { ppd, from, to, width, ticks, bars, todayX }
 *   generate(spec), TEMPLATES, instantiate(template, spec) -> new events
 *   validate(event, all) -> problems; sharesOf(event) -> shares of the people; filter(rows, options)
 */
sap.ui.define([], function () {
  "use strict";

  const DAY = 86400000;
  const TYPES = {
    GENERAL: { label: "General Task", icon: "sap-icon://task", container: false },
    REVIEW: { label: "Review Task", icon: "sap-icon://approvals", container: false },
    COMPOSITE: { label: "Composite Task", icon: "sap-icon://list", container: true },
    PROCESS: { label: "Process", icon: "sap-icon://process", container: true },
    LOCK: { label: "Data Locking Task", icon: "sap-icon://locked", container: false },
    DATAACTION: { label: "Data Action Task", icon: "sap-icon://action", container: false },
    MULTIACTION: { label: "Multi Action Task", icon: "sap-icon://workflow-tasks", container: false }
  };
  const STATUSES = {
    OPEN: { label: "Open", state: "Information" },
    ACTIVE: { label: "In progress", state: "Information" },
    IN_REVIEW: { label: "In review", state: "Warning" },
    ON_HOLD: { label: "On hold", state: "Warning" },
    DONE: { label: "Completed", state: "Success" },
    CANCELLED: { label: "Cancelled", state: "Error" }
  };
  const finished = (s) => s === "DONE" || s === "CANCELLED";

  // ---- dates: a day is a whole number (days since 1970), so a range has no time zone to get wrong ------------------------------------
  const toDay = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : null; };
  const fromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const addDays = (s, n) => fromDay(toDay(s) + n);
  const addMonths = (s, n) => {
    const d = new Date(toDay(s) * DAY);
    const day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last)); // 31 January plus a month is the end of February
    return d.toISOString().slice(0, 10);
  };

  function normalize(e) {
    const people = e.People || {};
    const list = (a) => (Array.isArray(a) ? a.filter(Boolean) : []);
    const end = e.EndDate || e.DueDate || null;
    const out = Object.assign({
      Type: "GENERAL", Title: "", Description: e.Notes || "", ParentId: "", Status: "OPEN", Progress: 0, ModelId: "", VersionId: "", Approver: "", Files: [], Config: {}
    }, e, {
      Type: TYPES[e.Type] ? e.Type : "GENERAL",
      Status: STATUSES[e.Status] ? e.Status : "OPEN",
      StartDate: e.StartDate || end,
      EndDate: end,
      Progress: Math.min(100, Math.max(0, Number(e.Progress) || (e.Status === "DONE" ? 100 : 0))),
      People: { Owners: list(people.Owners), Assignees: list(people.Assignees).length ? list(people.Assignees) : (e.Assignee ? [e.Assignee] : []), Viewers: list(people.Viewers) },
      Files: Array.isArray(e.Files) ? e.Files : [],
      Config: e.Config && typeof e.Config === "object" ? e.Config : {}
    });
    if (out.StartDate && out.EndDate && out.StartDate > out.EndDate) { out.EndDate = out.StartDate; }
    return out;
  }

  /** The events in tree order (roots by start date, then children), each with what it shows: a parent shows its children. */
  function build(events, today) {
    const list = events.map(normalize);
    const byId = new Map(list.map((e) => [e.Id, e]));
    const kids = new Map();
    list.forEach((e) => {
      const parent = e.ParentId && byId.has(e.ParentId) && e.ParentId !== e.Id ? e.ParentId : "";
      if (!kids.has(parent)) { kids.set(parent, []); }
      kids.get(parent).push(e);
    });
    const eff = new Map();
    const seen = new Set();
    const derive = (e) => {
      if (eff.has(e.Id)) { return eff.get(e.Id); }
      if (seen.has(e.Id)) { return { start: e.StartDate, end: e.EndDate, progress: e.Progress, status: e.Status }; } // a loop in the parents: stop
      seen.add(e.Id);
      const own = { start: e.StartDate, end: e.EndDate, progress: e.Progress, status: e.Status };
      const children = (kids.get(e.Id) || []).map((c) => ({ c, v: derive(c) }));
      let result = own;
      if (children.length) {
        const live = children.filter((x) => x.v.status !== "CANCELLED");
        const starts = children.map((x) => x.v.start).filter(Boolean).sort();
        const ends = children.map((x) => x.v.end).filter(Boolean).sort();
        const progress = live.length ? Math.round(live.reduce((s, x) => s + x.v.progress, 0) / live.length) : 0;
        let status;
        if (e.Status === "CANCELLED" || e.Status === "ON_HOLD") { status = e.Status; }
        else if (!live.length) { status = "CANCELLED"; }
        else if (live.every((x) => x.v.status === "DONE")) { status = "DONE"; }
        else if (live.some((x) => x.v.status === "ACTIVE" || x.v.status === "IN_REVIEW" || x.v.status === "DONE" || x.v.progress > 0)) { status = "ACTIVE"; }
        else if (live.some((x) => x.v.status === "ON_HOLD")) { status = "ON_HOLD"; }
        else { status = "OPEN"; }
        result = { start: starts[0] || own.start, end: ends[ends.length - 1] || own.end, progress: status === "DONE" ? 100 : progress, status };
      }
      eff.set(e.Id, result);
      return result;
    };
    list.forEach(derive);
    // siblings in the order of the dates they show (a process by the range of its children)
    const order = (a, b) => String(eff.get(a.Id).start || "9999").localeCompare(String(eff.get(b.Id).start || "9999")) || String(a.Title).localeCompare(String(b.Title));
    kids.forEach((v) => v.sort(order));

    const rows = [];
    const placed = new Set();
    const walk = (parent, depth) => {
      (kids.get(parent) || []).forEach((e) => {
        if (placed.has(e.Id)) { return; }
        placed.add(e.Id);
        rows.push({ event: e, eff: eff.get(e.Id), depth, hasChildren: (kids.get(e.Id) || []).length > 0, flags: flags(eff.get(e.Id), today) });
        walk(e.Id, depth + 1);
      });
    };
    walk("", 0);
    // events in a loop of parents (A inside B inside A) have no root: they are shown as roots rather than lost
    list.forEach((e) => { if (!placed.has(e.Id)) { placed.add(e.Id); rows.push({ event: e, eff: eff.get(e.Id), depth: 0, hasChildren: false, flags: flags(eff.get(e.Id), today) }); } });
    return { rows, byId };
  }

  /** overdue: the end has passed and it is not finished; delayed: it should have started and has not. */
  function flags(v, today) {
    const t = today || fromDay(Math.floor(Date.now() / DAY));
    return { overdue: !!v.end && v.end < t && !finished(v.status), delayed: !!v.start && v.start < t && v.status === "OPEN" && !(v.end && v.end < t) };
  }

  const leafVisible = (r) => !r.hasChildren || !TYPES[r.event.Type].container; // a process with children is drawn by its children

  function eventsOnDay(rows, day) {
    return rows.filter((r) => leafVisible(r) && r.eff.start && r.eff.end && r.eff.start <= day && day <= r.eff.end);
  }

  /** The weeks (Sunday first) that show a month: every day with the events that are on it. */
  function monthGrid(rows, year, month, today) {
    const first = Date.UTC(year, month - 1, 1) / DAY;
    const start = first - new Date(first * DAY).getUTCDay();
    const last = Date.UTC(year, month, 0) / DAY;
    const weeks = [];
    for (let d = start; d <= last || weeks.length < 4; d += 7) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const date = fromDay(d + i);
        days.push({ date, day: new Date((d + i) * DAY).getUTCDate(), inMonth: date.slice(0, 7) === year + "-" + String(month).padStart(2, "0"), isToday: date === today, events: eventsOnDay(rows, date) });
      }
      weeks.push(days);
      if (d + 7 > last) { break; }
    }
    return weeks;
  }

  function weekDays(rows, date, today) {
    const d = toDay(date);
    const start = d - new Date(d * DAY).getUTCDay();
    return Array.from({ length: 7 }, (_, i) => { const s = fromDay(start + i); return { date: s, day: new Date((start + i) * DAY).getUTCDate(), inMonth: true, isToday: s === today, events: eventsOnDay(rows, s) }; });
  }

  const PPD = { day: 44, week: 18, month: 6, year: 1.4 };

  /** A timeline: pixels per day by zoom, header ticks, one bar per row (with the done part) and the today line. */
  function gantt(rows, opts) {
    const o = opts || {};
    const zoom = PPD[o.zoom] ? o.zoom : "month";
    const ppd = PPD[zoom];
    const today = o.today || fromDay(Math.floor(Date.now() / DAY));
    const starts = rows.map((r) => r.eff.start).filter(Boolean).concat([today]).sort();
    const ends = rows.map((r) => r.eff.end).filter(Boolean).concat([today]).sort();
    let from = toDay(o.from || addDays(starts[0], -7));
    let to = toDay(o.to || addDays(ends[ends.length - 1], 21));
    if (to - from > 3660) { to = from + 3660; } // ten years is the most a timeline draws
    if (to <= from) { to = from + 30; }
    const x = (date) => (toDay(date) - from) * ppd;
    const ticks = [];
    for (let d = from; d <= to; d++) {
      const s = fromDay(d); const dt = new Date(d * DAY); const dom = dt.getUTCDate(); const first = dom === 1; const monday = dt.getUTCDay() === 1;
      if (zoom === "day") { ticks.push({ x: (d - from) * ppd, label: String(dom), major: first, sub: first ? dt.toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" }) : "" }); }
      else if (zoom === "week") { if (monday || d === from) { ticks.push({ x: (d - from) * ppd, label: String(dom) + "." + (dt.getUTCMonth() + 1), major: first, sub: "" }); } }
      else if (zoom === "month") { if (first || d === from) { ticks.push({ x: (d - from) * ppd, label: dt.toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" }), major: true, sub: "" }); } else if (monday) { ticks.push({ x: (d - from) * ppd, label: "", major: false, sub: "" }); } }
      else if (first) { ticks.push({ x: (d - from) * ppd, label: dt.getUTCMonth() === 0 ? String(dt.getUTCFullYear()) : dt.toLocaleDateString("en", { month: "short", timeZone: "UTC" }), major: dt.getUTCMonth() === 0, sub: "" }); }
      void s;
    }
    const bars = rows.map((r) => {
      if (!r.eff.start || !r.eff.end) { return null; }
      const left = x(r.eff.start);
      const width = Math.max(ppd, (toDay(r.eff.end) - toDay(r.eff.start) + 1) * ppd);
      return { id: r.event.Id, x: left, w: width, done: width * (r.eff.progress / 100), container: r.hasChildren && TYPES[r.event.Type].container, status: r.eff.status, overdue: r.flags.overdue, hatched: r.eff.status === "ON_HOLD" };
    });
    return { zoom, ppd, from: fromDay(from), to: fromDay(to), width: (to - from + 1) * ppd, ticks, bars, todayX: x(today) + ppd / 2 };
  }


  /** What is stored: the event, plus the fields the first calendar had (the first assignee, the due date, the notes) so older code keeps working. */
  function toRecord(event) {
    const e = normalize(event);
    return Object.assign({}, e, { Assignee: e.People.Assignees[0] || "", DueDate: e.EndDate, Notes: e.Description });
  }

  // ---- finding, checking, changing -----------------------------------------------------------------------------------------------------

  /** Ids of everything below an event (children, their children ...). */
  function descendants(events, id) {
    const out = new Set(); const todo = [id];
    while (todo.length) {
      const cur = todo.pop();
      events.forEach((e) => { if (e.ParentId === cur && !out.has(e.Id) && e.Id !== id) { out.add(e.Id); todo.push(e.Id); } });
    }
    return out;
  }

  /**
   * Rows that match, with the processes that hold a match (so a match is still shown in its place).
   * options = { q: text in the title, status, type, user + mine: the user is owner, assignee or viewer }
   */
  function filterRows(rows, options) {
    const o = options || {};
    const q = String(o.q || "").trim().toLowerCase();
    const me = String(o.user || "").toUpperCase();
    const involved = (e) => ["Owners", "Assignees", "Viewers"].some((k) => e.People[k].some((u) => String(u).toUpperCase() === me)) || String(e.Owner || "").toUpperCase() === me;
    const match = (r) => (!q || r.event.Title.toLowerCase().indexOf(q) >= 0) && (!o.status || r.eff.status === o.status) && (!o.type || r.event.Type === o.type) && (!o.mine || involved(r.event));
    if (!q && !o.status && !o.type && !o.mine) { return rows; }
    const keep = new Set();
    const parentOf = new Map(rows.map((r) => [r.event.Id, r.event.ParentId]));
    rows.forEach((r) => {
      if (!match(r)) { return; }
      let id = r.event.Id; const guard = new Set();
      while (id && !guard.has(id)) { guard.add(id); keep.add(id); id = parentOf.get(id); }
    });
    return rows.filter((r) => keep.has(r.event.Id));
  }

  /**
   * Problems that stop a save (errors) and things to look at (warnings: it starts before something it waits for ends).
   * all = every event, to check the parent and what the event waits for.
   */
  function validate(event, all) {
    const e = normalize(event);
    const errors = []; const warnings = [];
    const byId = new Map((all || []).map((x) => [x.Id, normalize(x)]));
    if (!String(e.Title).trim()) { errors.push("Enter a title"); }
    if (!e.StartDate || !e.EndDate) { errors.push("Enter a start and an end date"); }
    else if (toDay(e.StartDate) === null || toDay(e.EndDate) === null) { errors.push("The dates are not valid"); }
    if (String(e.Description).length > 255) { errors.push("The description can have 255 characters (it has " + String(e.Description).length + ")"); }
    if (e.ParentId) {
      const parent = byId.get(e.ParentId);
      if (!parent) { errors.push("The process it belongs to does not exist"); }
      else if (e.ParentId === e.Id || descendants(all || [], e.Id).has(e.ParentId)) { errors.push("An event cannot be inside itself"); }
      else if (!TYPES[parent.Type].container) { errors.push("It can only be inside a process or a composite task"); }
    }
    if (e.Type === "REVIEW" && !String(e.Approver).trim()) { errors.push("A review task needs a reviewer"); }
    if ((e.Type === "DATAACTION" || e.Type === "MULTIACTION") && !e.Config.ActionId) { errors.push("Choose the " + (e.Type === "DATAACTION" ? "data action" : "multi action") + " to run"); }
    if (e.Type === "LOCK" && (!e.ModelId || !e.VersionId)) { errors.push("Choose the model and the version to lock"); }
    if (e.Type === "DATAACTION" && e.Config.ActionId && !e.ModelId) { /* the model comes from the action when it runs */ }
    (e.Config.After || []).forEach((id) => {
      const p = byId.get(id);
      if (id === e.Id) { errors.push("An event cannot wait for itself"); }
      else if (!p) { errors.push("It waits for an event that does not exist"); }
      else if (p.EndDate && e.StartDate && p.EndDate >= e.StartDate && !finished(p.Status)) { warnings.push("It starts before \"" + p.Title + "\" ends"); }
    });
    return { errors, warnings };
  }

  /** What can be done to an event now, and the event after it: { Submit, Approve, Reject, Start, Hold, Resume, Complete, Cancel, Reopen }. */
  const FLOW = {
    Start: { from: ["OPEN", "ON_HOLD"], to: "ACTIVE" },
    Submit: { from: ["OPEN", "ACTIVE"], to: "IN_REVIEW", needs: "Approver" },
    Approve: { from: ["IN_REVIEW"], to: "DONE", progress: 100 },
    Reject: { from: ["IN_REVIEW"], to: "ACTIVE" },
    Hold: { from: ["OPEN", "ACTIVE"], to: "ON_HOLD" },
    Resume: { from: ["ON_HOLD"], to: "ACTIVE" },
    Complete: { from: ["OPEN", "ACTIVE", "ON_HOLD"], to: "DONE", progress: 100 },
    Cancel: { from: ["OPEN", "ACTIVE", "ON_HOLD", "IN_REVIEW"], to: "CANCELLED" },
    Reopen: { from: ["DONE", "CANCELLED"], to: "OPEN" }
  };
  const actionsFor = (event) => { const e = normalize(event); return Object.keys(FLOW).filter((k) => FLOW[k].from.indexOf(e.Status) >= 0 && (!FLOW[k].needs || String(e[FLOW[k].needs]).trim())); };
  function apply(event, action) {
    const e = normalize(event); const f = FLOW[action];
    if (!f || actionsFor(e).indexOf(action) < 0) { throw new Error("'" + action + "' is not possible while the event is " + (STATUSES[e.Status] || {}).label); }
    return Object.assign({}, e, { Status: f.to, Progress: f.progress !== undefined ? f.progress : (f.to === "OPEN" ? 0 : e.Progress) });
  }

  // ---- people and work files --------------------------------------------------------------------------------------------------------------
  /**
   * Who may do what with an event, as shares for the sharing of the data source (see core/Access): owners and assignees may edit it, viewers may look at it,
   * "*" among the viewers is everyone. The creator is the owner of the row, so never gets a share.
   */
  function sharesOf(event) {
    const e = normalize(event);
    const best = new Map();
    const add = (list, level) => list.forEach((u) => { const k = String(u).trim().toUpperCase(); if (k && !(best.get(k) === "WRITE")) { best.set(k, level); } });
    add(e.People.Viewers, "READ");
    add(e.People.Owners, "WRITE");
    add(e.People.Assignees, "WRITE");
    return Array.from(best.entries()).map(([Principal, Access]) => ({ Principal, Access }));
  }

  /** A work file is a story, model or action of this system (Type and Id) or a web address (Type URL). */
  const FILE_TYPES = { STORY: "Story", MODEL: "Dataset", DATAACTION: "Data action", MULTIACTION: "Multi action", URL: "Web address" };
  function addFile(event, file) {
    const e = normalize(event);
    const f = { Type: file.Type, Id: file.Id || "", Name: String(file.Name || file.Url || file.Id || "").slice(0, 80), Url: file.Url || "" };
    if (!FILE_TYPES[f.Type]) { throw new Error("A work file is a story, a dataset, an action or a web address"); }
    if (f.Type === "URL" ? !f.Url : !f.Id) { throw new Error("Choose the file"); }
    if (e.Files.some((x) => x.Type === f.Type && x.Id === f.Id && x.Url === f.Url)) { return e.Files; } // once is enough
    if (e.Files.length >= 20) { throw new Error("An event can have 20 work files"); }
    return e.Files.concat([f]);
  }

  // ---- planning tasks: what a run leaves behind ------------------------------------------------------------------------------------------
  const RUNNABLE = { DATAACTION: "data action", MULTIACTION: "multi action", LOCK: "version" };
  const isRunnable = (event) => !!RUNNABLE[event.Type];

  /**
   * The event after a run. outcome = { ok, message }: a task that ran completes (100%); one that failed is in progress, so it shows it needs a look;
   * every run is remembered in Config.LastRun. A task that is cancelled stays as it is.
   */
  function afterRun(event, outcome, at) {
    const e = normalize(event);
    const last = { At: at || new Date().toISOString(), Status: outcome.ok ? "S" : "E", Message: String(outcome.message || "").slice(0, 200) };
    const config = Object.assign({}, e.Config, { LastRun: last });
    if (e.Status === "CANCELLED") { return Object.assign({}, e, { Config: config }); }
    return Object.assign({}, e, { Config: config }, outcome.ok ? { Status: "DONE", Progress: 100 } : { Status: e.Status === "OPEN" || e.Status === "ON_HOLD" ? "ACTIVE" : e.Status });
  }

  /** "Succeeded on Oct 6, 2026: 12 values changed" for the last run of a task, or empty. */
  function describeRun(event) {
    const r = normalize(event).Config.LastRun;
    if (!r) { return ""; }
    const day = new Date(r.At).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    return (r.Status === "S" ? "Succeeded" : "Failed") + " on " + day + (r.Message ? ": " + r.Message : "");
  }

  // ---- generating events ---------------------------------------------------------------------------------------------------------------
  const REPEAT = { DAILY: (d, n) => addDays(d, n), WEEKLY: (d, n) => addDays(d, 7 * n), MONTHLY: (d, n) => addMonths(d, n), QUARTERLY: (d, n) => addMonths(d, 3 * n), YEARLY: (d, n) => addMonths(d, 12 * n) };
  function label(repeat, date) {
    const d = new Date(toDay(date) * DAY);
    const month = d.toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" });
    switch (repeat) {
      case "MONTHLY": return month;
      case "QUARTERLY": return "Q" + (Math.floor(d.getUTCMonth() / 3) + 1) + " " + d.getUTCFullYear();
      case "YEARLY": return String(d.getUTCFullYear());
      default: return d.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
    }
  }

  /**
   * The wizard: the same event again and again. spec = { Title, Type, Start, Days, Repeat, Count, ParentId, ModelId, VersionId, Approver, Description, People, Config, newId }
   * The titles say which round each is ("Close books - Oct 2026"); a count of one keeps the title as it is.
   */
  function generate(spec) {
    const count = Math.floor(Number(spec.Count) || 1);
    if (count < 1 || count > 60) { throw new Error("Generate between 1 and 60 events"); }
    if (count > 1 && !REPEAT[spec.Repeat]) { throw new Error("Choose how often the event repeats"); }
    if (toDay(spec.Start) === null) { throw new Error("Enter the start date"); }
    const days = Math.max(1, Math.floor(Number(spec.Days) || 1));
    const nextId = spec.newId || (() => "E" + Math.random().toString(36).slice(2, 10));
    return Array.from({ length: count }, (_, i) => {
      const start = count > 1 ? REPEAT[spec.Repeat](spec.Start, i) : spec.Start;
      return normalize({ Id: nextId(), Type: spec.Type || "GENERAL", Title: count > 1 ? spec.Title + " - " + label(spec.Repeat, start) : spec.Title, ParentId: spec.ParentId || "", Status: "OPEN",
        StartDate: start, EndDate: addDays(start, days - 1), ModelId: spec.ModelId || "", VersionId: spec.VersionId || "", Approver: spec.Approver || "", Description: spec.Description || "",
        People: spec.People, Config: JSON.parse(JSON.stringify(spec.Config || {})) });
    });
  }

  /** Process templates: a process with its tasks, each step after the one before it. offset and days are in days from the start of the process. */
  const TEMPLATES = [
    { id: "BUDGET", name: "Budget cycle", description: "Input, review and lock the budget",
      steps: [{ Title: "Input budget", Type: "GENERAL", offset: 0, days: 14 }, { Title: "Review budget", Type: "REVIEW", offset: 14, days: 5 }, { Title: "Lock budget", Type: "LOCK", offset: 19, days: 1 }] },
    { id: "CLOSE", name: "Month-end close", description: "Close the actuals, review the variances, lock the version",
      steps: [{ Title: "Close actuals", Type: "GENERAL", offset: 0, days: 3 }, { Title: "Review variances", Type: "REVIEW", offset: 3, days: 2 }, { Title: "Lock actuals", Type: "LOCK", offset: 5, days: 1 }] },
    { id: "FORECAST", name: "Forecast cycle", description: "Run the forecast, review it, lock it",
      steps: [{ Title: "Run forecast", Type: "MULTIACTION", offset: 0, days: 2 }, { Title: "Review forecast", Type: "REVIEW", offset: 2, days: 3 }, { Title: "Lock forecast", Type: "LOCK", offset: 5, days: 1 }] }
  ];

  /** spec = { Title, Start, ParentId, ModelId, VersionId, Approver, People, newId } -> [process, ...tasks] */
  function instantiate(template, spec) {
    if (toDay(spec.Start) === null) { throw new Error("Enter the start date"); }
    const nextId = spec.newId || (() => "E" + Math.random().toString(36).slice(2, 10));
    const last = template.steps.reduce((m, s) => Math.max(m, s.offset + s.days), 0);
    const process = normalize({ Id: nextId(), Type: "PROCESS", Title: spec.Title || template.name, ParentId: spec.ParentId || "", Status: "OPEN", StartDate: spec.Start, EndDate: addDays(spec.Start, last - 1),
      Description: template.description, People: spec.People });
    let previous = null;
    const tasks = template.steps.map((s) => {
      const e = normalize({ Id: nextId(), Type: s.Type, Title: s.Title, ParentId: process.Id, Status: "OPEN", StartDate: addDays(spec.Start, s.offset), EndDate: addDays(spec.Start, s.offset + s.days - 1),
        ModelId: spec.ModelId || "", VersionId: spec.VersionId || "", Approver: s.Type === "REVIEW" ? (spec.Approver || "") : "", People: spec.People, Config: previous ? { After: [previous] } : {} });
      previous = e.Id;
      return e;
    });
    return [process].concat(tasks);
  }

  return { TYPES, STATUSES, FLOW, TEMPLATES, FILE_TYPES, sharesOf, addFile, RUNNABLE, isRunnable, afterRun, describeRun, toRecord, normalize, build, descendants, filterRows, validate, actionsFor, apply, generate, instantiate, flags, monthGrid, weekDays, gantt, toDay, fromDay, addDays, addMonths, finished, PPD };
});
