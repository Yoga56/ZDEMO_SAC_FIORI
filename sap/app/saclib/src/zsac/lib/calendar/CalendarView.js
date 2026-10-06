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

  /**
   * The lines from an event to the events that wait for it (Config.After): out of the end of the bar, down or up to the row of the later one, into its start.
   * Red when the later one starts before the earlier one ends. shown = the visible rows, bars = the bars by event id.
   */
  function linkPaths(shown, bars) {
    const index = new Map(shown.map((r, i) => [r.event.Id, i]));
    const out = [];
    shown.forEach((r, j) => {
      const to = bars.get(r.event.Id);
      if (!to) { return; }
      (r.event.Config.After || []).forEach((id) => {
        const i = index.get(id); const from = bars.get(id);
        if (i === undefined || !from) { return; }
        const x1 = from.x + from.w; const y1 = i * ROW + ROW / 2; const x2 = to.x; const y2 = j * ROW + ROW / 2;
        const gap = 7;
        const d = x2 >= x1 + gap * 2
          ? "M" + x1.toFixed(1) + "," + y1 + " H" + (x1 + gap).toFixed(1) + " V" + y2 + " H" + x2.toFixed(1)
          : "M" + x1.toFixed(1) + "," + y1 + " H" + (x1 + gap).toFixed(1) + " V" + ((y1 + y2) / 2 + (y2 >= y1 ? ROW / 2 : -ROW / 2)).toFixed(1) + " H" + (x2 - gap).toFixed(1) + " V" + y2 + " H" + x2.toFixed(1);
        out.push({ d, from: id, to: r.event.Id, violated: x2 < x1 });
      });
    });
    return out;
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
      const links = linkPaths(shown, byId);
      if (links.length) {
        right += '<svg class="zsacCalLinks" width="' + Math.ceil(g.width) + '" height="' + (shown.length * ROW) + '" style="top:40px"><defs><marker id="zsacArrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" class="zsacCalArrow"/></marker>'
          + '<marker id="zsacArrowBad" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" class="zsacCalArrowBad"/></marker></defs>'
          + links.map((l) => '<path class="zsacCalLink' + (l.violated ? " zsacCalLinkBad" : "") + '" d="' + l.d + '" fill="none" marker-end="url(#' + (l.violated ? "zsacArrowBad" : "zsacArrow") + ')"><title>' + esc((l.violated ? "Starts before it can: " : "After: ") + l.from + " to " + l.to) + "</title></path>").join("") + "</svg>";
      }
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

  return { listHtml, gridHtml, dayHtml, visibleRows, linkPaths, fmt, ROW };
});
