/**
 * Widths of the resizable side panels (pure): limits, keyboard steps and what is remembered between visits.
 *
 *   Resize.clamp(width, min, max) -> whole pixels within the limits (max is also kept below `room`, the space the panel's container has)
 *   Resize.next(width, direction, step) -> width after one key press
 *   Resize.read(storage, key, fallback) / write(storage, key, width) / clear(storage, key)   storage is localStorage or anything like it; a failing storage is ignored
 */
sap.ui.define([], function () {
  "use strict";

  const STORE = "zsac.layout.v1";

  function clamp(width, min, max, room) {
    const w = Number(width);
    if (!isFinite(w)) { return min; }
    const top = room > 0 ? Math.max(min, Math.min(max, Math.floor(room * 0.7))) : max; // a panel never takes more than 70% of what it sits in
    return Math.round(Math.min(top, Math.max(min, w)));
  }

  const next = (width, direction, step) => width + (direction < 0 ? -1 : 1) * (step || 16);

  function all(storage) {
    try { const o = JSON.parse(storage.getItem(STORE)); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
  }
  function read(storage, key, fallback) {
    const v = Number(all(storage)[key]);
    return isFinite(v) && v > 0 ? v : fallback;
  }
  function write(storage, key, width) {
    try { const o = all(storage); o[key] = Math.round(width); storage.setItem(STORE, JSON.stringify(o)); } catch (e) { /* private mode or full: the width is not kept */ }
  }
  function clear(storage, key) {
    try { const o = all(storage); delete o[key]; storage.setItem(STORE, JSON.stringify(o)); } catch (e) { /* ignore */ }
  }

  return { clamp, next, read, write, clear, STORE };
});
