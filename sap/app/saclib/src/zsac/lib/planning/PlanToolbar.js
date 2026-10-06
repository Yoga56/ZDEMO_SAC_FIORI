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
  "./RulesDialog",
  "./TableFunctionsDialog",
  "./GridExport",
  "./CommentDialog"
], function (Control, OverflowToolbar, Button, ToggleButton, Text, ToolbarSpacer, MessageBox, MessageToast, PlanPublisher, DistributeDialog, VersionManager, VersionHistory, LockDialog, RulesDialog, TableFunctionsDialog, GridExport, CommentDialog) {
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
      this._rules = new Button({ icon: "sap-icon://validate", tooltip: "Validation Rules: limits plan values must keep", type: "Transparent", press: () => RulesDialog.open({ provider: this._provider, modelId: this._modelId(), onChange: () => this._onChange() }) });
      this._mass = new ToggleButton({ text: "Mass Entry", icon: "sap-icon://edit", tooltip: "Mass data entry: type many values, nothing is recalculated until you apply them", type: "Transparent", pressed: false,
        press: (e) => this._toggleMass(e.getParameter("pressed")) });
      this._applyMass = new Button({ text: "Apply", type: "Emphasized", visible: false, tooltip: "Apply the typed values as one step", press: () => { const g = this._grid(); if (g) { g.applyMass(); } } });
      this._cancelMass = new Button({ icon: "sap-icon://decline", type: "Transparent", visible: false, tooltip: "Drop the typed values", press: () => { const g = this._grid(); if (g) { g.clearMass(); } } });
      this._table = new Button({ icon: "sap-icon://table-view", tooltip: "Table Functions: sort, hide zero rows, scale, variance, thresholds, swap", type: "Transparent", enabled: false,
        press: () => { if (this._grid()) { TableFunctionsDialog.open(this._grid(), { onApply: (v) => { if (this._opts.onView) { this._opts.onView(v); } } }); } } });
      this._export = new Button({ icon: "sap-icon://excel-attachment", tooltip: "Export the table to a CSV file", type: "Transparent", enabled: false, press: () => this._doExport() });
      this._refresh = new Button({ icon: "sap-icon://refresh", tooltip: "Refresh the data", type: "Transparent", press: () => this._onChange() });
      this._historyBtn = new Button({ icon: "sap-icon://history", tooltip: "Version History", type: "Transparent", press: () => this._openHistory() });
      this.setAggregation("_bar", new OverflowToolbar({ content: [this._publish, this._discard, this._undo, this._redo, this._distribute, this._copy, this._paste, this._fx, this._mass, this._applyMass, this._cancelMass, this._table, this._export, this._comment,
        this._versions, this._locks, this._rules, this._historyBtn, this._refresh, new ToolbarSpacer(), this._status] }));
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

    _toggleMass(on) {
      const g = this._grid();
      if (!on && g && g.massCount()) { g.applyMass(); }       // switching it off keeps the typed values
      this._plan.massEntry = on;
      this._plan.notifySelection(this._plan.active);
      this._update();
    },

    _doExport() {
      const g = this._grid();
      if (!g) { return; }
      const url = URL.createObjectURL(new Blob([GridExport.csv(g.exportRows())], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = "planning-" + (g.getModelId() || "table") + "-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      const waiting = g ? g.massCount() : 0;
      this._mass.setPressed(!!p.massEntry);
      this._applyMass.setVisible(!!p.massEntry); this._cancelMass.setVisible(!!p.massEntry);
      this._applyMass.setText("Apply" + (waiting ? " (" + waiting + ")" : "")).setEnabled(waiting > 0); this._cancelMass.setEnabled(waiting > 0);
      this._table.setEnabled(!!g);
      this._export.setEnabled(!!g);
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
