/**
 * Toolbar of the planning session of a page: Publish Data, Discard, Undo, Redo and the number of unpublished changes.
 *   toolbar.attach({ plan, provider, onChange, modelId, onVersions, onSelect })
 *     onChange runs after a publish or discard so the page can reload its widgets; modelId() names the model for Version Management and
 *     History (default: the model of the grid the planner last used); onVersions runs after versions changed (default onChange);
 *     onSelect(versionId) when a version is clicked in Version Management
 * While there are unpublished changes the browser warns before the page is left.
 */
sap.ui.define([
  "sap/ui/core/Control",
  "sap/m/OverflowToolbar", "sap/m/Button", "sap/m/ToggleButton", "sap/m/Text", "sap/m/ToolbarSpacer", "sap/m/MessageBox", "sap/m/MessageToast",
  "./PlanPublisher",
  "./DistributeDialog",
  "./VersionManager",
  "./VersionHistory",
  "./LockDialog",
  "./CommentDialog"
], function (Control, OverflowToolbar, Button, ToggleButton, Text, ToolbarSpacer, MessageBox, MessageToast, PlanPublisher, DistributeDialog, VersionManager, VersionHistory, LockDialog, CommentDialog) {
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
      this._distribute = new Button({ text: "Distribute Values", icon: "sap-icon://calculator", enabled: false, press: () => { if (this._grid()) { DistributeDialog.open(this._grid()); } } });
      this._copy = new Button({ icon: "sap-icon://copy", tooltip: "Copy the selected cells (Ctrl+C)", type: "Transparent", enabled: false, press: () => this._doCopy() });
      this._paste = new Button({ icon: "sap-icon://paste", tooltip: "Paste at the selected cell (Ctrl+V)", type: "Transparent", enabled: false, press: () => this._doPaste() });
      this._fx = new ToggleButton({ text: "fx", tooltip: "Formula bar: type a value or a formula for the selected cells", type: "Transparent", pressed: false,
        press: (e) => { this._plan.formulaBar = e.getParameter("pressed"); this._plan.notifySelection(this._plan.active); } });
      this._comment = new Button({ icon: "sap-icon://comment", tooltip: "Comments on the selected cell", type: "Transparent", enabled: false, press: () => this._doComment() });
      this._versions = new Button({ text: "Versions", icon: "sap-icon://documents", tooltip: "Version Management", type: "Transparent", press: () => this._openVersions() });
      this._locks = new Button({ icon: "sap-icon://locked", tooltip: "Data Locking: who can change which data", type: "Transparent", press: () => LockDialog.open({ provider: this._provider, modelId: this._modelId(), onChange: () => this._onChange() }) });
      this._historyBtn = new Button({ icon: "sap-icon://history", tooltip: "Version History", type: "Transparent", press: () => this._openHistory() });
      this.setAggregation("_bar", new OverflowToolbar({ content: [this._publish, this._discard, this._undo, this._redo, this._distribute, this._copy, this._paste, this._fx, this._comment,
        this._versions, this._locks, this._historyBtn, new ToolbarSpacer(), this._status] }));
      this._guard = (e) => { if (this._plan && this._plan.dirty) { e.preventDefault(); e.returnValue = ""; } };
      window.addEventListener("beforeunload", this._guard);
    },

    exit() {
      window.removeEventListener("beforeunload", this._guard);
      if (this._plan) { this._plan.detachChange(this._sync); this._plan.detachSelection(this._sync); }
    },

    attach(opts) {
      if (this._plan) { this._plan.detachChange(this._sync); this._plan.detachSelection(this._sync); }
      this._plan = opts.plan;
      this._provider = opts.provider;
      this._onChange = opts.onChange || (() => {});
      this._opts = opts;
      this._sync = () => this._update();
      this._plan.attachChange(this._sync);
      this._plan.attachSelection(this._sync);
      this._fx.setPressed(!!this._plan.formulaBar);
      this._update();
      return this;
    },

    _modelId() {
      const g = this._grid();
      return (this._opts && this._opts.modelId && this._opts.modelId()) || (g && g.getModelId()) || "";
    },

    _openVersions() {
      VersionManager.open({ provider: this._provider, plan: this._plan, modelId: this._modelId(),
        onChange: () => (this._opts.onVersions || this._onChange)(), onSelect: this._opts.onSelect });
    },

    _openHistory() {
      VersionHistory.open({ provider: this._provider, plan: this._plan, modelId: this._modelId() });
    },

    /** The grid the planner last worked in, if it is still on screen. */
    _grid() {
      const g = this._plan && this._plan.active;
      return g && g.getDomRef() && document.body.contains(g.getDomRef()) ? g : null;
    },

    /** The one selected cell that a comment can be attached to, with its coordinates; null otherwise. */
    _commentCell() {
      const g = this._grid();
      if (!g || !this._provider || !this._provider.capabilities.comments) { return null; }
      const cells = g.getSelectedCells();
      if (cells.length !== 1) { return null; }
      const coords = g.cellCoords(cells[0].rk, cells[0].ck);
      return coords ? { g, cell: cells[0], coords } : null;
    },

    _doComment() {
      const t = this._commentCell();
      if (!t) { return; }
      CommentDialog.open({ provider: this._provider, coords: t.coords, label: t.g._cellLabel(t.cell.rk, t.cell.ck) + " \u00b7 " + t.coords.VersionId, comments: t.g.commentsAt(t.cell.rk, t.cell.ck),
        onChange: (all) => t.g.setComments(all) });
    },

    async _doCopy() {
      const g = this._grid();
      if (!g) { return; }
      const text = g.copySelection();
      try { await navigator.clipboard.writeText(text); } catch (e) { /* the session clipboard still works for Paste */ }
      MessageToast.show(g.selectionInfo().count + " cells copied");
    },

    async _doPaste() {
      const g = this._grid();
      if (!g) { return; }
      let text = "";
      try { text = await navigator.clipboard.readText(); } catch (e) { text = ""; }
      g.paste(text || this._plan.clipboard || "");
    },

    _update() {
      const p = this._plan;
      this._publish.setEnabled(p.dirty);
      this._discard.setEnabled(p.dirty);
      this._undo.setEnabled(p.canUndo);
      this._redo.setEnabled(p.canRedo);
      const g = this._grid();
      const sel = g ? g.selectionInfo() : { count: 0, editable: 0 };
      this._distribute.setEnabled(sel.editable > 0);
      this._copy.setEnabled(sel.count > 0);
      this._paste.setEnabled(sel.count > 0);
      this._comment.setEnabled(!!this._commentCell());
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
