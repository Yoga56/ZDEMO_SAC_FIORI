/**
 * A story (dashboard) is plain JSON so any provider can persist it and any app can embed it.
 *
 * story  = { Id, Name, Description, ModelId, Status: "D"|"P", Pages: [{Id, Title}], Filters: {dim:[m]}, Widgets: [] }
 * widget = { Id, Page, Type, Title, X, Y, W, H, Binding: {...}, Props: {...} }       (grid: 12 columns)
 */
sap.ui.define(["./WidgetRegistry"], function (WidgetRegistry) {
  "use strict";

  const COLUMNS = 12;
  let counter = 0;
  function uid(prefix) { return prefix + "_" + Date.now().toString(36) + (counter++).toString(36); }

  function newStory(name, modelId) {
    return {
      Id: uid("STORY"), Name: name || "New Story", Description: "", ModelId: modelId || "",
      Status: "D", Pages: [{ Id: 1, Title: "Page 1" }], Filters: {}, Widgets: []
    };
  }

  /** Lowest free row for a widget of height h so a dropped widget never overlaps (first-fit on the grid). */
  function freeSpot(story, page, w, h) {
    const items = story.Widgets.filter((x) => x.Page === page);
    const hit = (x, y) => items.some((i) => x < i.X + i.W && x + w > i.X && y < i.Y + i.H && y + h > i.Y);
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x + w <= COLUMNS; x++) { if (!hit(x, y)) { return { X: x, Y: y }; } }
    }
    return { X: 0, Y: 0 };
  }

  /**
   * After a drag or resize: the widget keeps the place the planner put it, and the widgets it lands on are pushed down, one after the
   * other in reading order (a pushed widget pushes the ones below it), until nothing overlaps. Widgets that are not in the way stay where they are.
   * @returns {boolean} true when another widget had to move
   */
  function settle(story, widget) {
    const others = story.Widgets.filter((x) => x.Page === widget.Page && x.Id !== widget.Id).sort((a, b) => a.Y - b.Y || a.X - b.X);
    const placed = [widget];
    const hit = (o, y) => placed.some((i) => o.X < i.X + i.W && o.X + o.W > i.X && y < i.Y + i.H && y + o.H > i.Y);
    let moved = false;
    others.forEach((o) => {
      let y = o.Y;
      while (hit(o, y) && y < 1000) { y++; }
      if (y !== o.Y) { o.Y = y; moved = true; }
      placed.push(o);
    });
    return moved;
  }

  /**
   * "Tidy up": every widget moves up as far as it can (reading order, no overlaps), so the gaps a page collects while it is edited close.
   * @returns {boolean} true when a widget moved
   */
  function compact(story, page) {
    const items = story.Widgets.filter((x) => x.Page === page).sort((a, b) => a.Y - b.Y || a.X - b.X);
    const placed = [];
    let moved = false;
    items.forEach((o) => {
      let y = o.Y;
      const hit = (yy) => placed.some((i) => o.X < i.X + i.W && o.X + o.W > i.X && yy < i.Y + i.H && yy + o.H > i.Y);
      while (y > 0 && !hit(y - 1)) { y--; }
      if (y !== o.Y) { o.Y = y; moved = true; }
      placed.push(o);
    });
    return moved;
  }

  /**
   * The box of a widget when one of its edges or corners is dragged by (dx, dy) grid cells from the box it started in.
   * edge: any of n, s, e, w combined (se, nw ...). The box stays inside the grid and keeps at least minW x minH (default 1 x 1).
   */
  function resizeBox(start, edge, dx, dy, minW, minH) {
    const mw = minW || 1, mh = minH || 1;
    let { X, Y, W, H } = start;
    if (edge.indexOf("e") >= 0) { W = Math.max(mw, Math.min(COLUMNS - X, start.W + dx)); }
    if (edge.indexOf("w") >= 0) { const nx = Math.max(0, Math.min(start.X + start.W - mw, start.X + dx)); W = start.X + start.W - nx; X = nx; }
    if (edge.indexOf("s") >= 0) { H = Math.max(mh, start.H + dy); }
    if (edge.indexOf("n") >= 0) { const ny = Math.max(0, Math.min(start.Y + start.H - mh, start.Y + dy)); H = start.Y + start.H - ny; Y = ny; }
    return { X, Y, W, H };
  }

  function newWidget(story, page, type) {
    const def = WidgetRegistry.get(type);
    if (!def) { throw new Error("Widget type not registered: " + type); }
    const spot = freeSpot(story, page, def.size.w, def.size.h);
    return {
      Id: uid("W"), Page: page, Type: type, Title: def.name,
      X: spot.X, Y: spot.Y, W: def.size.w, H: def.size.h,
      Binding: JSON.parse(JSON.stringify(def.defaults.Binding || {})),
      Props: JSON.parse(JSON.stringify(def.defaults.Props || {}))
    };
  }

  /** @returns {string[]} problems, empty when the story can be saved */
  function validate(story) {
    const errors = [];
    if (!story.Name || !String(story.Name).trim()) { errors.push("A story needs a name"); }
    (story.Widgets || []).forEach((w) => {
      if (!WidgetRegistry.has(w.Type)) { errors.push("Unknown widget type " + w.Type); }
      if (w.X < 0 || w.Y < 0 || w.W < 1 || w.H < 1 || w.X + w.W > COLUMNS) {
        errors.push("Widget " + w.Id + " is outside the grid");
      }
    });
    return errors;
  }

  return { COLUMNS, uid, newStory, newWidget, freeSpot, settle, compact, resizeBox, validate };
});
