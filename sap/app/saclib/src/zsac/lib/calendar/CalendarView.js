/**
 * HTML of the planning calendar (see CalendarEngine): the list of events (a tree, with an optional timeline beside it), and the
 * month, week and day grids. Plain strings, so a test can check them; every row and chip carries data-id for selecting.
 *
 *   CalendarView.listHtml(rows, { collapsed, selected, today, icon, gantt }) -> html
 *   CalendarView.gridHtml(weeks, { selected, icon, mode: "month" | "week" }) -> html
 *   CalendarView.dayHtml(day, { selected, icon }) -> html
 * icon(name) gives the markup of a sap-icon (the app uses the icon font); the default draws nothing.
 */
sap.ui.define(["../core/Format", "./CalendarEngine"], function (Format, Engine) {
  "use strict";

  const esc = Format.esc;
  const ROW = 34;
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const noIcon = () => "";
  const fmt = (d) => (d ? new Date(Engine.toDay(d) * 86400000).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "");
  const state = (s) => (Engine.STATUSES[s] || Engine.STATUSES.OPEN).state;

  /** The rows that show: those below a collapsed process are left out. */
  function visibleRows(rows, collapsed) {
    const out = []; let hideDepth = null;
    rows.forEach((r) => {
      if (hideDepth !== null && r.depth > hideDepth) { return; }
      hideDepth = null;
      out.push(r);
      if (r.hasChildren && collapsed && collapsed.has(r.event.Id)) { hideDepth = r.depth; }
    });
    return out;
  }

  function statusHtml(r) {
    const s = Engine.STATUSES[r.eff.status] || Engine.STATUSES.OPEN;
    return '<span class="zsacCalStatus zsacCalSt-' + esc(r.eff.status) + '">' + esc(s.label) + "</span>"
      + (r.flags.overdue ? ' <span class="zsacCalFlag zsacCalOverdue">Overdue</span>' : r.flags.delayed ? ' <span class="zsacCalFlag zsacCalDelayed">Delayed</span>' : "");
  }

  function listHtml(rows, opts) {
    const o = Object.assign({ collapsed: new Set(), selected: "", icon: noIcon, gantt: null }, opts);
    const shown = visibleRows(rows, o.collapsed);
    let left = '<div class="zsacCalHead zsacCalGrid"><div>Event name</div><div>Status</div><div>Progress</div><div>Start date</div><div>End date</div></div>';
    shown.forEach((r) => {
      const e = r.event;
      const tog = r.hasChildren ? '<span class="zsacCalTog" data-tog="' + esc(e.Id) + '">' + (o.collapsed.has(e.Id) ? "&#9656;" : "&#9662;") + "</span>" : '<span class="zsacCalTog zsacCalNoTog"></span>';
      left += '<div class="zsacCalRow zsacCalGrid' + (e.Id === o.selected ? " zsacCalSel" : "") + (r.event.Type === "PROCESS" ? " zsacCalProc" : "") + '" data-id="' + esc(e.Id) + '" style="height:' + ROW + 'px">'
        + '<div class="zsacCalName" style="padding-left:' + (r.depth * 18 + 4) + 'px">' + tog + o.icon(Engine.TYPES[e.Type].icon) + '<span class="zsacCalTitle" title="' + esc(e.Title) + '">' + esc(e.Title || "(no title)") + "</span></div>"
        + "<div>" + statusHtml(r) + "</div>"
        + '<div><span class="zsacCalBar"><span style="width:' + r.eff.progress + '%"></span></span> ' + r.eff.progress + "%</div>"
        + "<div>" + esc(fmt(r.eff.start)) + "</div><div>" + esc(fmt(r.eff.end)) + "</div></div>";
    });
    if (!shown.length) { left += '<div class="zsacVMsg">No events</div>'; }
    let right = "";
    if (o.gantt) {
      const g = o.gantt;
      const byId = new Map(g.bars.filter(Boolean).map((b) => [b.id, b]));
      right = '<div class="zsacCalRight" style="width:' + Math.ceil(g.width) + 'px">'
        + '<div class="zsacCalTicks">' + g.ticks.map((t) => '<div class="zsacCalTick' + (t.major ? " zsacCalTickMajor" : "") + '" style="left:' + t.x.toFixed(1) + 'px">' + (t.sub ? '<span class="zsacCalTickSub">' + esc(t.sub) + "</span>" : "") + esc(t.label) + "</div>").join("") + "</div>";
      shown.forEach((r) => {
        const b = byId.get(r.event.Id);
        right += '<div class="zsacCalGRow" data-id="' + esc(r.event.Id) + '" style="height:' + ROW + 'px">'
          + (b ? '<div class="zsacCalGBar zsacCalGSt-' + esc(b.status) + (b.container ? " zsacCalGContainer" : "") + (b.overdue ? " zsacCalGOverdue" : "") + (b.hatched ? " zsacCalGHatch" : "") + (r.event.Id === o.selected ? " zsacCalGSel" : "")
            + '" data-id="' + esc(r.event.Id) + '" style="left:' + b.x.toFixed(1) + "px;width:" + b.w.toFixed(1) + 'px" title="' + esc(r.event.Title + ": " + fmt(r.eff.start) + " to " + fmt(r.eff.end)) + '"><span class="zsacCalGDone" style="width:' + b.done.toFixed(1) + 'px"></span></div>' : "")
          + "</div>";
      });
      right += '<div class="zsacCalToday" style="left:' + g.todayX.toFixed(1) + 'px;height:' + (shown.length * ROW + 40) + 'px"></div></div>';
    }
    return '<div class="zsacCal"><div class="zsacCalLeft">' + left + "</div>" + right + "</div>";
  }

  const chip = (r, o) => '<div class="zsacCalChip zsacCalCh-' + esc(r.eff.status) + (r.event.Id === o.selected ? " zsacCalChSel" : "") + (r.flags.overdue ? " zsacCalChOver" : "") + '" data-id="' + esc(r.event.Id) + '" title="' + esc(r.event.Title) + '">'
    + o.icon(Engine.TYPES[r.event.Type].icon) + esc(r.event.Title || "(no title)") + "</div>";

  function gridHtml(weeks, opts) {
    const o = Object.assign({ selected: "", icon: noIcon, mode: "month" }, opts);
    const max = o.mode === "week" ? 20 : 3;
    let h = '<div class="zsacCalMonth zsacCalMode-' + o.mode + '"><div class="zsacCalDow">' + WEEKDAYS.map((d) => "<div>" + d + "</div>").join("") + "</div>";
    weeks.forEach((week) => {
      h += '<div class="zsacCalWeek">';
      week.forEach((d) => {
        h += '<div class="zsacCalDay' + (d.inMonth ? "" : " zsacCalOut") + (d.isToday ? " zsacCalNow" : "") + '" data-date="' + esc(d.date) + '"><div class="zsacCalDayNo">' + d.day + "</div>"
          + d.events.slice(0, max).map((r) => chip(r, o)).join("")
          + (d.events.length > max ? '<div class="zsacCalMore" data-date="' + esc(d.date) + '">+' + (d.events.length - max) + " more</div>" : "") + "</div>";
      });
      h += "</div>";
    });
    return h + "</div>";
  }

  function dayHtml(day, opts) {
    const o = Object.assign({ selected: "", icon: noIcon }, opts);
    return '<div class="zsacCalDayView"><div class="zsacCalDayTitle">' + esc(new Date(Engine.toDay(day.date) * 86400000).toLocaleDateString("en", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })) + "</div>"
      + (day.events.length ? day.events.map((r) => chip(r, o)).join("") : '<div class="zsacVMsg">Nothing is planned for this day.</div>') + "</div>";
  }

  return { listHtml, gridHtml, dayHtml, visibleRows, fmt, ROW };
});
