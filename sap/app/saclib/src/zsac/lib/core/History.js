/**
 * Undo and redo over snapshots of an editor's state (pure). The editor records its state after every change; the history keeps the
 * earlier ones. A state is anything that can be turned into JSON; the history stores it as text, so later changes cannot reach into it.
 *
 *   const h = History.create(limit)
 *   h.reset(state)        starts again from this state (opening something)
 *   h.record(state)       true when it differs from the current one and was added; a new change drops what could be redone
 *   h.undo() / h.redo()   the state to show, or undefined when there is nothing to go back or forward to
 *   h.canUndo / h.canRedo
 */
sap.ui.define([], function () {
  "use strict";

  function create(limit) {
    const max = limit || 100;
    let past = [];
    let future = [];
    let current = null;
    return {
      reset(state) { past = []; future = []; current = JSON.stringify(state); },
      record(state) {
        const s = JSON.stringify(state);
        if (current === null) { current = s; return false; }
        if (s === current) { return false; }
        past.push(current);
        if (past.length > max) { past.shift(); }
        future = [];
        current = s;
        return true;
      },
      undo() {
        if (!past.length) { return undefined; }
        future.push(current);
        current = past.pop();
        return JSON.parse(current);
      },
      redo() {
        if (!future.length) { return undefined; }
        past.push(current);
        current = future.pop();
        return JSON.parse(current);
      },
      get canUndo() { return past.length > 0; },
      get canRedo() { return future.length > 0; }
    };
  }

  return { create };
});
