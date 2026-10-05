/**
 * Unpublished plan changes (pure). Planners edit into this buffer; "Publish Data" writes it to the provider in one go.
 * Widgets that read plan data apply `overlay()` so they show the unpublished numbers; undo and redo work on whole edits
 * (a spread over many facts is one step).
 *
 *   buffer.apply(changes, baseLookup, label)   changes = facts with their new Value; baseLookup(fact) -> stored value or null (new fact);
 *                                              label = what the planner did, shown in Version History
 */
sap.ui.define(["./DataActionEngine"], function (DataActionEngine) {
  "use strict";

  const keyOf = DataActionEngine.keyOf;

  class PlanBuffer {
    constructor() {
      this._pending = new Map();   // key -> fact with the unpublished value
      this._orig = new Map();      // key -> value in the data source when first touched (null: the fact is new)
      this._undo = [];
      this._redo = [];
      this._listeners = [];
      this._selListeners = [];
      this.active = null;          // the planning grid the planner last worked in (Copy, Paste and Distribute Values act on it)
      this.clipboard = null;       // text of the last Copy, for Paste when the system clipboard cannot be read
    }

    /** The selection of cells in the active grid changed. */
    attachSelection(fn) { this._selListeners.push(fn); }
    detachSelection(fn) { this._selListeners = this._selListeners.filter((x) => x !== fn); }
    notifySelection(grid) { if (grid) { this.active = grid; } this._selListeners.slice().forEach((fn) => fn(this)); }

    attachChange(fn) { this._listeners.push(fn); }
    detachChange(fn) { this._listeners = this._listeners.filter((x) => x !== fn); }
    _fire() { this._listeners.slice().forEach((fn) => fn(this)); }

    get dirty() { return this._pending.size > 0; }
    get count() { return this._pending.size; }
    get canUndo() { return this._undo.length > 0; }
    get canRedo() { return this._redo.length > 0; }
    has(fact) { return this._pending.has(keyOf(fact)); }

    _set(k, fact) {
      const orig = this._orig.get(k);
      if (orig !== null && orig !== undefined && orig === fact.Value) { this._pending.delete(k); } else { this._pending.set(k, Object.assign({}, fact)); }
    }

    /** One undoable edit. */
    apply(changes, baseLookup, label) {
      const items = [];
      changes.forEach((f) => {
        const k = keyOf(f);
        const prev = this._pending.has(k) ? this._pending.get(k).Value : undefined;
        if (!this._orig.has(k)) {
          const base = baseLookup ? baseLookup(f) : null;
          this._orig.set(k, base === undefined ? null : base);
        }
        items.push({ k, fact: Object.assign({}, f), prev });
        this._set(k, f);
      });
      if (items.length) { this._undo.push({ items, at: Date.now(), label: label || "" }); this._redo = []; this._fire(); }
    }

    /** The steps of this session, newest first: { at, label, count, versions[] }. `redo` lists undone steps, next to redo first. */
    history() {
      const view = (e) => ({ at: e.at, label: e.label || (e.items.length + " values changed"), count: e.items.length,
        versions: Array.from(new Set(e.items.map((i) => i.fact.VersionId))), models: Array.from(new Set(e.items.map((i) => i.fact.ModelId))) });
      return { undo: this._undo.slice().reverse().map(view), redo: this._redo.slice().reverse().map(view) };
    }

    /** Undo the newest n+1 steps (index 0 of history().undo is the newest). */
    undoTo(index) { let done = 0; for (let i = 0; i <= index; i++) { if (this.undo()) { done++; } } return done; }
    redoTo(index) { let done = 0; for (let i = 0; i <= index; i++) { if (this.redo()) { done++; } } return done; }

    undo() {
      const entry = this._undo.pop();
      if (!entry) { return false; }
      const items = entry.items;
      items.slice().reverse().forEach(({ k, fact, prev }) => {
        if (prev === undefined) { this._pending.delete(k); } else { this._set(k, Object.assign({}, fact, { Value: prev })); }
      });
      this._redo.push(entry);
      this._fire();
      return true;
    }

    redo() {
      const entry = this._redo.pop();
      if (!entry) { return false; }
      entry.items.forEach(({ k, fact }) => this._set(k, fact));
      this._undo.push(entry);
      this._fire();
      return true;
    }

    /** The facts as they would be after publishing: pending values replace or add to the given facts. */
    overlay(facts) {
      if (!this._pending.size) { return facts; }
      const out = new Map();
      facts.forEach((f) => out.set(keyOf(f), f));
      this._pending.forEach((f, k) => out.set(k, f));
      return Array.from(out.values());
    }

    /** Changed facts of one model (all models when omitted). */
    pending(modelId) {
      return Array.from(this._pending.values()).filter((f) => !modelId || f.ModelId === modelId);
    }

    models() { return Array.from(new Set(this.pending().map((f) => f.ModelId))); }

    /** After publishing or discarding: forget everything. */
    clear() {
      this._pending.clear(); this._orig.clear(); this._undo = []; this._redo = [];
      this._fire();
    }
  }

  return PlanBuffer;
});
