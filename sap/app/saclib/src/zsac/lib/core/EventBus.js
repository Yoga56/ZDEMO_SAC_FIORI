/** Tiny publish/subscribe bus so widgets on one canvas can react to filter changes without knowing each other. */
sap.ui.define([], function () {
  "use strict";

  function EventBus() { this._h = {}; }

  EventBus.prototype.on = function (name, fn, ctx) {
    (this._h[name] = this._h[name] || []).push({ fn, ctx });
    return () => this.off(name, fn);
  };

  EventBus.prototype.off = function (name, fn) {
    this._h[name] = (this._h[name] || []).filter((h) => h.fn !== fn);
  };

  EventBus.prototype.fire = function (name, payload) {
    (this._h[name] || []).slice().forEach((h) => h.fn.call(h.ctx, payload));
  };

  return EventBus;
});
