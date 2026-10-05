/**
 * Shape, defaults and validation of a multi action (pure). A multi action runs data actions and version publishes in order.
 *
 * action = { Id, Name, Description,
 *            Parameters: [{ Id, Prompt, Type: "MEMBER"|"NUMBER", ModelId, DimId, Multi, Default }],     asked for once, when the multi action runs
 *            Steps: [step] }
 * step   = { Id, StepNo, StepType: "DATAACTION"|"PUBLISH", Name, Description, Active,
 *            DATAACTION  ActionId, ParamMap: { dataActionParam: value | "@multiParam" }   (a parameter left out uses the default of the data action)
 *            PUBLISH     ModelId, SourceVersion, TargetVersion                            (each a version id or "@multiParam")
 *            VERSION     ModelId, Operation: CREATE_PRIVATE (SourceVersion, VersionName) | REVERT (Version) | DELETE (Version)
 *            LOCK        ModelId, Operation: LOCK | UNLOCK, Version                         (a version id or "@multiParam")
 *            IMPORT      ModelId, Csv, Mapping { column: VERSION|PERIOD|MEASURE|VALUE|dimension|"" }, TargetVersion, MeasureId, Mode: UPDATE|ADD, OnError: FAIL|SKIP
 *            PREDICT     ModelId, MeasureId, SourceVersion, TargetVersion, HistoryFrom/To, ForecastFrom/To, Method, Window, Alpha
 *            API         Method, Url, Headers [{Name, Value}], Body, Expect ("2xx" or "200,201"), TimeoutSec     (text may hold @multiParam)
 *            PAPM        Environment, FunctionId, Parameters [{Name, Value}]                                      (values may be @multiParam)
 *            COMMENT     ModelId, Operation: COPY (SourceVersion, TargetVersion) | DELETE (Version)
 *            SOURCE      ModelId (a model with an IMPORT source), TargetVersion, FromPeriod, ToPeriod (empty: every month), Mode: UPDATE | REPLACE }
 * A value written "@Name" is the parameter Name of the multi action.
 */
sap.ui.define(["./DataActionSchema", "../core/CsvParser"], function (DA, CsvParser) {
  "use strict";

  const STEP_TYPES = {
    DATAACTION: { label: "Data Action", icon: "sap-icon://workflow-tasks", hint: "Run a data action; its parameters take the values of the multi action parameters" },
    PUBLISH: { label: "Publish Version", icon: "sap-icon://upload-to-cloud", hint: "Publish a version over another version of the model" },
    VERSION: { label: "Version Management", icon: "sap-icon://tag", hint: "Create a private copy of a version, revert a private version to its source, or delete a version" },
    LOCK: { label: "Data Locking", icon: "sap-icon://locked", hint: "Lock a version so nothing can write to it, or unlock it again" },
    IMPORT: { label: "Data Import", icon: "sap-icon://upload", hint: "Load plan values from a CSV into a version" },
    PREDICT: { label: "Predictive", icon: "sap-icon://predictive-analytics", hint: "Forecast future months from the history of a version with a statistical method" },
    API: { label: "API", icon: "sap-icon://chain-link", hint: "Call an HTTP endpoint, for example to start a process in another system" },
    PAPM: { label: "PaPM Integration", icon: "sap-icon://connected", hint: "Run a function of SAP Profitability and Performance Management" },
    COMMENT: { label: "Comment Management", icon: "sap-icon://comment", hint: "Copy the comments of a version to another version, or delete them" },
    SOURCE: { label: "Import from Source", icon: "sap-icon://database", hint: "Copy rows of the CDS view behind an import model into a version" }
  };
  const OPERATIONS = {
    VERSION: { CREATE_PRIVATE: "Create private version", REVERT: "Revert private version", DELETE: "Delete version" },
    LOCK: { LOCK: "Lock version", UNLOCK: "Unlock version" },
    COMMENT: { COPY: "Copy comments", DELETE: "Delete comments" }
  };
  const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
  const FORECAST = ["LINEAR", "MOVING_AVERAGE", "EXP_SMOOTHING", "SEASONAL_NAIVE"];
  const ID = /^[A-Za-z][A-Za-z0-9_]*$/;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isRef = DA.isRef;
  const refName = DA.refName;

  function normalizeStep(step, index) {
    const type = STEP_TYPES[step.StepType] ? step.StepType : "DATAACTION";
    const s = Object.assign({ Name: "", Description: "", Active: true, ActionId: "", ParamMap: {}, ModelId: "", SourceVersion: "", TargetVersion: "", Version: "", VersionName: "",
      Csv: "", Mapping: {}, MeasureId: "", FromPeriod: "", ToPeriod: "", Mode: "UPDATE", OnError: "FAIL",
      HistoryFrom: "", HistoryTo: "", ForecastFrom: "", ForecastTo: "", Method: type === "API" ? "POST" : "LINEAR", Window: 3, Alpha: 0.3,
      Url: "", Headers: [], Body: "", Expect: "2xx", TimeoutSec: 30, Environment: "", FunctionId: "", Parameters: [] }, clone(step), { StepType: type });
    if (OPERATIONS[type] && !OPERATIONS[type][s.Operation]) { s.Operation = Object.keys(OPERATIONS[type])[0]; }
    s.Id = s.Id || ("S" + (index + 1));
    s.Name = s.Name || (STEP_TYPES[type].label + " " + (index + 1));
    s.ParamMap = s.ParamMap || {};
    return s;
  }

  function normalizeAction(action) {
    const a = Object.assign({ Description: "", Parameters: [] }, clone(action));
    a.Parameters = (a.Parameters || []).map((p) => Object.assign({ ModelId: "" }, DA.normalizeParameter(p)));
    a.Steps = (a.Steps || []).slice().sort((x, y) => (Number(x.StepNo) || 0) - (Number(y.StepNo) || 0)).map((s, i) => Object.assign(normalizeStep(s, i), { StepNo: (i + 1) * 10 }));
    return a;
  }

  function newStep(type, index) {
    return normalizeStep({ StepType: type, Id: "S" + Date.now().toString(36) + index }, index);
  }

  const valuesOf = (v) => (Array.isArray(v) ? v : [v]);

  function refsOf(step) {
    const out = new Set();
    const add = (v) => { if (isRef(v)) { out.add(refName(v)); } };
    Object.keys(step.ParamMap || {}).forEach((k) => valuesOf(step.ParamMap[k]).forEach(add));
    [step.SourceVersion, step.TargetVersion, step.Version, step.MeasureId, step.HistoryFrom, step.HistoryTo, step.ForecastFrom, step.ForecastTo, step.FromPeriod, step.ToPeriod].forEach(add);
    if (step.StepType === "API" || step.StepType === "PAPM") {
      const scan = (t) => { String(t || "").replace(/@([A-Za-z][A-Za-z0-9_]*)/g, (m, n) => { out.add(n); return m; }); };
      [step.Url, step.Body].forEach(scan);
      (step.Headers || []).forEach((h) => scan(h.Value));
      (step.Parameters || []).forEach((p) => scan(p.Value));
    }
    return out;
  }

  /** @returns {Object<string,string[]>} multi action parameter id -> names of the steps that use it */
  function usage(action) {
    const out = {};
    (action.Steps || []).forEach((s) => refsOf(s).forEach((p) => { (out[p] = out[p] || []).push(s.Name); }));
    return out;
  }

  /** Values of the parameters of the data action `child` for one step: what the step maps, resolved against the values of the multi action. */
  function childValues(step, child, values) {
    const out = {};
    Object.keys(step.ParamMap || {}).forEach((k) => {
      const cp = ((child && child.Parameters) || []).find((p) => p.Id === k);
      const parts = valuesOf(step.ParamMap[k]).reduce((all, v) => all.concat(isRef(v) ? valuesOf(values[refName(v)] === undefined ? [] : values[refName(v)]) : [v]), []);
      out[k] = cp && cp.Type === "NUMBER" ? Number(parts[0]) : parts.map(String);
    });
    return out;
  }

  /** A scalar of a step resolved against the values of the multi action: "@Name" gives the (first) value of the parameter. */
  function scalar(v, values) {
    if (!isRef(v)) { return v; }
    const x = values[refName(v)];
    return Array.isArray(x) ? (x[0] || "") : (x === undefined ? "" : String(x));
  }

  /** Text with "@Name" replaced by the value of the parameter Name (several members are joined with a comma); other "@" text stays. */
  function substitute(text, values, parameters) {
    const ids = (parameters || []).map((p) => p.Id).sort((a, b) => b.length - a.length);
    let out = String(text === undefined || text === null ? "" : text);
    ids.forEach((id) => {
      const x = values[id];
      const shown = Array.isArray(x) ? x.join(",") : (x === undefined ? "" : String(x));
      out = out.replace(new RegExp("@" + id + "(?![A-Za-z0-9_])", "g"), () => shown);
    });
    return out;
  }

  /** A version field of a publish step resolved against the values of the multi action (a member parameter gives its first member). */
  function versionValue(v, values) {
    if (!isRef(v)) { return v; }
    const x = values[refName(v)];
    return Array.isArray(x) ? (x[0] || "") : (x === undefined ? "" : String(x));
  }

  /**
   * @param {object} action normalized multi action
   * @param {{models: object[], versions: object[], actions: object[]}} ctx  versions of all models, data actions of all models
   * @returns {{severity: "Error"|"Warning", step: number, message: string}[]}  step is the index, -1 for the action itself
   */
  function validate(action, ctx) {
    const out = [];
    const err = (step, message) => out.push({ severity: "Error", step, message });
    const warn = (step, message) => out.push({ severity: "Warning", step, message });
    const models = new Map((ctx.models || []).map((m) => [m.ModelId, m]));
    const actions = new Map((ctx.actions || []).map((a) => [a.Id, a]));
    const versionsOf = (modelId) => new Map((ctx.versions || []).filter((v) => v.ModelId === modelId).map((v) => [v.VersionId, v]));
    const params = new Map((action.Parameters || []).map((p) => [p.Id, p]));

    if (!(action.Name || "").trim()) { err(-1, "The multi action needs a name"); }
    const seen = new Set();
    (action.Parameters || []).forEach((p) => {
      if (!ID.test(p.Id)) { err(-1, "Parameter " + (p.Id || "(no id)") + ": the id starts with a letter and has letters, digits and underscore"); }
      if (seen.has(p.Id)) { err(-1, "Parameter " + p.Id + " is defined twice"); }
      seen.add(p.Id);
      if (p.Type === "MEMBER") {
        const m = models.get(p.ModelId);
        if (!m) { err(-1, "Parameter " + p.Id + ": choose the model its members come from"); }
        else if (p.DimId !== "VERSION" && p.DimId !== "PERIOD" && !(m.Dimensions || []).some((d) => d.DimId === p.DimId)) { err(-1, "Parameter " + p.Id + ": choose the dimension its members come from"); }
      }
      if (p.Type === "NUMBER" && !Number.isFinite(Number(p.Default))) { err(-1, "Parameter " + p.Id + ": the default is not a number"); }
    });
    const used = usage(action);
    (action.Parameters || []).forEach((p) => { if (!used[p.Id]) { warn(-1, "Parameter " + p.Id + " is not used by any step"); } });

    if (!(action.Steps || []).length) { err(-1, "Add at least one step"); }
    (action.Steps || []).forEach((s, i) => {
      if (!s.Active) { return; }
      const where = s.Name;
      const refOk = (v, what, type, dimId) => {
        if (!isRef(v)) { return true; }
        const p = params.get(refName(v));
        if (!p) { err(i, where + ": " + what + ": parameter " + v + " does not exist"); return false; }
        if (type && p.Type !== type) { err(i, where + ": " + what + ": parameter " + v + " is not a " + type.toLowerCase() + " parameter"); return false; }
        if (dimId && p.Type === "MEMBER" && p.DimId !== dimId) { err(i, where + ": " + what + ": parameter " + v + " holds members of " + p.DimId + ", not " + dimId); return false; }
        return true;
      };
      if (s.StepType === "DATAACTION") {
        const da = actions.get(s.ActionId);
        if (!s.ActionId) { err(i, where + ": choose the data action to run"); return; }
        if (!da) { err(i, where + ": data action " + s.ActionId + " does not exist"); return; }
        const childParams = new Map((da.Parameters || []).map((p) => [p.Id, p]));
        Object.keys(s.ParamMap || {}).forEach((k) => {
          const cp = childParams.get(k);
          if (!cp) { err(i, where + ": the data action has no parameter " + k); return; }
          valuesOf(s.ParamMap[k]).forEach((v) => {
            if (cp.Type === "NUMBER") {
              if (isRef(v)) { refOk(v, "Parameter " + k, "NUMBER"); } else if (!Number.isFinite(Number(v))) { err(i, where + ": parameter " + k + " needs a number"); }
            } else { refOk(v, "Parameter " + k, "MEMBER", cp.DimId); }
          });
        });
      } else if (s.StepType === "PUBLISH") {
        if (!models.has(s.ModelId)) { err(i, where + ": choose the model"); return; }
        const versions = versionsOf(s.ModelId);
        const check = (v, what, mustBeOpen) => {
          if (!v) { err(i, where + ": choose the " + what + " version"); return; }
          if (isRef(v)) { refOk(v, what + " version", "MEMBER", "VERSION"); return; }
          const ver = versions.get(v);
          if (!ver) { err(i, where + ": version " + v + " does not exist in the model"); } else if (mustBeOpen && ver.Locked) { err(i, where + ": version " + v + " is locked"); }
        };
        check(s.SourceVersion, "source", false);
        check(s.TargetVersion, "target", true);
        if (s.SourceVersion && s.SourceVersion === s.TargetVersion) { err(i, where + ": source and target version are the same"); }
      } else if (s.StepType === "VERSION" || s.StepType === "LOCK" || s.StepType === "COMMENT") {
        const model = models.get(s.ModelId);
        if (!model) { err(i, where + ": choose the model"); return; }
        const versions = versionsOf(s.ModelId);
        const check = (v, what, test) => {
          if (!v) { err(i, where + ": choose the " + what); return null; }
          if (isRef(v)) { refOk(v, what, "MEMBER", "VERSION"); return null; }
          const ver = versions.get(v);
          if (!ver) { err(i, where + ": version " + v + " does not exist in the model"); return null; }
          if (test) { test(ver); }
          return ver;
        };
        const open = (ver) => { if (ver.Locked) { err(i, where + ": version " + ver.VersionId + " is locked"); } };
        if (s.StepType === "LOCK") {
          check(s.Version, "version to " + (s.Operation === "LOCK" ? "lock" : "unlock"));
          if (!model.DataLocking) { warn(i, where + ": Data Locking is not switched on in the model"); }
        } else if (s.StepType === "COMMENT") {
          if (s.Operation === "COPY") {
            check(s.SourceVersion, "version to copy the comments from");
            check(s.TargetVersion, "version to copy the comments to", open);
            if (s.SourceVersion && s.SourceVersion === s.TargetVersion) { err(i, where + ": source and target version are the same"); }
          } else { check(s.Version, "version whose comments are deleted", open); }
        } else if (s.Operation === "CREATE_PRIVATE") {
          check(s.SourceVersion, "version to copy");
        } else if (s.Operation === "REVERT") {
          check(s.Version, "private version to revert", (ver) => { if (ver.Category !== "PRIVATE") { err(i, where + ": version " + ver.VersionId + " is not a private version"); } });
        } else {
          check(s.Version, "version to delete", (ver) => { if (ver.Locked) { err(i, where + ": version " + ver.VersionId + " is locked, unlock it first"); } });
        }
      } else if (s.StepType === "IMPORT") {
        const model = models.get(s.ModelId);
        if (!model) { err(i, where + ": choose the model"); return; }
        const rows = CsvParser.parse(s.Csv || "");
        if (rows.length < 2) { err(i, where + ": the CSV needs a header line and at least one data line"); return; }
        const targets = Object.keys(s.Mapping || {}).map((c) => s.Mapping[c]).filter(Boolean);
        const dup = targets.filter((t, k) => targets.indexOf(t) !== k);
        if (dup.length) { err(i, where + ": " + dup[0] + " is mapped to more than one column"); }
        const mapped = (t) => targets.indexOf(t) >= 0;
        const wideMeasures = targets.filter((t) => t.indexOf("MEASURE:") === 0).map((t) => t.slice(8));
        wideMeasures.forEach((id) => { if (!(model.Measures || []).some((x) => x.MeasureId === id)) { err(i, where + ": measure " + id + " does not exist"); } });
        if (wideMeasures.length && (mapped("VALUE") || mapped("MEASURE"))) { err(i, where + ": use either one Value column or one column per measure, not both"); }
        if (!wideMeasures.length && !mapped("VALUE")) { err(i, where + ": map one column to Value, or map a column to each measure"); }
        if (!mapped("PERIOD")) { err(i, where + ": map one column to Period"); }
        (model.Dimensions || []).forEach((d) => { if (!mapped(d.DimId)) { err(i, where + ": map one column to " + (d.Label || d.DimId)); } });
        const header = rows[0].map((h) => String(h).trim());
        Object.keys(s.Mapping || {}).forEach((c) => { if (header.indexOf(c) < 0) { err(i, where + ": the CSV has no column " + c); } });
        if (header.some((h) => !(s.Mapping || {})[h])) { warn(i, where + ": columns without a mapping are ignored (" + header.filter((h) => !(s.Mapping || {})[h]).join(", ") + ")"); }
        if (!mapped("VERSION")) {
          const v = s.TargetVersion;
          if (!v) { err(i, where + ": choose the version to import into"); }
          else if (isRef(v)) { refOk(v, "Target version", "MEMBER", "VERSION"); }
          else if (!versionsOf(s.ModelId).get(v)) { err(i, where + ": version " + v + " does not exist in the model"); }
          else if (versionsOf(s.ModelId).get(v).Locked) { err(i, where + ": version " + v + " is locked"); }
        }
        if (!mapped("MEASURE") && !wideMeasures.length) {
          const m = s.MeasureId;
          if (!m) { err(i, where + ": choose the measure the values belong to"); }
          else if (isRef(m)) { refOk(m, "Measure", "MEMBER", "MEASURE"); }
          else if (!(model.Measures || []).some((x) => x.MeasureId === m)) { err(i, where + ": measure " + m + " does not exist"); }
        }
      } else if (s.StepType === "SOURCE") {
        const model = models.get(s.ModelId);
        if (!model) { err(i, where + ": choose the model"); return; }
        if (!model.Source || model.Source.Mode !== "IMPORT") { err(i, where + ": the model has no import source, set one up in the Modeller"); return; }
        const v = s.TargetVersion;
        if (!v) { err(i, where + ": choose the version to import into"); }
        else if (isRef(v)) { refOk(v, "Target version", "MEMBER", "VERSION"); }
        else if (!versionsOf(s.ModelId).get(v)) { err(i, where + ": version " + v + " does not exist in the model"); }
        else if (versionsOf(s.ModelId).get(v).Locked) { err(i, where + ": version " + v + " is locked"); }
        const month = (x, what) => {
          if (!x) { return; }
          if (isRef(x)) { refOk(x, what, "MEMBER", "PERIOD"); } else if (!PERIOD.test(x)) { err(i, where + ": " + what + " " + x + " is not of the form 2026-03"); }
        };
        month(s.FromPeriod, "first month"); month(s.ToPeriod, "last month");
        if (s.FromPeriod && s.ToPeriod && !isRef(s.FromPeriod) && !isRef(s.ToPeriod) && s.FromPeriod > s.ToPeriod) { err(i, where + ": the first month is after the last month"); }
        if (["UPDATE", "REPLACE"].indexOf(s.Mode) < 0) { err(i, where + ": unknown mode " + s.Mode); }
        if (s.Mode === "REPLACE" && !s.FromPeriod && !s.ToPeriod) { warn(i, where + ": without months the whole version is replaced"); }
      } else if (s.StepType === "PREDICT") {
        const model = models.get(s.ModelId);
        if (!model) { err(i, where + ": choose the model"); return; }
        const versions = versionsOf(s.ModelId);
        const ver = (v, what, mustBeOpen) => {
          if (!v) { err(i, where + ": choose the " + what + " version"); return; }
          if (isRef(v)) { refOk(v, what + " version", "MEMBER", "VERSION"); return; }
          const x = versions.get(v);
          if (!x) { err(i, where + ": version " + v + " does not exist in the model"); } else if (mustBeOpen && x.Locked) { err(i, where + ": version " + v + " is locked"); }
        };
        ver(s.SourceVersion, "source", false); ver(s.TargetVersion, "target", true);
        if (!s.MeasureId) { err(i, where + ": choose the measure to forecast"); }
        else if (isRef(s.MeasureId)) { refOk(s.MeasureId, "Measure", "MEMBER", "MEASURE"); }
        else if (!(model.Measures || []).some((x) => x.MeasureId === s.MeasureId)) { err(i, where + ": measure " + s.MeasureId + " does not exist"); }
        const per = (v, what) => {
          if (!v) { err(i, where + ": choose " + what); return false; }
          if (isRef(v)) { refOk(v, what, "MEMBER", "PERIOD"); return false; }
          if (!PERIOD.test(v)) { err(i, where + ": " + what + " " + v + " is not of the form 2026-03"); return false; }
          return true;
        };
        const hf = per(s.HistoryFrom, "the start of the history"); const ht = per(s.HistoryTo, "the end of the history");
        const ff = per(s.ForecastFrom, "the first month to forecast"); const ft = per(s.ForecastTo, "the last month to forecast");
        if (hf && ht && s.HistoryFrom > s.HistoryTo) { err(i, where + ": the history starts after it ends"); }
        if (ff && ft && s.ForecastFrom > s.ForecastTo) { err(i, where + ": the forecast starts after it ends"); }
        if (ht && ff && s.ForecastFrom <= s.HistoryTo) { err(i, where + ": the forecast must start after the history"); }
        if (FORECAST.indexOf(s.Method) < 0) { err(i, where + ": unknown method " + s.Method); }
        if (s.Method === "SEASONAL_NAIVE" && hf && ht && (+s.HistoryTo.slice(0, 4) * 12 + +s.HistoryTo.slice(5)) - (+s.HistoryFrom.slice(0, 4) * 12 + +s.HistoryFrom.slice(5)) < 11) {
          err(i, where + ": same month last year needs at least 12 months of history");
        }
        if (s.Method === "MOVING_AVERAGE" && !(Number(s.Window) >= 1)) { err(i, where + ": the window is at least 1 month"); }
        if (s.Method === "EXP_SMOOTHING" && !(Number(s.Alpha) > 0 && Number(s.Alpha) <= 1)) { err(i, where + ": alpha is greater than 0 and at most 1"); }
      } else if (s.StepType === "API") {
        if (METHODS.indexOf(s.Method) < 0) { err(i, where + ": unknown method " + s.Method); }
        const url = String(s.Url || "").trim();
        if (!url) { err(i, where + ": enter the URL"); }
        else if (url.charAt(0) !== "@" && !/^https?:\/\//i.test(url)) { err(i, where + ": the URL must start with http:// or https://"); }
        else if (/^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(url)) { warn(i, where + ": the call is not encrypted (http), use https"); }
        (s.Headers || []).forEach((h) => { if (!h.Name || /[\s:]/.test(h.Name)) { err(i, where + ": a header needs a name without spaces or colon"); } });
        if (!/^(\s*(\dxx|\d{3})\s*)(,\s*(\dxx|\d{3})\s*)*$/i.test(String(s.Expect || ""))) { err(i, where + ": the expected status looks like 2xx or 200,201"); }
        if (!(Number(s.TimeoutSec) >= 1 && Number(s.TimeoutSec) <= 300)) { err(i, where + ": the timeout is between 1 and 300 seconds"); }
        if (s.Body && /^[\[{]/.test(String(s.Body).trim()) && !/@[A-Za-z]/.test(s.Body)) { try { JSON.parse(s.Body); } catch (e) { warn(i, where + ": the body is not valid JSON"); } }
      } else if (s.StepType === "PAPM") {
        if (!(s.Environment || "").trim()) { err(i, where + ": enter the PaPM environment"); }
        if (!(s.FunctionId || "").trim()) { err(i, where + ": enter the PaPM function or process"); }
        const names = (s.Parameters || []).map((p) => p.Name);
        if (names.some((n) => !n)) { err(i, where + ": a PaPM parameter needs a name"); }
        if (names.some((n, k) => n && names.indexOf(n) !== k)) { err(i, where + ": a PaPM parameter name is used twice"); }
      } else {
        err(i, where + ": unknown step type " + s.StepType);
      }
    });
    return out;
  }

  return { STEP_TYPES, OPERATIONS, METHODS, FORECAST, scalar, substitute, normalizeAction, normalizeStep, newStep, refsOf, usage, childValues, versionValue, validate, resolveValues: DA.resolveValues, isRef, refName };
});
