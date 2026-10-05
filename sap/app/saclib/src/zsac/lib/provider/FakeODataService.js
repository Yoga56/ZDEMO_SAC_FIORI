/**
 * A small stand-in for an OData V4 service, for the sample data source and for tests: it answers $metadata, $top and the
 * $apply the app makes ( filter(...)/groupby((fields),aggregate(field with sum as Alias,...)) ) over rows held in memory.
 * It only understands the requests LiveSource builds; it is not a general OData implementation.
 *
 *   const fetch = FakeODataService.createFetch({ "mock://cds/ZSALES": { entitySet: "ZSales", properties: { Region: "Edm.String", Revenue: "Edm.Decimal" }, rows: () => [...] } });
 */
sap.ui.define([], function () {
  "use strict";

  /** Recursive descent over `(A eq 'x' or A eq 'y') and (...)`; returns a predicate over a row. */
  function parseFilter(text) {
    let i = 0;
    const ws = () => { while (text[i] === " ") { i++; } };
    const word = () => { ws(); const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i)); if (!m) { throw new Error("Cannot parse filter at " + i + ": " + text); } i += m[0].length; return m[0]; };
    const literal = () => {
      ws();
      if (text[i] === "'") { let s = ""; i++; while (i < text.length) { if (text[i] === "'" && text[i + 1] === "'") { s += "'"; i += 2; } else if (text[i] === "'") { i++; break; } else { s += text[i++]; } } return s; }
      const m = /^[^\s)]+/.exec(text.slice(i)); i += m[0].length; return /^-?\d+(\.\d+)?$/.test(m[0]) ? Number(m[0]) : m[0];
    };
    const atom = () => {
      ws();
      if (text[i] === "(") { i++; const p = or(); ws(); i++; return p; }
      const field = word(); const op = word(); const lit = literal();
      return (r) => {
        const v = r[field];
        switch (op) {
          case "eq": return v === lit || String(v) === String(lit);
          case "ge": return v >= lit; case "le": return v <= lit; case "gt": return v > lit; case "lt": return v < lit;
          default: throw new Error("Unsupported operator " + op);
        }
      };
    };
    const and = () => { const parts = [atom()]; for (;;) { ws(); if (text.slice(i, i + 4) === "and ") { i += 4; parts.push(atom()); } else { break; } } return (r) => parts.every((p) => p(r)); };
    const or = () => { const parts = [and()]; for (;;) { ws(); if (text.slice(i, i + 3) === "or ") { i += 3; parts.push(and()); } else { break; } } return (r) => parts.some((p) => p(r)); };
    return or();
  }

  function apply(rows, expr) {
    let rest = expr;
    let kept = rows;
    const f = /^filter\((.*?)\)\/groupby/.exec(rest);
    if (f) {
      // the filter ends where "/groupby(" starts; take everything between the outer parentheses
      const start = "filter(".length; const end = rest.indexOf(")/groupby(");
      kept = rows.filter(parseFilter(rest.slice(start, end)));
      rest = rest.slice(end + 2);
    }
    const g = /^groupby\(\(([^)]*)\)(?:,aggregate\((.*)\))?\)$/.exec(rest);
    if (!g) { throw new Error("Unsupported $apply: " + expr); }
    const fields = g[1].split(",").filter(Boolean);
    const aggs = (g[2] || "").split(",").filter(Boolean).map((a) => { const m = /^(\w+) with (\w+) as (\w+)$/.exec(a.trim()); return { field: m[1], method: m[2], alias: m[3] }; });
    const groups = new Map();
    kept.forEach((r) => {
      const key = fields.map((x) => r[x]).join("\u0001");
      if (!groups.has(key)) { groups.set(key, { row: fields.reduce((o, x) => { o[x] = r[x]; return o; }, {}), rows: [] }); }
      groups.get(key).rows.push(r);
    });
    return Array.from(groups.values()).map((gr) => {
      aggs.forEach((a) => {
        const vals = gr.rows.map((r) => r[a.field]).filter((v) => v !== null && v !== undefined).map(Number);
        gr.row[a.alias] = !vals.length ? null : a.method === "sum" ? vals.reduce((s, v) => s + v, 0) : a.method === "average" ? vals.reduce((s, v) => s + v, 0) / vals.length
          : a.method === "min" ? Math.min.apply(null, vals) : a.method === "max" ? Math.max.apply(null, vals) : null;
      });
      return gr.row;
    });
  }

  function metadata(svc) {
    const props = Object.keys(svc.properties).map((n) => '<Property Name="' + n + '" Type="' + svc.properties[n] + '"/>').join("");
    return '<?xml version="1.0"?><edmx:Edmx xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx" Version="4.0"><edmx:DataServices><Schema xmlns="http://docs.oasis-open.org/odata/ns/edm" Namespace="mock">'
      + '<EntityType Name="' + svc.entitySet + 'Type">' + props + '</EntityType><EntityContainer Name="c"><EntitySet Name="' + svc.entitySet + '" EntityType="mock.' + svc.entitySet + 'Type"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';
  }

  function createFetch(services) {
    const respond = (status, body) => ({ ok: status < 400, status, json: async () => (typeof body === "string" ? JSON.parse(body) : body), text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
    return async function (url) {
      const [path, qs] = String(url).split("?");
      const prefix = Object.keys(services).find((p) => path.indexOf(p) === 0);
      if (!prefix) { return respond(404, { error: { message: "No such service: " + path } }); }
      const svc = services[prefix];
      const tail = path.slice(prefix.length).replace(/^\/+/, "");
      if (tail === "$metadata") { return respond(200, metadata(svc)); }
      if (tail !== svc.entitySet) { return respond(404, { error: { message: "No such entity set: " + tail } }); }
      const params = new URLSearchParams(qs || "");
      try {
        let rows = svc.rows();
        if (params.get("$apply")) {
          if (svc.noApply) { return respond(501, { error: { message: "$apply is not supported" } }); }
          rows = apply(rows, params.get("$apply"));
        }
        if (params.get("$filter")) { rows = rows.filter(parseFilter(params.get("$filter"))); }
        if (params.get("$select")) { const cols = params.get("$select").split(","); rows = rows.map((r) => cols.reduce((o, c) => { o[c] = r[c]; return o; }, {})); }
        if (params.get("$top")) { rows = rows.slice(0, Number(params.get("$top"))); }
        return respond(200, { value: rows });
      } catch (e) {
        return respond(400, { error: { message: e.message } });
      }
    };
  }

  return { createFetch, parseFilter, apply };
});
