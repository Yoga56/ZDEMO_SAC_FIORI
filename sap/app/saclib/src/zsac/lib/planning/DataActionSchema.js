/**
 * Shape, defaults and validation of a data action (pure).
 *
 * action = { Id, ModelId, Name, Description,
 *            Parameters: [{ Id, Prompt, Type: "MEMBER"|"NUMBER", DimId, Multi, Default }],
 *            Steps: [step] }
 * step   = { Id, StepNo, StepType, Name, Description, Active,
 *            Filter: { DIM: [member | "@Param"] },                      which facts the step works on
 *            COPY      Rules: [{ Dim, From, To }], AggregateTo: [{ Dim, Member }], WriteMode, Factor
 *            SCALE     Factor
 *            DELETE    (the filter only)
 *            ALLOCATE  TargetDim, TargetMembers, TgtVersion, Driver (EQUAL|PROPORTIONAL|REFERENCE), DriverVersion, WriteMode, ClearSource
 *            EMBED     ActionId, ParamMap: { childParam: value | "@parentParam" } }
 * A value written "@Name" is the parameter Name, asked for when the action runs.
 */
sap.ui.define([], function () {
  "use strict";

  const STEP_TYPES = {
    COPY: { label: "Copy", icon: "sap-icon://duplicate", hint: "Copy facts onto other members (another version, another year ...), optionally aggregated, overwriting or adding" },
    ALLOCATE: { label: "Allocation", icon: "sap-icon://share-2", hint: "Spread values over members: equally, in proportion to existing values, or like a reference version" },
    SCALE: { label: "Scale", icon: "sap-icon://measure", hint: "Multiply the selected values by a factor" },
    DELETE: { label: "Fact Deletion", icon: "sap-icon://delete", hint: "Delete the selected facts" },
    EMBED: { label: "Embedded Data Action", icon: "sap-icon://workflow-tasks", hint: "Run another data action of the model, with its own parameters" }
  };
  const BUILTIN_DIMS = ["VERSION", "PERIOD", "MEASURE"];
  const ID = /^[A-Za-z][A-Za-z0-9_]*$/;
  const isRef = (v) => typeof v === "string" && v.charAt(0) === "@";
  const refName = (v) => String(v).slice(1);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function normalizeParameter(p) {
    const type = p.Type === "NUMBER" ? "NUMBER" : "MEMBER";
    return Object.assign({ Id: "", Prompt: "", DimId: "", Multi: true }, p, {
      Type: type,
      Prompt: p.Prompt || p.Id || "",
      Default: type === "NUMBER" ? (p.Default === undefined || p.Default === null || p.Default === "" ? 0 : Number(p.Default)) : (Array.isArray(p.Default) ? p.Default.map(String) : (p.Default ? [String(p.Default)] : []))
    });
  }

  /** Fills defaults and upgrades the first generation of steps (SrcVersion / TgtVersion fields) to filters and rules. */
  function normalizeStep(step, index) {
    const type = STEP_TYPES[step.StepType] ? step.StepType : "COPY";
    const s = Object.assign({
      Name: "", Description: "", Active: true, Filter: {}, Rules: [], AggregateTo: [], WriteMode: "OVERWRITE", Factor: 1,
      TargetDim: "", TargetMembers: [], TgtVersion: "", Driver: "EQUAL", DriverVersion: "", ClearSource: false, ActionId: "", ParamMap: {}
    }, clone(step), { StepType: type });
    s.Filter = s.Filter || {};
    if (step.SrcVersion !== undefined || ((type === "SCALE" || type === "DELETE") && s.TgtVersion)) {
      if (type === "COPY") {
        if (s.SrcVersion && !s.Filter.VERSION) { s.Filter.VERSION = [s.SrcVersion]; }
        if (s.TgtVersion && !s.Rules.some((r) => r.Dim === "VERSION")) { s.Rules.push({ Dim: "VERSION", From: "", To: s.TgtVersion }); }
        s.TgtVersion = "";
      } else if (type === "SCALE" || type === "DELETE") {
        if (s.TgtVersion && !s.Filter.VERSION) { s.Filter.VERSION = [s.TgtVersion]; }
        s.TgtVersion = "";
      } else if (type === "ALLOCATE" && s.SrcVersion && !s.Filter.VERSION) {
        s.Filter.VERSION = [s.SrcVersion];
      }
    }
    delete s.SrcVersion;
    if (s.Factor === "" || s.Factor === undefined || s.Factor === null) { s.Factor = 1; }
    s.Id = s.Id || ("S" + (index + 1));
    s.Name = s.Name || (STEP_TYPES[type].label + " " + (index + 1));
    s.Rules = (s.Rules || []).map((r) => Object.assign({ Dim: "VERSION", From: "", To: "" }, r));
    s.TargetMembers = (typeof s.TargetMembers === "string" ? s.TargetMembers.split(",") : s.TargetMembers || []).map((x) => String(x).trim()).filter(Boolean);
    return s;
  }

  function normalizeAction(action) {
    const a = Object.assign({ Description: "", ModelId: "", Parameters: [] }, clone(action));
    a.Parameters = (a.Parameters || []).map(normalizeParameter);
    a.Steps = (a.Steps || []).slice().sort((x, y) => (Number(x.StepNo) || 0) - (Number(y.StepNo) || 0)).map((s, i) => Object.assign(normalizeStep(s, i), { StepNo: (i + 1) * 10 }));
    return a;
  }

  function newStep(type, index) {
    return normalizeStep({ StepType: type, StepNo: (index + 1) * 10, Id: "S" + Date.now().toString(36) + index }, index);
  }

  /** Every "@Param" in a step, so the designer can say where a parameter is used. */
  function refsOf(step) {
    const out = new Set();
    const add = (v) => { if (isRef(v)) { out.add(refName(v)); } };
    Object.keys(step.Filter || {}).forEach((d) => (step.Filter[d] || []).forEach(add));
    (step.Rules || []).forEach((r) => { add(r.From); add(r.To); });
    (step.AggregateTo || []).forEach((x) => add(x.Member));
    (step.TargetMembers || []).forEach(add);
    [step.Factor, step.TgtVersion, step.DriverVersion].forEach(add);
    Object.keys(step.ParamMap || {}).forEach((k) => { const v = step.ParamMap[k]; (Array.isArray(v) ? v : [v]).forEach(add); });
    return out;
  }

  /** @returns {Object<string,string[]>} parameter id -> names of the steps that use it */
  function usage(action) {
    const out = {};
    (action.Steps || []).forEach((s) => refsOf(s).forEach((p) => { (out[p] = out[p] || []).push(s.Name); }));
    return out;
  }

  /** Values for a run: the defaults, replaced by what the planner entered. MEMBER -> string[], NUMBER -> number. */
  function resolveValues(action, supplied) {
    const out = {};
    (action.Parameters || []).forEach((p) => {
      const v = supplied && supplied[p.Id] !== undefined ? supplied[p.Id] : p.Default;
      out[p.Id] = p.Type === "NUMBER" ? Number(v) : (Array.isArray(v) ? v.map(String) : (v === undefined || v === null || v === "" ? [] : [String(v)]));
    });
    return out;
  }

  /**
   * @param {object} action normalized action
   * @param {{model, versions, actions}} ctx   actions = all data actions of the model (for embedded steps)
   * @returns {{severity: "Error"|"Warning", step: number, message: string}[]}  step is the index, -1 for the action itself
   */
  function validate(action, ctx) {
    const out = [];
    const err = (step, message) => out.push({ severity: "Error", step, message });
    const warn = (step, message) => out.push({ severity: "Warning", step, message });
    const model = ctx.model;
    const versions = new Map((ctx.versions || []).map((v) => [v.VersionId, v]));
    const dims = new Set(((model && model.Dimensions) || []).map((d) => d.DimId).concat(BUILTIN_DIMS));
    const params = new Map((action.Parameters || []).map((p) => [p.Id, p]));
    const actions = new Map((ctx.actions || []).map((a) => [a.Id, a]));

    if (!(action.Name || "").trim()) { err(-1, "The data action needs a name"); }
    if (!model) { err(-1, "Choose the model the data action works on"); return out; }

    const seen = new Set();
    (action.Parameters || []).forEach((p) => {
      if (!ID.test(p.Id)) { err(-1, "Parameter " + (p.Id || "(no id)") + ": the id starts with a letter and has letters, digits and underscore"); }
      if (seen.has(p.Id)) { err(-1, "Parameter " + p.Id + " is defined twice"); }
      seen.add(p.Id);
      if (p.Type === "MEMBER" && !dims.has(p.DimId)) { err(-1, "Parameter " + p.Id + ": choose the dimension its members come from"); }
      if (p.Type === "NUMBER" && !Number.isFinite(Number(p.Default))) { err(-1, "Parameter " + p.Id + ": the default is not a number"); }
    });
    const used = usage(action);
    (action.Parameters || []).forEach((p) => { if (!used[p.Id]) { warn(-1, "Parameter " + p.Id + " is not used by any step"); } });

    const memberRef = (v, step, what) => {
      if (!isRef(v)) { return true; }
      const p = params.get(refName(v));
      if (!p) { err(step, what + ": parameter " + v + " does not exist"); return false; }
      return true;
    };
    const versionOk = (v, step, what, mustBeOpen) => {
      if (!v) { return; }
      if (isRef(v)) { memberRef(v, step, what); return; }
      const ver = versions.get(v);
      if (!ver) { err(step, what + ": version " + v + " does not exist"); } else if (mustBeOpen && ver.Locked) { err(step, what + ": version " + v + " is locked"); }
    };
    const factorOk = (f, step) => {
      if (isRef(f)) {
        const p = params.get(refName(f));
        if (!p) { err(step, "Factor: parameter " + f + " does not exist"); } else if (p.Type !== "NUMBER") { err(step, "Factor: parameter " + f + " is not a number parameter"); }
      } else if (!Number.isFinite(Number(f))) { err(step, "The factor is not a number"); }
    };

    if (!(action.Steps || []).length) { err(-1, "Add at least one step"); }
    (action.Steps || []).forEach((s, i) => {
      if (!s.Active) { return; }
      const where = s.Name;
      Object.keys(s.Filter || {}).forEach((d) => {
        if (!dims.has(d)) { err(i, "Filter on unknown dimension " + d); return; }
        (s.Filter[d] || []).forEach((v) => memberRef(v, i, "Filter " + d));
        if (d === "VERSION") { (s.Filter[d] || []).forEach((v) => versionOk(v, i, "Filter Version", false)); }
      });
      const filterVersions = (s.Filter && s.Filter.VERSION) || [];
      switch (s.StepType) {
        case "COPY": {
          if (!(s.Rules || []).length && !(s.AggregateTo || []).length) { warn(i, where + ": no copy rule, the step copies facts onto themselves"); }
          (s.Rules || []).forEach((r) => {
            if (!dims.has(r.Dim)) { err(i, "Copy rule on unknown dimension " + r.Dim); }
            if (!r.From && !r.To) { err(i, "A copy rule needs a From or a To member"); }
            memberRef(r.From, i, "Copy rule From"); memberRef(r.To, i, "Copy rule To");
            if (r.Dim === "VERSION") { versionOk(r.To, i, "Copy rule target", true); if (r.From) { versionOk(r.From, i, "Copy rule source", false); } }
          });
          (s.AggregateTo || []).forEach((x) => { if (!dims.has(x.Dim) || !x.Member) { err(i, "Aggregate To needs a dimension and a member"); } memberRef(x.Member, i, "Aggregate To"); });
          if (!(s.Rules || []).some((r) => r.Dim === "VERSION" && r.To) && filterVersions.length === 1 && !isRef(filterVersions[0]) && versions.get(filterVersions[0]) && versions.get(filterVersions[0]).Locked) {
            err(i, where + ": it writes into locked version " + filterVersions[0]);
          }
          factorOk(s.Factor, i);
          break;
        }
        case "SCALE":
          factorOk(s.Factor, i);
          filterVersions.forEach((v) => { if (!isRef(v) && versions.get(v) && versions.get(v).Locked) { err(i, where + ": version " + v + " is locked"); } });
          break;
        case "DELETE":
          if (!Object.keys(s.Filter || {}).some((d) => (s.Filter[d] || []).length)) { warn(i, where + ": without a filter the step deletes every fact of the model"); }
          filterVersions.forEach((v) => { if (!isRef(v) && versions.get(v) && versions.get(v).Locked) { err(i, where + ": version " + v + " is locked"); } });
          break;
        case "ALLOCATE": {
          if (!dims.has(s.TargetDim) || BUILTIN_DIMS.indexOf(s.TargetDim) >= 0 && s.TargetDim !== "PERIOD") { err(i, "Choose the dimension to allocate over"); }
          if (!(s.TargetMembers || []).length) { err(i, "Choose the members to allocate to"); }
          (s.TargetMembers || []).forEach((v) => memberRef(v, i, "Allocation targets"));
          if (!s.TgtVersion && !filterVersions.length) { warn(i, where + ": no target version, the values stay in the version they come from"); }
          versionOk(s.TgtVersion, i, "Target version", true);
          if (s.Driver === "REFERENCE") { if (!s.DriverVersion) { err(i, "Choose the reference version of the driver"); } else { versionOk(s.DriverVersion, i, "Driver version", false); } }
          break;
        }
        case "EMBED": {
          const child = actions.get(s.ActionId);
          if (!s.ActionId) { err(i, "Choose the data action to run"); break; }
          if (!child) { err(i, "Data action " + s.ActionId + " does not exist"); break; }
          if (child.Id === action.Id) { err(i, "A data action cannot embed itself"); }
          const walk = (id, trail) => {
            if (trail.indexOf(id) >= 0) { return true; }
            const a = actions.get(id);
            return !!a && (a.Steps || []).some((x) => x.StepType === "EMBED" && x.ActionId && walk(x.ActionId, trail.concat(id)));
          };
          if (child.Id !== action.Id && walk(child.Id, [action.Id])) { err(i, "Embedded data actions form a loop"); }
          const childParams = new Set((child.Parameters || []).map((p) => p.Id));
          Object.keys(s.ParamMap || {}).forEach((k) => {
            if (!childParams.has(k)) { err(i, "The embedded data action has no parameter " + k); }
            const v = s.ParamMap[k];
            (Array.isArray(v) ? v : [v]).forEach((x) => memberRef(x, i, "Parameter " + k));
          });
          break;
        }
        default: err(i, "Unknown step type " + s.StepType);
      }
    });
    return out;
  }

  return { STEP_TYPES, BUILTIN_DIMS, isRef, refName, normalizeAction, normalizeStep, normalizeParameter, newStep, refsOf, usage, resolveValues, validate };
});
