/**
 * HTML for a variance analysis (see core/VarianceEngine): the headline numbers and the bars of one dimension.
 * Plain strings, so the dialog and the story widget draw the same thing; a row carries data-m="member" for drilling.
 */
sap.ui.define(["../core/Format"], function (Format) {
  "use strict";

  const esc = Format.esc;
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "-" : "");
  const num = (v) => sign(v) + Format.compact(Math.abs(v));
  const cls = (favorable) => (favorable === null ? "neutral" : favorable ? "good" : "bad");

  /** Compare, base, change and the sentence. */
  function summaryHtml(result, labels, unit) {
    if (result.error) { return '<div class="zsacVMsg">' + esc(result.error) + "</div>"; }
    const l = Object.assign({ base: "Reference", compare: "Comparison" }, labels);
    const pct = result.pct === null ? "" : " (" + sign(result.pct) + Math.abs(result.pct).toFixed(1) + "%)";
    return '<div class="zsacVSummary">'
      + '<div><span class="zsacVCap">' + esc(l.compare) + '</span><span class="zsacVBig">' + Format.compact(result.compare) + esc(unit ? " " + unit : "") + "</span></div>"
      + '<div><span class="zsacVCap">' + esc(l.base) + '</span><span class="zsacVBig">' + Format.compact(result.base) + esc(unit ? " " + unit : "") + "</span></div>"
      + '<div><span class="zsacVCap">Change</span><span class="zsacVBig zsacV-' + cls(result.favorable) + '">' + num(result.delta) + esc(pct) + "</span></div>"
      + "</div>"
      + (result.narrative && result.narrative.text ? '<div class="zsacVText">' + esc(result.narrative.text) + "</div>" : "");
  }

  /** The members of one dimension as bars: the biggest changes first, the rest summed up. */
  function barsHtml(dim, limit) {
    if (!dim) { return '<div class="zsacVMsg">Nothing to break down: the data has a single member in every dimension.</div>'; }
    const max = Math.max.apply(null, dim.rows.map((r) => Math.abs(r.delta)).concat([1e-9]));
    const shown = dim.rows.slice(0, limit || 10);
    const rest = dim.rows.slice(shown.length);
    let h = '<div class="zsacVBars">';
    shown.forEach((r) => {
      h += '<div class="zsacVRow" data-m="' + esc(r.member) + '" title="' + esc(r.label + ": " + Format.compact(r.base) + " to " + Format.compact(r.compare)) + '">'
        + '<span class="zsacVLabel">' + esc(Format.truncate(r.label, 28)) + "</span>"
        + '<span class="zsacVBarWrap"><span class="zsacVBar zsacVb-' + cls(r.favorable) + '" style="width:' + Math.max(1, Math.round(Math.abs(r.delta) / max * 100)) + '%"></span></span>'
        + '<span class="zsacVNum zsacV-' + cls(r.favorable) + '">' + num(r.delta) + "</span>"
        + '<span class="zsacVShare">' + (r.share === null ? "" : Math.round(r.share * 100) + "%") + "</span></div>";
    });
    if (rest.length) {
      const sum = rest.reduce((s, r) => s + r.delta, 0);
      h += '<div class="zsacVRow zsacVRest"><span class="zsacVLabel">' + rest.length + ' more</span><span class="zsacVBarWrap"></span><span class="zsacVNum">' + num(sum) + '</span><span class="zsacVShare"></span></div>';
    }
    return h + "</div>";
  }

  return { summaryHtml, barsHtml };
});
