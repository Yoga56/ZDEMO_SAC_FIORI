/**
 * Embeddable story viewer: any Fiori app can show a saved dashboard with
 *     new zsac.lib.designer.StoryViewer({ provider, storyId: "STORY_SALES" })
 * It loads the story from the provider, shows page tabs when there is more than one page and renders the
 * canvas read-only (story filters from input controls still work).
 */
sap.ui.define([
  "sap/ui/core/Control",
  "sap/m/VBox",
  "sap/m/SegmentedButton",
  "sap/m/SegmentedButtonItem",
  "sap/m/MessageStrip",
  "./StoryCanvas",
  "../planning/PlanToolbar"
], function (Control, VBox, SegmentedButton, SegmentedButtonItem, MessageStrip, StoryCanvas, PlanToolbar) {
  "use strict";

  return Control.extend("zsac.lib.designer.StoryViewer", {
    metadata: {
      properties: {
        storyId: { type: "string", defaultValue: "" },
        provider: { type: "object", defaultValue: null }
      },
      aggregations: { _layout: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" } },
      events: { storyLoaded: { parameters: { story: { type: "object" } } } }
    },

    renderer: {
      apiVersion: 2,
      render(rm, viewer) {
        rm.openStart("div", viewer).class("zsacViewer").openEnd();
        rm.renderControl(viewer.getAggregation("_layout"));
        rm.close("div");
      }
    },

    setStoryId(id) {
      this.setProperty("storyId", id, true);
      this.reload();
      return this;
    },

    setProvider(p) {
      this.setProperty("provider", p, true);
      this.reload();
      return this;
    },

    getCanvas() { return this._canvas; },

    async reload() {
      const provider = this.getProvider();
      const id = this.getStoryId();
      if (!provider || !id) { return; }
      const token = (this._token = (this._token || 0) + 1);
      try {
        const story = await provider.getStory(id);
        if (token !== this._token) { return; }
        const layout = new VBox({ width: "100%" });
        this._canvas = new StoryCanvas({ editable: false });
        this._canvas.setContext({ provider, story });
        if (story.Pages.length > 1) {
          const tabs = new SegmentedButton({ selectedKey: String(story.Pages[0].Id), selectionChange: (e) => this._canvas.setPageNumber(Number(e.getParameter("item").getKey())) });
          story.Pages.forEach((p) => tabs.addItem(new SegmentedButtonItem({ key: String(p.Id), text: p.Title })));
          this._canvas.attachPageChange((e) => tabs.setSelectedKey(String(e.getParameter("page")))); // a button in the story can change the page
          layout.addItem(tabs.addStyleClass("sapUiSmallMarginBottom"));
        }
        if (this._canvas.hasPlanning()) {
          layout.addItem(new PlanToolbar().attach({ plan: this._canvas.getPlan(), provider, onChange: () => this._canvas.refreshAll() }));
        }
        layout.addItem(this._canvas);
        this._setLayout(layout);
        this.fireStoryLoaded({ story });
      } catch (e) {
        this._setLayout(new MessageStrip({ text: e.message, type: "Error", showIcon: true }));
      }
    },

    /** setAggregation only removes the layout it replaces; the old canvas and its cards must be destroyed or each reload leaves a whole story behind. */
    _setLayout(layout) {
      const old = this.getAggregation("_layout");
      this.setAggregation("_layout", layout);
      if (old && old !== layout) { old.destroy(); }
    }
  });
});
