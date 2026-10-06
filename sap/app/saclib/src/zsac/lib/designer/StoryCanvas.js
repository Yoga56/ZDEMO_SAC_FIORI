/**
 * The 12 column grid of a story page. `editable` turns on selection, drag to move and corner drag to resize;
 * off, it is the viewer. Widgets come from WidgetRegistry, data from the provider given in setContext().
 *
 *   canvas.setContext({ provider, story });   canvas.addWidget("chart.bar");   canvas.refreshAll();
 * Events: selectionChange { widgetId }, storyChange {}
 */
sap.ui.define([
  "sap/ui/core/Control",
  "../core/WidgetRegistry",
  "../core/StorySchema",
  "../core/EventBus",
  "../core/FilterEngine",
  "../planning/PlanBuffer",
  "../widget/Widgets"
], function (Control, WidgetRegistry, StorySchema, EventBus, FilterEngine, PlanBuffer, Widgets) {
  "use strict";

  const GAP = 12;

  return Control.extend("zsac.lib.designer.StoryCanvas", {
    metadata: {
      properties: {
        editable: { type: "boolean", defaultValue: false },
        page: { type: "int", defaultValue: 1 },
        rowHeight: { type: "int", defaultValue: 80 }
      },
      aggregations: { cards: { type: "sap.ui.core.Control", multiple: true, singularName: "card" } },
      events: {
        selectionChange: { parameters: { widgetId: { type: "string" } } },
        storyChange: {},
        pageChange: { parameters: { page: { type: "int" } } }
      }
    },

    init() {
      this._bus = new EventBus();
      this._filters = {};
      this._selected = null;
      this._story = null;
      this._provider = null;
      this._bus.on("filter", (e) => this._onFilter(e));
      this._bus.on("refresh-all", () => this.refreshAll());
      // a button of the story moves to another page: only when the story is shown, not while it is edited
      this._bus.on("goto-page", (e) => { if (!this.getEditable() && this._story && this._story.Pages.some((p) => p.Id === e.page)) { this.setPageNumber(e.page); } });
      // the planning session of the page: unpublished changes that every widget shows
      this._plan = new PlanBuffer();
      this._plan.attachChange(() => {
        clearTimeout(this._planTimer);
        this._planTimer = setTimeout(() => this._refreshReaders(), 250);
      });
    },

    exit() { clearTimeout(this._planTimer); },

    getPlan() { return this._plan; },
    hasPlanning() { return !!this._story && this._story.Widgets.some((w) => w.Type === "planning.table"); },

    /** Widgets that only read (charts, KPIs, tables) follow the unpublished numbers; planning tables and inputs update themselves. */
    _refreshReaders() {
      const own = new Set(["planning.table", "filter", "text", "dataaction.trigger", "multiaction.trigger"]);
      this.getCards().forEach((c) => {
        const w = this._story && this._story.Widgets.find((x) => x.Id === c.getWidgetId());
        if (w && !own.has(w.Type)) { c.refresh(); }
      });
    },

    renderer: {
      apiVersion: 2,
      render(rm, canvas) {
        rm.openStart("div", canvas).class("zsacCanvas");
        if (canvas.getEditable()) { rm.class("zsacEditable").attr("tabindex", "0"); }
        rm.style("grid-auto-rows", canvas.getRowHeight() + "px").style("--zsac-row", canvas.getRowHeight() + "px").openEnd();
        canvas._visible().forEach((w) => {
          const card = canvas._cardOf(w.Id);
          if (!card) { return; }
          rm.openStart("div").class("zsacCell").attr("data-id", w.Id);
          if (w.Id === canvas._selected) { rm.class("zsacSelected"); }
          rm.style("grid-column", (w.X + 1) + " / span " + w.W).style("grid-row", (w.Y + 1) + " / span " + w.H).style("--zsac-h", String(w.H)).openEnd();
          rm.renderControl(card);
          if (canvas.getEditable()) {
            const def = WidgetRegistry.get(w.Type);
            rm.openStart("div").class("zsacShield").openEnd().close("div");
            rm.openStart("div").class("zsacCellBar").attr("data-drag", "1").openEnd().text(def ? def.name : w.Type).close("div");
            ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach((edge) => rm.openStart("div").class("zsacResize").class("zsacResize-" + edge).attr("data-resize", edge).openEnd().close("div"));
          }
          rm.close("div");
        });
        if (!canvas._visible().length) {
          rm.openStart("div").class("zsacCanvasEmpty").openEnd()
            .text(canvas.getEditable() ? "Add a widget from the palette" : "This page has no widgets").close("div");
        }
        rm.close("div");
      }
    },

    // ---- context ------------------------------------------------------------------------------
    setContext(ctx) {
      this._provider = ctx.provider;
      if (!this._story || this._story.Id !== ctx.story.Id) { this._plan.clear(); }
      this._story = ctx.story;
      this._filters = JSON.parse(JSON.stringify(ctx.story.Filters || {}));
      this._selected = null;
      this.destroyCards();
      this._built = new Set();
      this.invalidate();
      return this;
    },

    getStory() { return this._story; },
    getFilters() { return this._filters; },

    _visible() { return this._story ? this._story.Widgets.filter((w) => w.Page === this.getPage()) : []; },
    _cardOf(id) { return this.getCards().find((c) => c.getWidgetId() === id); },

    _ctx() { return { provider: this._provider, bus: this._bus, filters: this._filters, plan: this._plan, story: this._story, isEditable: () => !!this.getEditable() }; },

    _build(widget) {
      const def = WidgetRegistry.get(widget.Type);
      let card;
      if (!def) {
        const WidgetCard = sap.ui.require("zsac/lib/widget/WidgetCard");
        card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, message: "Unknown widget type " + widget.Type });
      } else {
        card = def.create(widget, this._ctx());
      }
      return card;
    },

    _ensureCards() {
      this._visible().forEach((w) => {
        if (this._cardOf(w.Id)) { return; }
        this.addCard(this._build(w));
      });
    },

    onBeforeRendering() { this._ensureCards(); },

    onAfterRendering() {
      const root = this.getDomRef();
      this.getCards().forEach((c) => { if (!c._zsacLoaded && this._visible().some((w) => w.Id === c.getWidgetId())) { c._zsacLoaded = true; c.refresh(); } });
      if (this.getEditable() && !root._zsacBound) {
        root._zsacBound = true;
        root.addEventListener("pointerdown", (e) => this._onPointerDown(e));
        root.addEventListener("keydown", (e) => this._onKey(e));
      }
    },

    // ---- API ----------------------------------------------------------------------------------
    refreshAll() {
      return Promise.all(this.getCards().map((c) => { c._zsacLoaded = true; return c.refresh(); }));
    },

    async addWidget(type) {
      const widget = StorySchema.newWidget(this._story, this.getPage(), type);
      const model = this._story.ModelId ? await this._provider.getModel(this._story.ModelId).catch(() => null) : null;
      const versions = model ? await this._provider.listVersions(model.ModelId) : [];
      Widgets.autoBind(widget, model, versions);
      this._story.Widgets.push(widget);
      this._selected = widget.Id;
      this.invalidate();
      this.fireStoryChange();
      this.fireSelectionChange({ widgetId: widget.Id });
      return widget;
    },

    removeWidget(id) {
      this._story.Widgets = this._story.Widgets.filter((w) => w.Id !== id);
      const card = this._cardOf(id);
      if (card) { this.removeCard(card).destroy(); }
      if (this._selected === id) { this._selected = null; this.fireSelectionChange({ widgetId: "" }); }
      this.invalidate();
      this.fireStoryChange();
    },

    duplicateWidget(id) {
      const src = this._story.Widgets.find((w) => w.Id === id);
      if (!src) { return; }
      const copy = JSON.parse(JSON.stringify(src));
      copy.Id = StorySchema.uid("W");
      copy.Title = src.Title + " copy";
      const spot = StorySchema.freeSpot(this._story, src.Page, src.W, src.H);
      copy.X = spot.X; copy.Y = spot.Y;
      this._story.Widgets.push(copy);
      this.select(copy.Id);
      this.fireStoryChange();
    },

    /** Rebuild one widget after its configuration changed in the builder panel. */
    updateWidget(id) {
      const w = this._story.Widgets.find((x) => x.Id === id);
      const old = this._cardOf(id);
      if (old) { this.removeCard(old).destroy(); }
      if (w) { this.addCard(this._build(w)); }
      this.invalidate();
      this.fireStoryChange();
    },

    getSelected() { return this._story ? this._story.Widgets.find((w) => w.Id === this._selected) : null; },

    select(id) {
      this._selected = id || null;
      this.invalidate();
      this.fireSelectionChange({ widgetId: id || "" });
    },

    setPageNumber(n) {
      this.setProperty("page", n, true);
      this._selected = null;
      this.invalidate();
      this.fireSelectionChange({ widgetId: "" });
      this.firePageChange({ page: n });
    },

    // ---- filters ------------------------------------------------------------------------------
    _onFilter(e) {
      if (!e.dim) { return; }
      if (e.members && e.members.length) { this._filters[e.dim] = e.members.slice(); } else { delete this._filters[e.dim]; }
      this._story.Filters = JSON.parse(JSON.stringify(this._filters));
      this.getCards().forEach((c) => { if (c.getWidgetId() && !/filter/.test((this._story.Widgets.find((w) => w.Id === c.getWidgetId()) || {}).Type || "")) { c.refresh(); } });
    },

    // ---- drag and resize ----------------------------------------------------------------------
    _onPointerDown(e) {
      const cell = e.target.closest(".zsacCell");
      if (!cell) { return; }
      const id = cell.getAttribute("data-id");
      const w = this._story.Widgets.find((x) => x.Id === id);
      if (!w) { return; }
      if (this._selected !== id) { this._selected = id; this.fireSelectionChange({ widgetId: id }); this._markSelected(id); }
      const handle = e.target.closest("[data-resize]");
      const edge = handle ? handle.getAttribute("data-resize") : "";
      const mode = handle ? "resize" : e.target.closest("[data-drag]") || e.target.closest(".zsacShield") ? "drag" : null;
      if (!mode) { return; }
      e.preventDefault();
      const rect = this.getDomRef().getBoundingClientRect();
      const stepX = (rect.width - GAP * 11) / 12 + GAP;
      const stepY = this.getRowHeight() + GAP;
      const start = { x: e.clientX, y: e.clientY, X: w.X, Y: w.Y, W: w.W, H: w.H };
      cell.classList.add("zsacMoving");
      const move = (ev) => {
        const dx = Math.round((ev.clientX - start.x) / stepX);
        const dy = Math.round((ev.clientY - start.y) / stepY);
        if (mode === "drag") {
          w.X = Math.max(0, Math.min(12 - w.W, start.X + dx));
          w.Y = Math.max(0, start.Y + dy);
        } else {
          Object.assign(w, StorySchema.resizeBox(start, edge.length > 1 || /^[nsew]$/.test(edge) ? edge : "se", dx, dy));
        }
        cell.style.gridColumn = (w.X + 1) + " / span " + w.W;
        cell.style.gridRow = (w.Y + 1) + " / span " + w.H;
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        cell.classList.remove("zsacMoving");
        if (w.X !== start.X || w.Y !== start.Y || w.W !== start.W || w.H !== start.H) {
          if (StorySchema.settle(this._story, w)) { this.invalidate(); }
          this.fireStoryChange();
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },

    /** Arrow keys move the selected widget by one cell, Shift+arrows resize it from its bottom right corner, Delete is left to the toolbar. */
    _onKey(e) {
      const w = this._story && this._selected && this._story.Widgets.find((x) => x.Id === this._selected);
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!w || !d || /input|textarea|select/i.test((e.target && e.target.tagName) || "")) { return; }
      e.preventDefault();
      if (e.shiftKey) { Object.assign(w, StorySchema.resizeBox(w, "se", d[0], d[1])); }
      else { w.X = Math.max(0, Math.min(12 - w.W, w.X + d[0])); w.Y = Math.max(0, w.Y + d[1]); }
      StorySchema.settle(this._story, w);
      this.invalidate();
      this.fireStoryChange();
    },

    /** "Tidy up": the widgets of the page move up so the gaps close. @returns {boolean} true when something moved */
    tidy() {
      if (!this._story || !StorySchema.compact(this._story, this.getPage())) { return false; }
      this.invalidate();
      this.fireStoryChange();
      return true;
    },

    _markSelected(id) {
      const root = this.getDomRef();
      if (!root) { return; }
      root.querySelectorAll(".zsacCell").forEach((c) => c.classList.toggle("zsacSelected", c.getAttribute("data-id") === id));
    }
  });
});
