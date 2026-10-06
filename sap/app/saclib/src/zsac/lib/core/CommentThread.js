/**
 * The comments a story shows (pure). A comment belongs to a model and a version, and may point at a cell (period, measure and
 * members). The comment widget shows the ones that fit the story's filters, and writes new ones at the level of the story's filters.
 *
 *   CommentThread.visible(comments, { versionId, filters }) -> comments that apply
 *   CommentThread.where(comment, model) -> "EMEA, Jul 2026, Revenue" (what the comment is about, empty for a general one)
 *   CommentThread.create(text, { modelId, versionId, filters, measure, author }) -> comment to save, or { error }
 */
sap.ui.define(["./Format"], function (Format) {
  "use strict";

  const MAX = 1000;

  function visible(comments, opts) {
    const filters = (opts && opts.filters) || {};
    return (comments || []).filter((c) => {
      if (opts && opts.versionId && c.VersionId !== opts.versionId) { return false; }
      // a comment on a cell shows when the story filters do not exclude that cell
      const dims = c.Dims || {};
      return Object.keys(filters).every((d) => {
        if (!filters[d] || !filters[d].length || d === "VERSION" || d === "MEASURE") { return true; }
        const own = d === "PERIOD" ? c.Period : dims[d];
        return own === undefined || own === "" || own === null || filters[d].indexOf(own) >= 0;
      });
    }).slice().sort((a, b) => String(a.At).localeCompare(String(b.At)));
  }

  function where(c, model) {
    const parts = [];
    const dims = c.Dims || {};
    Object.keys(dims).forEach((d) => {
      const dim = ((model && model.Dimensions) || []).find((x) => x.DimId === d);
      const mem = ((dim && dim.Members) || []).find((x) => x.Id === dims[d]);
      parts.push(mem && mem.Text ? mem.Text : dims[d]);
    });
    if (c.Period) { parts.push(Format.period(c.Period)); }
    if (c.Measure) { const m = ((model && model.Measures) || []).find((x) => x.MeasureId === c.Measure); parts.push(m && m.Label ? m.Label : c.Measure); }
    return parts.join(", ");
  }

  let counter = 0;
  function create(text, ctx) {
    const t = String(text || "").trim();
    if (!t) { return { error: "Write a comment first" }; }
    if (t.length > MAX) { return { error: "A comment can have " + MAX + " characters at most (this one has " + t.length + ")" }; }
    if (!ctx.versionId) { return { error: "Choose one version in the filters of the widget so the comment knows where it belongs" }; }
    const dims = {};
    Object.keys(ctx.filters || {}).forEach((d) => { if (d !== "VERSION" && d !== "MEASURE" && d !== "PERIOD" && ctx.filters[d].length === 1) { dims[d] = ctx.filters[d][0]; } });
    const c = { Id: "C" + Date.now().toString(36) + (counter++).toString(36) + Math.floor(Math.random() * 46656).toString(36), ModelId: ctx.modelId, VersionId: ctx.versionId,
      Period: (ctx.filters && ctx.filters.PERIOD && ctx.filters.PERIOD.length === 1) ? ctx.filters.PERIOD[0] : "", Measure: ctx.measure || "", Dims: dims, Text: t };
    if (ctx.author) { c.Author = ctx.author; } // otherwise the data source names the user
    return c;
  }

  return { visible, where, create, MAX };
});
