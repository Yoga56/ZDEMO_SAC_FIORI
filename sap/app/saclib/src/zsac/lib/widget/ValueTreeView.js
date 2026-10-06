/**
 * HTML of a value driver tree (see core/ValueTree), left to right: the top node on the left, its drivers to the right.
 * Plain string, so a test can check it; leaves carry an input (data-n = node id) for the simulation.
 */
sap.ui.define(["../core/Format", "../core/ValueTree"], function (Format, ValueTree) {
  "use strict";

  const esc = Format.esc;
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "-" : "");
  const cls = (f) => (f === null || f === undefined ? "neutral" : f ? "good" : "bad");
  const num = (v) => (v === null || v === undefined ? "n/a" : Format.compact(v));

  function card(n, opts) {
    const ov = (opts.overrides || {})[n.id] || {};
    let h = '<div class="zsacVTNode zsacVTop-' + n.op + (n.simulated ? " zsacVTSim" : "") + '" data-id="' + esc(n.id) + '">'
      + '<div class="zsacVTLabel" title="' + esc(n.label) + '">' + esc(Format.truncate(n.label, 26)) + "</div>"
      + '<div class="zsacVTValue">' + num(n.value) + (opts.unit && n.value !== null ? ' <span class="zsacVTUnit">' + esc(opts.unit) + "</span>" : "") + "</div>";
    if (opts.hasCompare && n.delta !== null && n.delta !== undefined) {
      h += '<div class="zsacVTDelta zsacV-' + cls(n.favorable) + '" title="' + esc(opts.compareLabel + ": " + num(n.compare)) + '">'
        + sign(n.delta) + Format.compact(Math.abs(n.delta)) + (n.pct === null ? "" : " (" + sign(n.pct) + Math.abs(n.pct).toFixed(1) + "%)") + " vs " + esc(opts.compareLabel) + "</div>";
    }
    if (n.simulated) {
      h += '<div class="zsacVTSimText">simulated ' + sign(n.simulated) + Format.compact(Math.abs(n.simulated))
        + (n.simulatedPct === null ? "" : " (" + sign(n.simulatedPct) + Math.abs(n.simulatedPct).toFixed(1) + "%)") + "</div>";
    }
    if (n.op === "leaf" && opts.simulate) {
      h += '<div class="zsacVTSimBox"><input class="zsacVTPct" data-n="' + esc(n.id) + '" type="number" step="1" placeholder="0" title="Change this driver by a percentage"'
        + (ov.pct !== undefined && ov.pct !== "" ? ' value="' + esc(ov.pct) + '"' : "") + '><span>%</span></div>';
    }
    return h + "</div>";
  }

  function branch(n, opts) {
    let h = '<div class="zsacVTBranch">' + card(n, opts);
    if (n.children.length) {
      h += '<div class="zsacVTKids"><div class="zsacVTOp" title="' + esc(n.op) + '">' + (ValueTree.SYMBOL[n.op] || "") + "</div>";
      n.children.forEach((c) => { h += '<div class="zsacVTKid">' + branch(c, opts) + "</div>"; });
      h += "</div>";
    }
    return h + "</div>";
  }

  /** opts: { hasCompare, compareLabel, simulate, overrides, unit } */
  function html(tree, opts) {
    return '<div class="zsacVT">' + branch(tree, opts || {}) + "</div>";
  }

  return { html };
});
