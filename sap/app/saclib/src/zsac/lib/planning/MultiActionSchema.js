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
 *            LOCK        ModelId, Operation: LOCK | UNLOCK, Version                         (a version id or "@multiParam") }
 * A value written "@Name" is the parameter Name of the multi action.
 */
sap.ui.define(["./DataActionSchema"], function (DA) {
  "use strict";

  const STEP_TYPES = {
    DATAACTION: { label: "Data Action", icon: "sap-icon://workflow-tasks", hint: "Run a data action; its parameters take the values of the multi action parameters" },
    PUBLISH: { label: "Publish Version", icon: "sap-icon://upload-to-cloud", hint: "Publish a version over another version of the model" },
    VERSION: { label: "Version Management", icon: "sap-icon://tag", hint: "Create a private copy of a version, revert a private version to its source, or delete a version" },
    LOCK: { label: "Data Locking", icon: "sap-icon://locked", hint: "Lock a version so nothing can write to it, or unlock it again" }
  };
  const OPERATIONS = {
    VERSION: { CREATE_PRIVATE: "Create private version", REVERT: "Revert private version", DELETE: "Delete version" },
    LOCK: { LOCK: "Lock version", UNLOCK: "Unlock version" }
  };
  const ID = /^[A-Za-z][A-Za-z0-9_]*$/;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isRef = DA.isRef;
  const refName = DA.refName;

  function normalizeStep(step, index) {
    const type = STEP_TYPES[step.StepType] ? step.StepType : "DATAACTION";
    const s = Object.assign({ Name: "", Description: "", Active: true, ActionId: "", ParamMap: {}, ModelId: "", SourceVersion: "", TargetVersion: "", Version: "", VersionName: "" }, clone(step), { StepType: type });
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
    add(step.SourceVersion); add(step.TargetVersion); add(step.Version);
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
      } else if (s.StepType === "VERSION" || s.StepType === "LOCK") {
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
        if (s.StepType === "LOCK") {
          check(s.Version, "version to " + (s.Operation === "LOCK" ? "lock" : "unlock"));
          if (!model.DataLocking) { warn(i, where + ": Data Locking is not switched on in the model"); }
        } else if (s.Operation === "CREATE_PRIVATE") {
          check(s.SourceVersion, "version to copy");
        } else if (s.Operation === "REVERT") {
          check(s.Version, "private version to revert", (ver) => { if (ver.Category !== "PRIVATE") { err(i, where + ": version " + ver.VersionId + " is not a private version"); } });
        } else {
          check(s.Version, "version to delete", (ver) => { if (ver.Locked) { err(i, where + ": version " + ver.VersionId + " is locked, unlock it first"); } });
        }
      } else {
        err(i, where + ": unknown step type " + s.StepType);
      }
    });
    return out;
  }

  return { STEP_TYPES, OPERATIONS, normalizeAction, normalizeStep, newStep, refsOf, usage, childValues, versionValue, validate, resolveValues: DA.resolveValues, isRef, refName };
});
