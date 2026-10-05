/**
 * Toolbar of the planning session of a page: Publish Data, Discard, Undo, Redo and the number of unpublished changes.
 *   toolbar.attach({ plan, provider, onChange })   onChange runs after a publish or discard so the page can reload its widgets
 * While there are unpublished changes the browser warns before the page is left.
 */
sap.ui.define([
  "sap/ui/core/Control",
  "sap/m/OverflowToolbar", "sap/m/Button", "sap/m/Text", "sap/m/ToolbarSpacer", "sap/m/MessageBox", "sap/m/MessageToast",
  "./PlanPublisher"
], function (Control, OverflowToolbar, Button, Text, ToolbarSpacer, MessageBox, MessageToast, PlanPublisher) {
  "use strict";

  return Control.extend("zsac.lib.planning.PlanToolbar", {
    metadata: { aggregations: { _bar: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" } } },

    renderer: {
      apiVersion: 2,
      render(rm, t) {
        if (!t.getVisible()) { return; }
        rm.openStart("div", t).class("zsacPlanBar").openEnd();
        rm.renderControl(t.getAggregation("_bar"));
        rm.close("div");
      }
    },

    init() {
      this._status = new Text({ text: "No unpublished changes" });
      this._publish = new Button({ text: "Publish Data", icon: "sap-icon://upload-to-cloud", type: "Emphasized", enabled: false, press: () => this._doPublish() });
      this._discard = new Button({ text: "Discard", icon: "sap-icon://decline", enabled: false, press: () => this._doDiscard() });
      this._undo = new Button({ icon: "sap-icon://undo", tooltip: "Undo", type: "Transparent", enabled: false, press: () => this._plan.undo() });
      this._redo = new Button({ icon: "sap-icon://redo", tooltip: "Redo", type: "Transparent", enabled: false, press: () => this._plan.redo() });
      this.setAggregation("_bar", new OverflowToolbar({ content: [this._publish, this._discard, this._undo, this._redo, new ToolbarSpacer(), this._status] }));
      this._guard = (e) => { if (this._plan && this._plan.dirty) { e.preventDefault(); e.returnValue = ""; } };
      window.addEventListener("beforeunload", this._guard);
    },

    exit() {
      window.removeEventListener("beforeunload", this._guard);
      if (this._plan) { this._plan.detachChange(this._sync); }
    },

    attach(opts) {
      if (this._plan) { this._plan.detachChange(this._sync); }
      this._plan = opts.plan;
      this._provider = opts.provider;
      this._onChange = opts.onChange || (() => {});
      this._sync = () => this._update();
      this._plan.attachChange(this._sync);
      this._update();
      return this;
    },

    _update() {
      const p = this._plan;
      this._publish.setEnabled(p.dirty);
      this._discard.setEnabled(p.dirty);
      this._undo.setEnabled(p.canUndo);
      this._redo.setEnabled(p.canRedo);
      this._status.setText(p.dirty ? p.count + " unpublished change" + (p.count === 1 ? "" : "s") : "No unpublished changes");
    },

    async _doPublish() {
      this._publish.setBusy(true);
      try {
        const n = await PlanPublisher.publish(this._plan, this._provider);
        MessageToast.show(n + " values published");
        this._onChange();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      } finally {
        this._publish.setBusy(false);
      }
    },

    _doDiscard() {
      MessageBox.confirm("Discard " + this._plan.count + " unpublished changes?", {
        actions: ["Discard", MessageBox.Action.CANCEL], emphasizedAction: "Discard",
        onClose: (a) => { if (a === "Discard") { this._plan.clear(); this._onChange(); } }
      });
    }
  });
});
