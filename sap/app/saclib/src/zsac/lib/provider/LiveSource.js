/**
 * A CDS view (or any OData V4 entity) as the source of a model.
 *
 * model.Source = {
 *   Type: "CDS", Mode: "LIVE" | "IMPORT",
 *   Service: "/sap/opu/odata4/sap/zui_sales/srvd_a2x/sap/zsales/0001/",   base URL of the service (relative to this server, or absolute)
 *   Entity: "SalesCube",                                                  the entity set
 *   Version: "ACT",                                                       LIVE: the version the rows belong to (a model with a live source has this one version)
 *   PeriodField: "FiscalPeriod", PeriodFormat: "YYYYMM" | "YYYY-MM" | "DATE",
 *   Dims: { REGION: "Region", ... },                                      model dimension -> field of the entity
 *   Texts: { REGION: "RegionName" },                                      optional text field of a dimension (only used to name members)
 *   Measures: { REVENUE: "NetAmount", ... },                              model measure -> field of the entity
 *   Client: "100",                                                        optional: the client of the backend to read from (sent as sap-client), when it is not the one of the destination
 *   MaxRows: 100000 }
 *
 * LIVE reads on demand, aggregated by the service ($apply groupby/aggregate), so the view should be a cube or an aggregating view;
 * every query is made by the current session, so the CDS access control applies to the user. IMPORT uses the same mapping to copy rows into a
 * version of an ordinary planning model (see DataProvider.importFromSource).
 *
 * fetchJson(url) -> Promise<object>, fetchText(url) -> Promise<string> are injected so the module runs in tests and against a fake service.
 */
sap.ui.define([], function () {
  "use strict";

  const FORMATS = ["YYYYMM", "YYYY-MM", "DATE"];
  const METHODS = { SUM: "sum", AVG: "average", MIN: "min", MAX: "max" };
  const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
  /** Alias of an aggregated measure in $apply. A service compares property names without regard to case, so an alias like AMOUNT would clash with a field called Amount. */
  const alias = (measureId) => "ZSAC_" + measureId;
  const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  const pad = (n) => String(n).padStart(2, "0");

  function defaults(src) {
    return Object.assign({ Type: "CDS", Mode: "LIVE", Service: "", Entity: "", Version: "ACT", PeriodField: "", PeriodFormat: "YYYYMM", Dims: {}, Texts: {}, Measures: {}, Client: "", MaxRows: 100000 }, src || {});
  }

  /** "202603" / "2026-03" / "2026-03-15" -> "2026-03"; null when it is not a period. */
  function toPeriod(raw, format) {
    if (raw === null || raw === undefined) { return null; }
    const s = String(raw).trim();
    let y; let m;
    if (format === "YYYYMM") { const r = /^(\d{4})(\d{2})$/.exec(s); if (!r) { return null; } y = r[1]; m = r[2]; }
    else if (format === "YYYY-MM") { const r = /^(\d{4})-(\d{2})$/.exec(s); if (!r) { return null; } y = r[1]; m = r[2]; }
    else { const r = /^(\d{4})-(\d{2})-\d{2}/.exec(s); if (!r) { return null; } y = r[1]; m = r[2]; }
    return +m >= 1 && +m <= 12 ? y + "-" + m : null;
  }

  function lastDay(period) { return new Date(Date.UTC(+period.slice(0, 4), +period.slice(5), 0)).getUTCDate(); }

  /** The $filter condition for the months of a PERIOD filter. */
  function periodCondition(src, months) {
    if (src.PeriodFormat === "DATE") {
      return months.map((p) => "(" + src.PeriodField + " ge " + p + "-01 and " + src.PeriodField + " le " + p + "-" + pad(lastDay(p)) + ")").join(" or ");
    }
    return months.map((p) => src.PeriodField + " eq " + q(src.PeriodFormat === "YYYYMM" ? p.replace("-", "") : p)).join(" or ");
  }

  /**
   * The request for the facts of a model: { url, fields } where fields lists what a row carries.
   * filters: { DIM: [member], PERIOD: [month], MEASURE: [measure] } with hierarchy nodes already expanded (QueryEngine.expandFilters).
   */
  function buildQuery(model, filters) {
    const src = defaults(model.Source);
    const dims = (model.Dimensions || []).filter((d) => src.Dims[d.DimId]);
    const terms = filterTerms(model, src, filters);
    const wanted = ((filters && filters.MEASURE) || []);
    const measures = (model.Measures || []).filter((m) => src.Measures[m.MeasureId] && (!wanted.length || wanted.indexOf(m.MeasureId) >= 0));
    const group = [src.PeriodField].concat(dims.map((d) => src.Dims[d.DimId]));
    const aggregate = measures.map((m) => src.Measures[m.MeasureId] + " with " + (METHODS[m.Aggregation] || "sum") + " as " + alias(m.MeasureId));
    const apply = (terms.length ? "filter(" + terms.join(" and ") + ")/" : "") + "groupby((" + group.join(",") + "),aggregate(" + aggregate.join(",") + "))";
    const plain = link(src, base(src), ["$select=" + encodeURIComponent(group.concat(measures.map((m) => src.Measures[m.MeasureId])).filter((x, i, a) => a.indexOf(x) === i).join(","))]
      .concat(terms.length ? ["$filter=" + encodeURIComponent(terms.join(" and "))] : []));
    return { url: link(src, base(src), ["$apply=" + encodeURIComponent(apply)]), plainUrl: plain, measures: measures.map((m) => m.MeasureId), dims: dims.map((d) => d.DimId) };
  }

  /** The $filter conditions of the dimension, period and (not here) measure filters. */
  function filterTerms(model, src, filters) {
    const terms = [];
    (model.Dimensions || []).forEach((d) => {
      const members = (filters && filters[d.DimId]) || [];
      if (members.length && src.Dims[d.DimId]) { terms.push("(" + members.map((m) => src.Dims[d.DimId] + " eq " + q(m)).join(" or ") + ")"); }
    });
    const months = ((filters && filters.PERIOD) || []).filter((p) => /^\d{4}-\d{2}$/.test(p));
    if (months.length) { terms.push("(" + periodCondition(src, months) + ")"); }
    return terms;
  }

  const base = (src) => String(src.Service).replace(/\/+$/, "") + "/" + src.Entity;

  /** path?sap-client=..&params : the client of the source, when it has one, goes first. */
  function link(src, path, params) {
    const all = (src.Client ? ["sap-client=" + encodeURIComponent(src.Client)] : []).concat(params || []);
    return path + (all.length ? "?" + all.join("&") : "");
  }

  async function pages(url, fetchJson, maxRows) {
    const rows = [];
    let next = url;
    while (next) {
      const body = await fetchJson(next);
      (body.value || []).forEach((r) => rows.push(r));
      if (rows.length > maxRows) { throw new Error("The source returned more than " + maxRows + " rows. Filter by period or dimension, or aggregate in the CDS view."); }
      next = body["@odata.nextLink"] ? new URL(body["@odata.nextLink"], new URL(url, "http://x/")).href.replace(/^http:\/\/x/, "") : null;
    }
    return rows;
  }

  /** A service that cannot do $apply says so with 501, 405 or a 400 that mentions it; the plain read is used instead (and remembered). */
  const noApply = new Set();
  const applyUnsupported = (e) => !!e && (e.status === 501 || e.status === 405 || (e.status === 400 && /apply|aggregat/i.test(e.message || "")));

  /**
   * Facts of a LIVE model (or of the source of an IMPORT model): rows of the service turned into facts.
   * The service aggregates ($apply). If it cannot, the rows are read as they are ($select, $filter) and aggregated here, which needs
   * the view to be small enough (MaxRows); months of a date field are merged either way.
   */
  async function readFacts(model, filters, fetchJson) {
    const src = defaults(model.Source);
    if (filters && filters.VERSION && filters.VERSION.length && filters.VERSION.indexOf(src.Version) < 0) { return []; }
    const query = buildQuery(model, filters);
    if (!query.measures.length) { return []; }
    const key = src.Service + "|" + src.Entity;
    let rows;
    let applied = true;
    if (noApply.has(key)) { rows = await pages(query.plainUrl, fetchJson, src.MaxRows || 100000); applied = false; }
    else {
      try { rows = await pages(query.url, fetchJson, src.MaxRows || 100000); } catch (e) {
        if (!applyUnsupported(e)) { throw e; }
        noApply.add(key);
        rows = await pages(query.plainUrl, fetchJson, src.MaxRows || 100000);
        applied = false;
      }
    }
    const slots = new Map((model.Dimensions || []).map((d) => [d.DimId, d.Slot]));
    const merged = new Map();
    const agg = new Map((model.Measures || []).map((m) => [m.MeasureId, m.Aggregation]));
    rows.forEach((r) => {
      const period = toPeriod(r[src.PeriodField], src.PeriodFormat);
      if (!period || period < model.PeriodFrom || period > model.PeriodTo) { return; }
      const dim = { Dim1: "", Dim2: "", Dim3: "", Dim4: "", Dim5: "" };
      query.dims.forEach((id) => { const v = r[src.Dims[id]]; dim["Dim" + slots.get(id)] = v === null || v === undefined ? "" : String(v); });
      query.measures.forEach((m) => {
        const raw = applied ? r[alias(m)] : r[src.Measures[m]];
        if (raw === null || raw === undefined || raw === "") { return; }
        const value = Number(raw);
        if (!Number.isFinite(value)) { return; }
        const k = [period, m, dim.Dim1, dim.Dim2, dim.Dim3, dim.Dim4, dim.Dim5].join("|");
        const have = merged.get(k);
        if (!have) { merged.set(k, { fact: Object.assign({ ModelId: model.ModelId, VersionId: src.Version, Period: period, Measure: m }, dim), sum: value, count: 1, min: value, max: value }); return; }
        have.sum += value; have.count++; have.min = Math.min(have.min, value); have.max = Math.max(have.max, value);
      });
    });
    return Array.from(merged.values()).map((x) => {
      const method = agg.get(x.fact.Measure);
      const v = method === "MIN" ? x.min : method === "MAX" ? x.max : method === "AVG" ? x.sum / x.count : x.sum;
      return Object.assign(x.fact, { Value: Math.round(v * 1e6) / 1e6 });
    });
  }

  /** The distinct combinations of some fields: groupby by the service, or a plain $select when it cannot. */
  async function groupedRows(src, fields, fetchJson) {
    const key = src.Service + "|" + src.Entity;
    const plain = () => pages(link(src, base(src), ["$select=" + encodeURIComponent(fields.join(","))]), fetchJson, src.MaxRows || 100000);
    if (noApply.has(key)) { return plain(); }
    try { return await pages(link(src, base(src), ["$apply=" + encodeURIComponent("groupby((" + fields.join(",") + "))")]), fetchJson, src.MaxRows || 100000); } catch (e) {
      if (!applyUnsupported(e)) { throw e; }
      noApply.add(key);
      return plain();
    }
  }

  /**
   * Members of the dimensions and the first and last period found in the source: { Members: {DIMID: [{Id, Text}]}, PeriodFrom, PeriodTo }.
   * One request per dimension (groupby of its field and text field), one for the period field.
   */
  async function loadMembers(model, fetchJson) {
    const src = defaults(model.Source);
    const out = { Members: {}, PeriodFrom: "", PeriodTo: "" };
    for (const d of model.Dimensions || []) {
      const field = src.Dims[d.DimId];
      if (!field) { continue; }
      const text = src.Texts && src.Texts[d.DimId];
      const rows = await groupedRows(src, [field].concat(text ? [text] : []), fetchJson);
      const seen = new Map();
      rows.forEach((r) => {
        const id = r[field];
        if (id === null || id === undefined || id === "") { return; }
        if (!seen.has(String(id))) { seen.set(String(id), text && r[text] ? String(r[text]) : String(id)); }
      });
      out.Members[d.DimId] = Array.from(seen.keys()).sort().map((id) => ({ Id: id, Text: seen.get(id) }));
    }
    if (src.PeriodField) {
      const rows = await groupedRows(src, [src.PeriodField], fetchJson);
      const periods = rows.map((r) => toPeriod(r[src.PeriodField], src.PeriodFormat)).filter(Boolean).sort();
      if (periods.length) { out.PeriodFrom = periods[0]; out.PeriodTo = periods[periods.length - 1]; }
    }
    return out;
  }

  /**
   * The entity sets of a service with their properties, read from $metadata:
   *   [{ name, properties: [{ name, type }] }]
   * (a regular expression over the CSDL, which is regular enough for this; annotations are ignored).
   */
  function parseMetadata(xml) {
    const types = new Map();
    String(xml).replace(/<EntityType\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/g, (all, name, body) => {
      const props = [];
      body.replace(/<Property\s+([^>]*?)\/?>/g, (m, attrs) => {
        const n = /Name="([^"]+)"/.exec(attrs); const t = /Type="([^"]+)"/.exec(attrs);
        if (n) { props.push({ name: n[1], type: t ? t[1] : "" }); }
        return m;
      });
      types.set(name, props);
      return all;
    });
    const sets = [];
    String(xml).replace(/<EntitySet\s+([^>]*?)\/?>/g, (m, attrs) => {
      const n = /Name="([^"]+)"/.exec(attrs); const t = /EntityType="([^"]+)"/.exec(attrs);
      if (n && t) { sets.push({ name: n[1], properties: types.get(t[1].split(".").pop()) || [] }); }
      return m;
    });
    return sets;
  }

  async function discover(service, fetchText, client) {
    return parseMetadata(await fetchText(link({ Client: client }, String(service).replace(/\/+$/, "") + "/$metadata")));
  }

  /** What is wrong with a source definition against the model, empty when it can be used. */
  function validate(model) {
    const src = model.Source ? defaults(model.Source) : null;
    const p = [];
    if (!src) { return p; }
    if (!/^(\/|https?:\/\/|mock:\/\/)/.test(src.Service || "")) { p.push("Data source: the service URL starts with / (this server), https:// or http://"); }
    if (src.Client && !/^\d{3}$/.test(src.Client)) { p.push("Data source: the client is three digits, for example 100"); }
    if (!IDENT.test(src.Entity || "")) { p.push("Data source: choose the entity set"); }
    if (["LIVE", "IMPORT"].indexOf(src.Mode) < 0) { p.push("Data source: unknown mode " + src.Mode); }
    if (!IDENT.test(src.PeriodField || "")) { p.push("Data source: choose the field with the period"); }
    if (FORMATS.indexOf(src.PeriodFormat) < 0) { p.push("Data source: unknown period format " + src.PeriodFormat); }
    if (src.Mode === "LIVE" && !/^[A-Z][A-Z0-9_]*$/.test(src.Version || "")) { p.push("Data source: the version of live data is capital letters, digits and underscore"); }
    (model.Dimensions || []).forEach((d) => { if (!IDENT.test((src.Dims || {})[d.DimId] || "")) { p.push("Data source: choose the field of dimension " + d.DimId); } });
    (model.Measures || []).forEach((m) => {
      if (!IDENT.test((src.Measures || {})[m.MeasureId] || "")) { p.push("Data source: choose the field of measure " + m.MeasureId); }
      if (m.Aggregation === "COUNT") { p.push("Data source: measure " + m.MeasureId + " counts, which a CDS source cannot aggregate (use sum, average, minimum or maximum)"); }
      if (src.PeriodFormat === "DATE" && m.Aggregation === "AVG") { p.push("Data source: measure " + m.MeasureId + " averages, which a date field cannot give by month (use a month field or another aggregation)"); }
    });
    return p;
  }

  /** The one version a model with a live source has. */
  function liveVersion(model) {
    const src = defaults(model.Source);
    return { ModelId: model.ModelId, VersionId: src.Version, Name: "Live data", Category: "ACTUAL", Locked: true, Owner: "SYSTEM", SourceVersion: "", Status: "P" };
  }

  const isLive = (model) => !!(model && model.Source && model.Source.Mode === "LIVE");

  /** fetch based readers for the browser; a relative service URL goes to this server with the session of the user. */
  function browserFetch(fetchFn) {
    const f = fetchFn || ((u, i) => window.fetch(u, i));
    const fail = async (res) => {
      let detail = "";
      try { const b = await res.json(); const m = b && b.error && b.error.message; detail = typeof m === "string" ? m : (m && m.value) || ""; } catch (e) { /* not json */ }
      throw Object.assign(new Error("The data source answered " + res.status + (detail ? ": " + detail : "")), { status: res.status });
    };
    return {
      json: async (url) => { const res = await f(url, { headers: { Accept: "application/json" }, credentials: "same-origin" }); if (!res.ok) { await fail(res); } return res.json(); },
      text: async (url) => { const res = await f(url, { headers: { Accept: "application/xml" }, credentials: "same-origin" }); if (!res.ok) { await fail(res); } return res.text(); }
    };
  }

  /** Forgets which services cannot aggregate (tests, or after a service was upgraded). */
  const resetCapabilities = () => noApply.clear();

  return { FORMATS, resetCapabilities, defaults, toPeriod, buildQuery, readFacts, loadMembers, parseMetadata, discover, validate, liveVersion, isLive, browserFetch };
});
