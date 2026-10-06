/**
 * Runs the multi action steps that talk to something other than versions and data actions:
 * Data Import, Predictive, API, PaPM Integration and Comment Management.
 *
 *   StepRunners.run(provider, step, values, parameters) -> { touched, message }
 *
 * `values` are the resolved parameters of the multi action, `parameters` their definitions (needed to tell "@Name" from other text).
 * A step throws when it fails; the caller turns that into a failed run.
 */
sap.ui.define(["./MultiActionSchema", "./ImportEngine", "./Forecaster", "./ModelCopy", "../core/HierarchyEngine"], function (Schema, ImportEngine, Forecaster, ModelCopy, HierarchyEngine) {
  "use strict";

  const one = (v, values) => Schema.scalar(v, values);
  const monthIndex = (p) => +p.slice(0, 4) * 12 + (+p.slice(5) - 1);

  async function openVersion(provider, modelId, versionId, what, mustBeOpen) {
    const v = (await provider.listVersions(modelId)).find((x) => x.VersionId === versionId);
    if (!v) { throw new Error(what + " version " + (versionId || "(empty)") + " does not exist"); }
    if (mustBeOpen && v.Locked) { throw new Error("version " + versionId + " is locked"); }
    return v;
  }

  async function runImport(provider, step, values) {
    const model = await provider.getModel(step.ModelId);
    const versions = await provider.listVersions(step.ModelId);
    const result = ImportEngine.build(model, versions, step.Csv, step, { targetVersion: one(step.TargetVersion, values), measureId: one(step.MeasureId, values) });
    if (result.rejects.length && step.OnError !== "SKIP") {
      const r = result.rejects[0];
      throw new Error(result.rejects.length + " of " + result.rows + " rows rejected, nothing imported. First: line " + r.line + ", " + r.reason);
    }
    let facts = result.facts;
    if (step.Mode === "ADD" && facts.length) {
      const existing = await provider.readFacts(step.ModelId, { VERSION: Array.from(new Set(facts.map((f) => f.VersionId))) });
      const key = (f) => [f.VersionId, f.Period, f.Measure, f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].join("|");
      const have = new Map(existing.map((f) => [key(f), f.Value]));
      facts = facts.map((f) => Object.assign({}, f, { Value: Math.round(((have.get(key(f)) || 0) + f.Value) * 100) / 100 }));
    }
    if (facts.length) { await provider.writeFacts(step.ModelId, facts); }
    const skipped = result.rejects.length;
    return { touched: facts.length, message: "Imported " + facts.length + " values" + (step.Mode === "ADD" ? " (added to the existing ones)" : "")
      + (skipped ? ", skipped " + skipped + " rows (first: line " + result.rejects[0].line + ", " + result.rejects[0].reason + ")" : "") };
  }

  async function runPredict(provider, step, values) {
    const model = await provider.getModel(step.ModelId);
    const measure = one(step.MeasureId, values);
    const src = one(step.SourceVersion, values);
    const tgt = one(step.TargetVersion, values);
    await openVersion(provider, step.ModelId, src, "source", false);
    await openVersion(provider, step.ModelId, tgt, "target", true);
    if (!(model.Measures || []).some((m) => m.MeasureId === measure)) { throw new Error("unknown measure " + (measure || "(empty)")); }
    const hf = one(step.HistoryFrom, values); const ht = one(step.HistoryTo, values);
    const ff = one(step.ForecastFrom, values); const ft = one(step.ForecastTo, values);
    const history = HierarchyEngine.monthRange(hf, ht);
    const months = HierarchyEngine.monthRange(ff, ft);
    if (!history.length) { throw new Error("the history range " + hf + " to " + ht + " is not valid"); }
    if (!months.length) { throw new Error("the forecast range " + ff + " to " + ft + " is not valid"); }
    if (monthIndex(ff) <= monthIndex(ht)) { throw new Error("the forecast must start after the history (" + ht + ")"); }
    const offsets = months.map((p) => monthIndex(p) - monthIndex(ht));
    const facts = await provider.readFacts(step.ModelId, { VERSION: [src], MEASURE: [measure], PERIOD: history });
    const series = new Map();
    facts.forEach((f) => {
      const k = [f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].join("\u0001");
      if (!series.has(k)) { series.set(k, { dims: f, values: new Array(history.length).fill(undefined) }); }
      series.get(k).values[monthIndex(f.Period) - monthIndex(hf)] = f.Value;
    });
    const out = [];
    let skipped = 0;
    const opts = { window: Number(step.Window) || 3, alpha: Number(step.Alpha) || 0.3 };
    const test = { abs: 0, actual: 0, n: 0 };
    series.forEach((s) => {
      const bt = Forecaster.backtest(s.values, step.Method, opts);
      if (bt) { test.abs += bt.abs; test.actual += bt.actual; test.n += bt.n; }
      const predicted = Forecaster.forecast(s.values, offsets, step.Method, opts);
      if (predicted.every((v) => v === null)) { skipped++; return; }
      predicted.forEach((v, i) => {
        if (v !== null) { out.push({ VersionId: tgt, Period: months[i], Measure: measure, Dim1: s.dims.Dim1, Dim2: s.dims.Dim2, Dim3: s.dims.Dim3, Dim4: s.dims.Dim4, Dim5: s.dims.Dim5, Value: v }); }
      });
    });
    if (out.length) { await provider.writeFacts(step.ModelId, out); }
    return { touched: out.length, message: Forecaster.METHODS[step.Method] + ": " + out.length + " values for " + (series.size - skipped) + " series in " + tgt + " (" + months[0] + " to " + months[months.length - 1] + ")"
      + (skipped ? ", " + skipped + " series skipped, too little history" : "")
      + (test.n && test.actual > 0 ? ". Back-test on the last " + Forecaster.holdoutFor(history.length) + " months of the history: the forecast was off by " + (Math.round(test.abs / test.actual * 1000) / 10) + "% on average" : "") };
  }

  function statusOk(expect, status) {
    return String(expect || "2xx").split(",").map((x) => x.trim()).filter(Boolean).some((e) => (/^\dxx$/i.test(e) ? String(status).charAt(0) === e.charAt(0) : Number(e) === status));
  }

  async function runApi(provider, step, values, parameters) {
    const sub = (t) => Schema.substitute(t, values, parameters);
    const request = { Method: step.Method || "POST", Url: sub(step.Url), Headers: (step.Headers || []).filter((h) => h.Name).map((h) => ({ Name: h.Name, Value: sub(h.Value) })),
      Body: step.Method === "GET" || step.Method === "DELETE" ? "" : sub(step.Body), TimeoutSec: Number(step.TimeoutSec) || 30 };
    if (!/^https?:\/\//i.test(request.Url)) { throw new Error("the URL must start with http:// or https://"); }
    const r = await provider.callApi(request);
    const shown = request.Method + " " + request.Url.replace(/\?.*$/, "") + " returned " + r.status;
    if (!statusOk(step.Expect, r.status)) { throw new Error(shown + ", expected " + (step.Expect || "2xx") + (r.text ? ": " + String(r.text).slice(0, 200) : "")); }
    return { touched: 0, message: shown };
  }

  async function runPapm(provider, step, values, parameters) {
    const params = {};
    (step.Parameters || []).filter((p) => p.Name).forEach((p) => { params[p.Name] = Schema.substitute(p.Value, values, parameters); });
    const r = await provider.runPapm({ Environment: step.Environment, FunctionId: step.FunctionId, Parameters: params });
    if (r.Status !== "S") { throw new Error("PaPM function " + step.FunctionId + " failed: " + (r.Message || "no message")); }
    return { touched: 0, message: r.Message || ("PaPM function " + step.FunctionId + " finished") };
  }

  async function runComment(provider, step, values) {
    if (step.Operation === "COPY") {
      const from = one(step.SourceVersion, values); const to = one(step.TargetVersion, values);
      await openVersion(provider, step.ModelId, from, "source", false);
      await openVersion(provider, step.ModelId, to, "target", true);
      const n = await provider.copyComments(step.ModelId, from, to);
      return { touched: n, message: "Copied " + n + " comments from " + from + " to " + to };
    }
    const version = one(step.Version, values);
    await openVersion(provider, step.ModelId, version, "", true);
    const n = await provider.deleteComments(step.ModelId, version);
    return { touched: n, message: "Deleted " + n + " comments of " + version };
  }

  async function runSource(provider, step, values) {
    const from = one(step.FromPeriod, values);
    const to = one(step.ToPeriod, values);
    const months = from || to ? HierarchyEngine.monthRange(from || to, to || from) : [];
    if ((from || to) && !months.length) { throw new Error("the months " + (from || "(empty)") + " to " + (to || "(empty)") + " are not valid"); }
    const r = await provider.importFromSource(step.ModelId, { VersionId: one(step.TargetVersion, values), Filters: months.length ? { PERIOD: months } : {}, Mode: step.Mode === "REPLACE" ? "REPLACE" : "UPDATE" });
    return { touched: r.Written, message: "Read " + r.Read + " values from the source" + (r.Deleted ? ", replaced " + r.Deleted + " existing values" : "") + (months.length ? " (" + months[0] + " to " + months[months.length - 1] + ")" : "") };
  }

  async function runCopyModel(provider, step, values) {
    const src = await provider.getModel(step.ModelId);
    const tgt = await provider.getModel(step.TargetModelId);
    const from = one(step.SourceVersion, values);
    const to = one(step.TargetVersion, values);
    await openVersion(provider, step.ModelId, from, "source", false);
    await openVersion(provider, step.TargetModelId, to, "target", true);
    const fm = one(step.FromPeriod, values); const tm = one(step.ToPeriod, values);
    const months = fm || tm ? HierarchyEngine.monthRange(fm || tm, tm || fm) : [];
    if ((fm || tm) && !months.length) { throw new Error("the months " + (fm || "(empty)") + " to " + (tm || "(empty)") + " are not valid"); }
    const facts = await provider.readFacts(step.ModelId, Object.assign({ VERSION: [from] }, months.length ? { PERIOD: months } : {}));
    const built = ModelCopy.build(src, tgt, facts, { targetVersion: to, fixed: ModelCopy.parseFixed(step.Fixed) });
    if (built.problems.length) { throw new Error(built.problems[0]); }
    let rows = built.facts;
    if (step.Mode === "ADD" && rows.length) {
      const existing = await provider.readFacts(step.TargetModelId, { VERSION: [to] });
      const key = (f) => [f.VersionId, f.Period, f.Measure, f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].join("|");
      const have = new Map(existing.map((f) => [key(f), f.Value]));
      rows = rows.map((f) => Object.assign({}, f, { Value: Math.round(((have.get(key(f)) || 0) + f.Value) * 100) / 100 }));
    }
    if (rows.length) { await provider.writeFacts(step.TargetModelId, rows); }
    const s = built.skipped;
    const left = [s.measures.length ? "measures " + s.measures.join(", ") + " are not in the target" : "", s.periods ? s.periods + " values outside the target's months" : "", s.members ? s.members + " values with members the target does not have" : ""].filter(Boolean);
    return { touched: rows.length, message: "Copied " + rows.length + " values from " + src.Name + " " + from + " into " + tgt.Name + " " + to + (left.length ? ". Left out: " + left.join("; ") : "") };
  }

  const RUNNERS = { COPYMODEL: runCopyModel, SOURCE: runSource, IMPORT: runImport, PREDICT: runPredict, API: runApi, PAPM: runPapm, COMMENT: runComment };

  return { run: (provider, step, values, parameters) => RUNNERS[step.StepType](provider, step, values, parameters), handles: (type) => !!RUNNERS[type], statusOk };
});
