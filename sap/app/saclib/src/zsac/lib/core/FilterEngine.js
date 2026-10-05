/**
 * Filter helpers: merging story / widget / input-control filters and the search-and-replace
 * operation for filter values (SAC release highlight "search and replace for table filters").
 * A filter set is { dimId: [members] }.
 */
sap.ui.define([], function () {
  "use strict";

  /** Later sets narrow earlier ones: a dimension present in both keeps only the common members. */
  function merge(/* ...sets */) {
    const out = {};
    Array.prototype.slice.call(arguments).forEach((set) => {
      Object.keys(set || {}).forEach((dim) => {
        const members = (set[dim] || []).map(String);
        if (!members.length) { return; }
        out[dim] = out[dim] ? out[dim].filter((m) => members.indexOf(m) >= 0) : members.slice();
      });
    });
    return out;
  }

  /** Replace `search` by `replace` inside every member of one dimension's filter (plain text, case-insensitive). */
  function searchReplace(filters, dimId, search, replace) {
    const out = Object.assign({}, filters);
    if (!out[dimId] || !search) { return out; }
    const needle = String(search).toLowerCase();
    const next = out[dimId].map((m) => {
      const i = String(m).toLowerCase().indexOf(needle);
      return i < 0 ? m : String(m).slice(0, i) + replace + String(m).slice(i + needle.length);
    });
    out[dimId] = Array.from(new Set(next));
    return out;
  }

  function isEmpty(filters) {
    return !Object.keys(filters || {}).some((k) => (filters[k] || []).length);
  }

  function describe(filters) {
    return Object.keys(filters || {}).filter((k) => (filters[k] || []).length)
      .map((k) => k + ": " + filters[k].join(", ")).join(" | ");
  }

  return { merge, searchReplace, isEmpty, describe };
});
