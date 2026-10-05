/**
 * Data Import step (pure): turns the rows of a CSV into plan facts of a model.
 *
 * The CSV has a header line. The mapping says what every column is:
 *   VERSION | PERIOD | MEASURE | VALUE | MEASURE:<id> | a dimension id | "" (ignored)
 * Long format: one value per line in the VALUE column, the measure from a MEASURE column or fixed by the step (MeasureId).
 * Wide format: one column per measure (MEASURE:REVENUE, MEASURE:COST ...), every line gives a value for each of them; an empty cell gives none.
 * What the file does not carry is fixed by the step: the version (TargetVersion) and, in long format, the measure (MeasureId).
 *
 *   ImportEngine.header(text)                       the column names
 *   ImportEngine.guessMapping(model, header)        mapping by matching the names to ids and labels of the model
 *   ImportEngine.build(model, versions, text, step, ctx)  { facts, rejects: [{ line, reason }], rows }
 *      ctx = { targetVersion, measureId }           the step's version and measure with parameters resolved
 */
sap.ui.define(["../core/CsvParser"], function (CsvParser) {
  "use strict";

  const norm = (s) => String(s || "").trim().toLowerCase().replace(/[\s_\-]+/g, "");
  const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

  function header(text) {
    const rows = CsvParser.parse(text);
    return rows.length ? rows[0].map((h) => String(h).trim()) : [];
  }

  function guessMapping(model, names) {
    const targets = [["VERSION", ["version"]], ["PERIOD", ["period", "date", "month", "calendarmonth"]], ["MEASURE", ["measure", "account", "kpi"]], ["VALUE", ["value", "amount", "number", "quantity"]]];
    (model.Dimensions || []).forEach((d) => targets.push([d.DimId, [norm(d.DimId), norm(d.Label)]]));
    (model.Measures || []).forEach((m) => targets.push(["MEASURE:" + m.MeasureId, [norm(m.MeasureId), norm(m.Label)]]));
    const used = new Set();
    const mapping = {};
    names.forEach((n) => {
      const hit = targets.find(([id, keys]) => !used.has(id) && (keys.indexOf(norm(n)) >= 0 || norm(id) === norm(n)));
      mapping[n] = hit ? hit[0] : "";
      if (hit) { used.add(hit[0]); }
    });
    return mapping;
  }

  function build(model, versions, text, step, ctx) {
    const rows = CsvParser.parse(text);
    const rejects = [];
    const facts = [];
    if (rows.length < 2) { return { facts, rejects: [{ line: 1, reason: "The CSV needs a header line and at least one data line" }], rows: 0 }; }
    const names = rows[0].map((h) => String(h).trim());
    const mapping = step.Mapping || {};
    const column = {};
    const wide = [];
    names.forEach((n, i) => {
      const t = mapping[n];
      if (t && t.indexOf("MEASURE:") === 0) { wide.push([t.slice(8), i]); } else if (t && column[t] === undefined) { column[t] = i; }
    });
    const dims = model.Dimensions || [];
    const members = new Map(dims.map((d) => [d.DimId, new Set((d.Members || []).map((m) => m.Id))]));
    const measures = new Set((model.Measures || []).map((m) => m.MeasureId));
    const versionIds = new Map((versions || []).map((v) => [v.VersionId, v]));
    const seen = new Map();
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const reject = (reason) => rejects.push({ line, reason });
      const get = (t) => (column[t] === undefined ? "" : String(r[column[t]] === undefined ? "" : r[column[t]]).trim());
      const version = column.VERSION !== undefined ? get("VERSION") : ctx.targetVersion;
      const period = get("PERIOD");
      const longFormat = !wide.length;
      const measure = column.MEASURE !== undefined ? get("MEASURE") : ctx.measureId;
      const rawValue = get("VALUE");
      if (!versionIds.has(version)) { return reject("unknown version " + (version || "(empty)")); }
      if (versionIds.get(version).Locked) { return reject("version " + version + " is locked"); }
      if (!PERIOD.test(period)) { return reject("period " + (period || "(empty)") + " is not of the form 2026-03"); }
      if (period < model.PeriodFrom || period > model.PeriodTo) { return reject("period " + period + " is outside the model (" + model.PeriodFrom + " to " + model.PeriodTo + ")"); }
      const base = { VersionId: version, Period: period, Dim1: "", Dim2: "", Dim3: "", Dim4: "", Dim5: "" };
      for (const d of dims) {
        const m = get(d.DimId);
        if (!members.get(d.DimId).has(m)) { return reject("unknown " + (d.Label || d.DimId) + " member " + (m || "(empty)")); }
        base["Dim" + d.Slot] = m;
      }
      const values = [];
      if (longFormat) {
        if (!measures.has(measure)) { return reject("unknown measure " + (measure || "(empty)")); }
        const value = Number(rawValue.replace(/\s/g, ""));
        if (rawValue === "" || !Number.isFinite(value)) { return reject("value " + (rawValue || "(empty)") + " is not a number"); }
        values.push([measure, value]);
      } else {
        for (const [id, idx] of wide) {
          const raw = String(r[idx] === undefined ? "" : r[idx]).replace(/\s/g, "");
          if (!measures.has(id)) { return reject("unknown measure " + id); }
          if (raw === "") { continue; }
          const value = Number(raw);
          if (!Number.isFinite(value)) { return reject("value " + raw + " of " + id + " is not a number"); }
          values.push([id, value]);
        }
      }
      values.forEach(([m, value]) => {
        const fact = Object.assign({}, base, { Measure: m, Value: value });
        const key = [fact.VersionId, fact.Period, fact.Measure, fact.Dim1, fact.Dim2, fact.Dim3, fact.Dim4, fact.Dim5].join("|");
        if (seen.has(key)) { seen.get(key).Value += value; } else { seen.set(key, fact); facts.push(fact); }
      });
    });
    return { facts, rejects, rows: rows.length - 1 };
  }

  return { header, guessMapping, build };
});
