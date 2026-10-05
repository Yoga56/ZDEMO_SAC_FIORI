/**
 * Unpublished plan changes (pure). Planners edit into this buffer; "Publish Data" writes it to the provider in one go.
 * Widgets that read plan data apply `overlay()` so they show the unpublished numbers; undo and redo work on whole edits
 * (a spread over many facts is one step).
 *
 *   buffer.apply(changes, baseLookup)   changes = facts with their new Value; baseLookup(fact) -> stored value or null (new fact)
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
    }

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
    apply(changes, baseLookup) {
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
      if (items.length) { this._undo.push(items); this._redo = []; this._fire(); }
    }

    undo() {
      const items = this._undo.pop();
      if (!items) { return false; }
      items.slice().reverse().forEach(({ k, fact, prev }) => {
        if (prev === undefined) { this._pending.delete(k); } else { this._set(k, Object.assign({}, fact, { Value: prev })); }
      });
      this._redo.push(items);
      this._fire();
      return true;
    }

    redo() {
      const items = this._redo.pop();
      if (!items) { return false; }
      items.forEach(({ k, fact }) => this._set(k, fact));
      this._undo.push(items);
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
