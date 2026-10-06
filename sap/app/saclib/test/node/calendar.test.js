const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");
const C = req("zsac/lib/calendar/CalendarEngine");

const ev = (id, extra) => Object.assign({ Id: id, Title: id, Type: "GENERAL", Status: "OPEN", Progress: 0, StartDate: "2026-10-01", EndDate: "2026-10-10" }, extra);
const TODAY = "2026-10-06";

test("calendar dates: whole days, month ends, no time zone", () => {
  assert.strictEqual(C.addDays("2026-10-31", 1), "2026-11-01");
  assert.strictEqual(C.addDays("2026-03-01", -1), "2026-02-28");
  assert.strictEqual(C.addMonths("2026-01-31", 1), "2026-02-28");
  assert.strictEqual(C.addMonths("2026-11-30", 3), "2027-02-28");
  assert.strictEqual(C.addMonths("2026-12-15", 1), "2027-01-15");
  assert.strictEqual(C.toDay("2026-10-06") - C.toDay("2026-10-01"), 5);
  assert.strictEqual(C.toDay("nonsense"), null);
});

test("normalize: a task of the first calendar becomes an event, bad values are put right", () => {
  const e = C.normalize({ Id: "T1", Title: "Submit", DueDate: "2026-10-15", Assignee: "ME", Notes: "by Oct 12", Status: "IN_REVIEW", Approver: "CFO" });
  assert.deepStrictEqual([e.Type, e.StartDate, e.EndDate, e.Description, e.People.Assignees], ["GENERAL", "2026-10-15", "2026-10-15", "by Oct 12", ["ME"]]);
  assert.strictEqual(C.normalize({ Id: "X", Status: "NOPE", Type: "WHAT", Progress: 250, StartDate: "2026-10-09", EndDate: "2026-10-01" }).Status, "OPEN");
  const f = C.normalize({ Id: "X", Progress: 250, StartDate: "2026-10-09", EndDate: "2026-10-01" });
  assert.deepStrictEqual([f.Type, f.Progress, f.EndDate], ["GENERAL", 100, "2026-10-09"]); // progress is 0 to 100, an end before the start is the start
  assert.strictEqual(C.normalize({ Id: "D", Status: "DONE" }).Progress, 100);
  assert.deepStrictEqual(C.normalize({ Id: "N", People: { Owners: ["A", "", null] } }).People, { Owners: ["A"], Assignees: [], Viewers: [] });
});

const PROCESS = [
  ev("P", { Type: "PROCESS", StartDate: "2026-01-01", EndDate: "2026-01-02" }),
  ev("A", { ParentId: "P", StartDate: "2026-10-01", EndDate: "2026-10-05", Status: "DONE", Progress: 100 }),
  ev("B", { ParentId: "P", StartDate: "2026-10-06", EndDate: "2026-10-20", Status: "ACTIVE", Progress: 40 }),
  ev("C", { ParentId: "P", StartDate: "2026-10-21", EndDate: "2026-10-31", Type: "LOCK" }),
  ev("Z", { StartDate: "2026-09-01", EndDate: "2026-09-05" })
];

test("a process shows what its children show: range, average progress, status", () => {
  const { rows } = C.build(PROCESS, TODAY);
  const p = rows.find((r) => r.event.Id === "P");
  assert.deepStrictEqual([p.eff.start, p.eff.end, p.eff.progress, p.eff.status, p.depth, p.hasChildren], ["2026-10-01", "2026-10-31", 47, "ACTIVE", 0, true]);
  assert.deepStrictEqual(rows.map((r) => r.event.Id + ":" + r.depth), ["Z:0", "P:0", "A:1", "B:1", "C:1"]); // roots by start date, children under their parent
});

test("process status: all done is done, cancelled children do not count, own on hold or cancelled wins", () => {
  const done = PROCESS.map((e) => (e.ParentId === "P" ? Object.assign({}, e, { Status: "DONE", Progress: 100 }) : e));
  assert.strictEqual(C.build(done, TODAY).rows.find((r) => r.event.Id === "P").eff.status, "DONE");
  const cancelled = PROCESS.map((e) => (e.Id === "C" ? Object.assign({}, e, { Status: "CANCELLED" }) : e));
  const pc = C.build(cancelled, TODAY).rows.find((r) => r.event.Id === "P");
  assert.strictEqual(pc.eff.progress, 70); // (100 + 40) / 2, the cancelled child is left out
  assert.strictEqual(C.build(PROCESS.map((e) => (e.Id === "P" ? Object.assign({}, e, { Status: "ON_HOLD" }) : e)), TODAY).rows.find((r) => r.event.Id === "P").eff.status, "ON_HOLD");
  const none = C.build([ev("P", { Type: "PROCESS" }), ev("A", { ParentId: "P", Status: "CANCELLED" })], TODAY).rows[0];
  assert.strictEqual(none.eff.status, "CANCELLED");
  const open = C.build([ev("P", { Type: "PROCESS" }), ev("A", { ParentId: "P" }), ev("B", { ParentId: "P", Status: "ON_HOLD" })], TODAY).rows[0];
  assert.strictEqual(open.eff.status, "ON_HOLD");
});

test("nested processes roll up, and a loop in the parents does not hang", () => {
  const nested = [ev("R", { Type: "PROCESS" }), ev("S", { Type: "COMPOSITE", ParentId: "R" }), ev("T", { ParentId: "S", Status: "DONE", Progress: 100, StartDate: "2026-12-01", EndDate: "2026-12-31" })];
  const r = C.build(nested, TODAY).rows;
  assert.deepStrictEqual(r.map((x) => x.event.Id + ":" + x.depth + ":" + x.eff.status), ["R:0:DONE", "S:1:DONE", "T:2:DONE"]);
  assert.strictEqual(r[0].eff.end, "2026-12-31");
  const loop = C.build([ev("A", { ParentId: "B" }), ev("B", { ParentId: "A" })], TODAY);
  assert.ok(loop.rows.length <= 2);
  assert.strictEqual(C.build([ev("A", { ParentId: "A" }), ev("B", { ParentId: "MISSING" })], TODAY).rows.length, 2); // itself or a missing parent: a root
});

test("flags: overdue when the end has passed and it is not finished, delayed when it should have started", () => {
  const f = (e) => C.build([e], TODAY).rows[0].flags;
  assert.deepStrictEqual(f(ev("a", { EndDate: "2026-10-05" })), { overdue: true, delayed: false });
  assert.deepStrictEqual(f(ev("b", { Status: "DONE", EndDate: "2026-10-05" })), { overdue: false, delayed: false });
  assert.deepStrictEqual(f(ev("c", { Status: "CANCELLED", EndDate: "2026-10-05" })), { overdue: false, delayed: false });
  assert.deepStrictEqual(f(ev("d", { StartDate: "2026-10-01", EndDate: "2026-10-20" })), { overdue: false, delayed: true });
  assert.deepStrictEqual(f(ev("e", { Status: "ACTIVE", StartDate: "2026-10-01", EndDate: "2026-10-20" })), { overdue: false, delayed: false });
  assert.deepStrictEqual(f(ev("g", { StartDate: "2026-10-07", EndDate: "2026-10-20" })), { overdue: false, delayed: false });
});

test("month grid: weeks start on Sunday, events on every day of their range, a process is drawn by its children", () => {
  const { rows } = C.build(PROCESS, TODAY);
  const weeks = C.monthGrid(rows, 2026, 10, TODAY);
  assert.strictEqual(weeks[0][0].date, "2026-09-27"); // 1 October 2026 is a Thursday
  assert.ok(weeks.every((w) => w.length === 7));
  assert.strictEqual(weeks[weeks.length - 1][6].date >= "2026-10-31", true);
  const day = (d) => weeks.flat().find((x) => x.date === d);
  assert.deepStrictEqual(day("2026-10-06").events.map((r) => r.event.Id), ["B"]);
  assert.deepStrictEqual(day("2026-10-05").events.map((r) => r.event.Id), ["A"]);
  assert.strictEqual(day("2026-10-06").isToday, true);
  assert.strictEqual(day("2026-09-30").inMonth, false);
  assert.ok(!weeks.flat().some((x) => x.events.some((r) => r.event.Id === "P"))); // the process itself is not drawn when it has children
  assert.ok(C.monthGrid(rows, 2026, 2, TODAY).length === 4); // February 2026 is four weeks, Sunday to Saturday
  const wk = C.weekDays(rows, "2026-10-07", TODAY);
  assert.deepStrictEqual([wk[0].date, wk[6].date], ["2026-10-04", "2026-10-10"]);
});

const V = req("zsac/lib/calendar/CalendarView");

test("calendar list: a row per event with indent, status, progress and dates; a collapsed process hides its children", () => {
  const { rows } = C.build(PROCESS, TODAY);
  const html = V.listHtml(rows, { today: TODAY, selected: "B" });
  assert.strictEqual((html.match(/class="zsacCalRow /g) || []).length, 5);
  assert.match(html, /data-tog="P"/);
  assert.match(html, /zsacCalSel" data-id="B"/);
  assert.match(html, /padding-left:22px/); // a child is indented
  assert.match(html, /Oct 6, 2026/);
  assert.match(html, /In progress/);
  assert.match(html, /Overdue/); // Z ended in September and is open
  const closed = V.listHtml(rows, { collapsed: new Set(["P"]), today: TODAY });
  assert.strictEqual((closed.match(/class="zsacCalRow /g) || []).length, 2);
  assert.ok(!/data-id="A"/.test(closed));
  assert.match(V.listHtml([], {}), /No events/);
});

test("calendar list: the text of an event is escaped", () => {
  const { rows } = C.build([ev("X", { Title: '<img src=x onerror="alert(1)">' })], TODAY);
  const html = V.listHtml(rows, { today: TODAY });
  assert.ok(!html.includes("<img"));
  assert.match(html, /&lt;img/);
});

test("calendar grids: month cells with chips and a more link, week and day views", () => {
  const many = [1, 2, 3, 4, 5].map((n) => ev("E" + n, { StartDate: "2026-10-08", EndDate: "2026-10-08" }));
  const { rows } = C.build(many.concat([ev("Q", { StartDate: "2026-10-08", EndDate: "2026-10-09" })]), TODAY);
  const html = V.gridHtml(C.monthGrid(rows, 2026, 10, TODAY), { mode: "month" });
  assert.strictEqual((html.match(/class="zsacCalDay( |")/g) || []).length >= 28, true);
  assert.match(html, /\+3 more/); // six events on 8 October, three shown
  assert.match(html, /zsacCalNow/);
  assert.match(html, /<div>Sun<\/div>/);
  const wk = V.gridHtml([C.weekDays(rows, "2026-10-08", TODAY)], { mode: "week" });
  assert.ok(!/more/.test(wk)); // a week shows them all
  const day = V.dayHtml(C.weekDays(rows, "2026-10-08", TODAY)[4], {});
  assert.match(day, /Thursday, October 8, 2026/);
  assert.match(V.dayHtml({ date: "2026-10-12", events: [] }, {}), /Nothing is planned/);
});

test("gantt: pixels per day by zoom, one bar per row with the done part, a today line", () => {
  const { rows } = C.build(PROCESS, TODAY);
  const g = C.gantt(rows, { zoom: "month", today: TODAY });
  assert.strictEqual(g.ppd, C.PPD.month);
  assert.strictEqual(g.bars.length, rows.length);
  const bar = (id) => g.bars[rows.findIndex((r) => r.event.Id === id)];
  const a = bar("A");
  assert.strictEqual(a.w, 5 * C.PPD.month); // 1 to 5 October is five days
  assert.strictEqual(a.done, a.w); // finished
  assert.strictEqual(bar("B").done, bar("B").w * 0.4);
  assert.strictEqual(bar("P").container, true);
  const b = bar("B");
  assert.strictEqual(g.todayX - b.x, C.PPD.month / 2); // B starts today: the line is in the middle of that day
  assert.ok(g.ticks.some((t) => t.major && /Oct/.test(t.label)));
  assert.ok(C.gantt(rows, { zoom: "day", today: TODAY }).ticks.length > C.gantt(rows, { zoom: "year", today: TODAY }).ticks.length);
  assert.ok(g.width <= 3661 * C.PPD.month);
  const html = V.listHtml(rows, { gantt: g, today: TODAY });
  assert.strictEqual((html.match(/class="zsacCalGBar/g) || []).length, 5);
  assert.match(html, /zsacCalToday/);
  assert.strictEqual(C.gantt([], { today: TODAY }).bars.length, 0); // nothing to draw is not an error
});

test("filter: matches keep the processes that hold them, mine means involved", () => {
  const events = PROCESS.map((e) => (e.Id === "B" ? Object.assign({}, e, { People: { Assignees: ["ALICE"] } }) : e));
  const { rows } = C.build(events, TODAY);
  const ids = (r) => r.map((x) => x.event.Id);
  assert.deepStrictEqual(ids(C.filterRows(rows, { q: "b" })), ["P", "B"]);
  assert.deepStrictEqual(ids(C.filterRows(rows, { status: "DONE" })), ["P", "A"]); // P is DONE only through its parts: it is not a match itself, but holds one
  assert.deepStrictEqual(ids(C.filterRows(rows, { type: "LOCK" })), ["P", "C"]);
  assert.deepStrictEqual(ids(C.filterRows(rows, { mine: true, user: "alice" })), ["P", "B"]);
  assert.strictEqual(C.filterRows(rows, {}), rows);
  assert.deepStrictEqual(ids(C.filterRows(rows, { q: "nothing like this" })), []);
});

test("validate: what stops a save and what is only a warning", () => {
  const all = PROCESS.concat([ev("G", { ParentId: "A" })]);
  const v = (e) => C.validate(e, all);
  assert.deepStrictEqual(v(ev("N")).errors, []);
  assert.match(v(ev("N", { Title: " " })).errors.join(), /Enter a title/);
  assert.match(v(ev("N", { StartDate: null, EndDate: null })).errors.join(), /start and an end date/);
  assert.match(v(ev("N", { ParentId: "A" })).errors.join(), /only be inside a process/); // A is a plain task
  assert.match(v(ev("N", { ParentId: "NOPE" })).errors.join(), /does not exist/);
  assert.match(v(Object.assign({}, PROCESS[0], { ParentId: "B" })).errors.join(), /inside itself/); // P inside its own child B
  assert.match(v(ev("N", { Type: "REVIEW" })).errors.join(), /needs a reviewer/);
  assert.match(v(ev("N", { Type: "DATAACTION" })).errors.join(), /Choose the data action/);
  assert.match(v(ev("N", { Type: "MULTIACTION" })).errors.join(), /Choose the multi action/);
  assert.match(v(ev("N", { Type: "LOCK" })).errors.join(), /model and the version/);
  assert.strictEqual(v(ev("N", { Type: "LOCK", ModelId: "M", VersionId: "V" })).errors.length, 0);
  assert.match(v(ev("N", { Description: "x".repeat(256) })).errors.join(), /255 characters/);
  const w = v(ev("N", { StartDate: "2026-10-03", Config: { After: ["B"] } }));
  assert.deepStrictEqual(w.errors, []);
  assert.match(w.warnings.join(), /starts before "B" ends/);
  assert.deepStrictEqual(v(ev("N", { StartDate: "2026-11-03", EndDate: "2026-11-04", Config: { After: ["B"] } })).warnings, []);
  assert.match(v(ev("N", { Config: { After: ["NOPE"] } })).errors.join(), /waits for an event that does not exist/);
  assert.match(v(ev("N", { Config: { After: ["N"] } })).errors.join(), /wait for itself/);
});

test("status changes: only what the status allows, approve completes, a review needs a reviewer", () => {
  const e = ev("T", { Approver: "CFO" });
  assert.deepStrictEqual(C.actionsFor(e), ["Start", "Submit", "Hold", "Complete", "Cancel"]);
  assert.deepStrictEqual(C.actionsFor(ev("T")), ["Start", "Hold", "Complete", "Cancel"]); // no reviewer: no Submit
  const sub = C.apply(e, "Submit");
  assert.strictEqual(sub.Status, "IN_REVIEW");
  assert.deepStrictEqual(C.actionsFor(sub), ["Approve", "Reject", "Cancel"]);
  assert.deepStrictEqual([C.apply(sub, "Approve").Status, C.apply(sub, "Approve").Progress], ["DONE", 100]);
  assert.strictEqual(C.apply(sub, "Reject").Status, "ACTIVE");
  assert.deepStrictEqual(C.actionsFor(C.apply(e, "Complete")), ["Reopen"]);
  assert.deepStrictEqual([C.apply(C.apply(e, "Complete"), "Reopen").Status, C.apply(C.apply(e, "Complete"), "Reopen").Progress], ["OPEN", 0]);
  assert.throws(() => C.apply(e, "Approve"), /not possible while the event is Open/);
  assert.throws(() => C.apply(e, "Explode"), /not possible/);
});

test("generate: repeats on the same terms, titles say which round, month ends hold", () => {
  let n = 0; const newId = () => "G" + ++n;
  const m = C.generate({ Title: "Close books", Type: "GENERAL", Start: "2026-01-31", Days: 3, Repeat: "MONTHLY", Count: 3, newId });
  assert.deepStrictEqual(m.map((e) => [e.Title, e.StartDate, e.EndDate]), [["Close books - Jan 2026", "2026-01-31", "2026-02-02"], ["Close books - Feb 2026", "2026-02-28", "2026-03-02"], ["Close books - Mar 2026", "2026-03-31", "2026-04-02"]]);
  assert.deepStrictEqual(m.map((e) => e.Id), ["G1", "G2", "G3"]);
  assert.deepStrictEqual(C.generate({ Title: "Forecast", Start: "2026-10-01", Days: 5, Repeat: "QUARTERLY", Count: 2, newId }).map((e) => e.Title), ["Forecast - Q4 2026", "Forecast - Q1 2027"]);
  assert.deepStrictEqual(C.generate({ Title: "Once", Start: "2026-10-01", Days: 1, Count: 1, newId })[0].Title, "Once");
  assert.deepStrictEqual(C.generate({ Title: "Weekly", Start: "2026-10-05", Days: 1, Repeat: "WEEKLY", Count: 2, newId }).map((e) => e.StartDate), ["2026-10-05", "2026-10-12"]);
  assert.throws(() => C.generate({ Title: "x", Start: "2026-10-01", Count: 61, Repeat: "DAILY" }), /between 1 and 60/);
  assert.throws(() => C.generate({ Title: "x", Start: "2026-10-01", Count: 2 }), /how often/);
  assert.throws(() => C.generate({ Title: "x", Start: "nope", Count: 1 }), /start date/);
  const inside = C.generate({ Title: "x", Start: "2026-10-01", Count: 1, ParentId: "P", Approver: "CFO", Type: "REVIEW", People: { Assignees: ["A"] } })[0];
  assert.deepStrictEqual([inside.ParentId, inside.Approver, inside.People.Assignees], ["P", "CFO", ["A"]]);
});

test("template: a process with its tasks in order, each waiting for the one before", () => {
  let n = 0; const newId = () => "I" + ++n;
  const t = C.TEMPLATES.find((x) => x.id === "BUDGET");
  const out = C.instantiate(t, { Title: "Budget 2027", Start: "2026-11-02", ModelId: "SALES_PLAN", VersionId: "BUD", Approver: "CFO", newId });
  assert.deepStrictEqual(out.map((e) => [e.Type, e.StartDate, e.EndDate, e.ParentId]), [
    ["PROCESS", "2026-11-02", "2026-11-21", ""], ["GENERAL", "2026-11-02", "2026-11-15", "I1"], ["REVIEW", "2026-11-16", "2026-11-20", "I1"], ["LOCK", "2026-11-21", "2026-11-21", "I1"]]);
  assert.deepStrictEqual(out.map((e) => e.Config.After || []), [[], [], ["I2"], ["I3"]]);
  assert.strictEqual(out[2].Approver, "CFO"); assert.strictEqual(out[1].Approver, "");
  assert.deepStrictEqual(out.slice(1).map((e) => e.VersionId), ["BUD", "BUD", "BUD"]);
  assert.ok(out.every((e) => C.validate(e, out).errors.length === 0)); // a generated process is valid as it is
  assert.strictEqual(C.build(out, "2026-11-01").rows[0].eff.end, "2026-11-21");
  assert.throws(() => C.instantiate(t, { Title: "x", Start: "" }), /start date/);
  C.TEMPLATES.forEach((tpl) => assert.ok(tpl.steps.length >= 3 && tpl.steps.every((s) => C.TYPES[s.Type])));
});

test("toRecord keeps the fields of the first calendar in step", () => {
  const r = C.toRecord(ev("T", { Description: "note", People: { Assignees: ["ALICE", "BOB"] }, EndDate: "2026-10-12" }));
  assert.deepStrictEqual([r.Assignee, r.DueDate, r.Notes, r.Type], ["ALICE", "2026-10-12", "note", "GENERAL"]);
  assert.strictEqual(C.toRecord(ev("U")).Assignee, "");
});
