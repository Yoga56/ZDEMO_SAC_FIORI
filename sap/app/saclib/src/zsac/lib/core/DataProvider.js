/**
 * Contract every data source implements. Widgets, designer, analyser and planning only talk to this class,
 * never to OData or to JSON, so a source (mock, RAP OData V4, S/4 analytical query, Datasphere ...) is
 * swapped by registering another provider (see ProviderRegistry).
 *
 * A subclass implements the underscore-free primitives below (all return promises). `query`, `saveStory`,
 * `saveModel` ... are composed here from those primitives so every provider behaves the same.
 */
sap.ui.define(["./QueryEngine", "../planning/DataActionEngine", "../planning/DataActionSchema", "../planning/MultiActionSchema"], function (QueryEngine, DataActionEngine, DataActionSchema, MultiActionSchema) {
  "use strict";

  const abstract = (name) => function () { return Promise.reject(new Error(this.constructor.name + " does not implement " + name)); };

  class DataProvider {
    get id() { return "abstract"; }

    /** What this source supports beyond reading and planning: { audit: change history of plan data }. */
    get capabilities() { return {}; }

    // --- models (datasets) -------------------------------------------------------------------
    /** @returns {Promise<object[]>} models with Dimensions[] and Measures[] */
    listModels() { return abstract("listModels").call(this); }
    getModel(/* modelId */) { return abstract("getModel").call(this); }
    _putModel(/* model */) { return abstract("_putModel").call(this); }
    deleteModel(/* modelId */) { return abstract("deleteModel").call(this); }

    // --- facts -------------------------------------------------------------------------------
    /** @param {Object<string,string[]>} filters dimension id -> members (VERSION, PERIOD, MEASURE allowed) */
    readFacts(/* modelId, filters */) { return abstract("readFacts").call(this); }
    /** Upsert facts by key (Model, Version, Period, Measure, Dim1..5). */
    writeFacts(/* modelId, rows */) { return abstract("writeFacts").call(this); }
    deleteFacts(/* modelId, rows */) { return abstract("deleteFacts").call(this); }

    /** Change history of plan data for a model (newest first); only where capabilities.audit is true. */
    listAudit(/* modelId, limit */) { return abstract("listAudit").call(this); }

    // --- versions ----------------------------------------------------------------------------
    listVersions(/* modelId */) { return abstract("listVersions").call(this); }
    /** Create or update a public version (Actual, Budget, Forecast ...). */
    saveVersion(/* version */) { return abstract("saveVersion").call(this); }
    createPrivateVersion(/* modelId, fromVersionId, name */) { return abstract("createPrivateVersion").call(this); }
    publishVersion(/* modelId, privateId, targetId */) { return abstract("publishVersion").call(this); }
    revertVersion(/* modelId, privateId */) { return abstract("revertVersion").call(this); }
    deleteVersion(/* modelId, versionId */) { return abstract("deleteVersion").call(this); }

    // --- stories -----------------------------------------------------------------------------
    listStories() { return abstract("listStories").call(this); }
    getStory(/* id */) { return abstract("getStory").call(this); }
    _putStory(/* story */) { return abstract("_putStory").call(this); }
    deleteStory(/* id */) { return abstract("deleteStory").call(this); }

    // --- planning objects --------------------------------------------------------------------
    listDataActions() { return abstract("listDataActions").call(this); }
    getDataAction(/* id */) { return abstract("getDataAction").call(this); }
    _putDataAction(/* action */) { return abstract("_putDataAction").call(this); }
    deleteDataAction(/* id */) { return abstract("deleteDataAction").call(this); }
    /** Run history of data actions and multi actions, newest first (empty where the source keeps none). */
    async listRuns(/* actionId, limit */) { return []; }
    async _putRun(/* entry */) { /* sources that keep a run history override this */ }

    listMultiActions() { return abstract("listMultiActions").call(this); }
    getMultiAction(/* id */) { return abstract("getMultiAction").call(this); }
    _putMultiAction(/* action */) { return abstract("_putMultiAction").call(this); }
    deleteMultiAction(/* id */) { return abstract("deleteMultiAction").call(this); }

    // --- files and calendar ------------------------------------------------------------------
    listFiles() { return abstract("listFiles").call(this); }
    saveFile(/* file */) { return abstract("saveFile").call(this); }
    deleteFile(/* id */) { return abstract("deleteFile").call(this); }
    listTasks() { return abstract("listTasks").call(this); }
    saveTask(/* task */) { return abstract("saveTask").call(this); }
    deleteTask(/* id */) { return abstract("deleteTask").call(this); }

    // --- composed behaviour (same for every provider) ----------------------------------------
    /**
     * Aggregated read. spec = { ModelId, Rows:[dim], Columns:[dim], Filters:{dim:[m]}, Hierarchies:{dim: hierarchyId} }.
     * Providers return raw facts; the aggregation is the shared QueryEngine.
     */
    async query(spec) {
      const model = await this.getModel(spec.ModelId);
      const facts = await this.readFacts(spec.ModelId, QueryEngine.expandFilters(model, spec.Filters || {}));
      const result = QueryEngine.aggregate(model, facts, {
        rows: spec.Rows || [], columns: spec.Columns || [], filters: spec.Filters || {}, hierarchies: spec.Hierarchies || {}
      });
      result.model = model;
      return result;
    }

    async saveStory(story) {
      const saved = await this._putStory(story);
      await this._index("STORY", story.Id, story.Name, story.Description);
      return saved;
    }
    async saveModel(model) {
      const saved = await this._putModel(model);
      await this._index("MODEL", model.ModelId, model.Name, model.Description);
      return saved;
    }
    async saveDataAction(action) {
      const saved = await this._putDataAction(action);
      await this._index("DATAACTION", action.Id, action.Name, action.Description);
      return saved;
    }
    async saveMultiAction(action) {
      const saved = await this._putMultiAction(action);
      await this._index("MULTIACTION", action.Id, action.Name, action.Description);
      return saved;
    }

    /**
     * Runs a data action. The engine works in memory on the facts of the model and the difference is written only when every step
     * succeeded, so a failing step leaves the data as it was. params = { Values: {ParamId: members[] | number}, Filter: {DIM: [members]} };
     * opts.dryRun traces the steps without writing. Rejects (after logging the run) when a step fails, except for a dry run.
     * @returns {Promise<{Changed:number, Log:string[], Steps:object[], Status:string, Error?:string, DryRun:boolean}>}
     */
    async executeDataAction(id, params, opts) {
      const dry = !!(opts && opts.dryRun);
      const started = Date.now();
      const action = await this.getDataAction(id);
      const [model, versions, all] = await Promise.all([this.getModel(action.ModelId), this.listVersions(action.ModelId), this.listDataActions()]);
      const actions = new Map(all.filter((a) => a.ModelId === action.ModelId).map((a) => [a.Id, a]));
      const facts = await this.readFacts(action.ModelId, {});
      const result = DataActionEngine.run(model, facts, action, params || {}, { versions, actions });
      if (result.status === "S" && !dry) {
        const delta = DataActionEngine.diff(facts, result.facts);
        if (delta.deletes.length) { await this.deleteFacts(action.ModelId, delta.deletes); }
        if (delta.upserts.length) { await this.writeFacts(action.ModelId, delta.upserts); }
      }
      const out = { Changed: result.changed, Log: result.log, Steps: result.steps, Status: result.status, Error: result.error, DryRun: dry };
      if (!dry) {
        const shown = DataActionSchema.resolveValues(DataActionSchema.normalizeAction(action), params && params.Values);
        await this._putRun({ Kind: "DATA", ActionId: id, ActionName: action.Name, ModelId: action.ModelId, Status: result.status, Changed: result.changed,
          DurationMs: Date.now() - started, ParamsText: Object.keys(shown).map((k) => k + "=" + (Array.isArray(shown[k]) ? shown[k].join(",") || "(all)" : shown[k])).join("; "),
          Log: result.log, Steps: result.steps.map((s) => ({ no: s.no, name: s.name, type: s.type, touched: s.touched, message: s.message })) }).catch(() => {});
        if (result.status === "E") { throw Object.assign(new Error(result.error), { result: out }); }
      }
      return out;
    }

    /** Same run without writing: what each step would do. */
    previewDataAction(id, params) { return this.executeDataAction(id, params, { dryRun: true }); }

    /**
     * Runs a multi action: its steps in order, the first failing step stops the run (what earlier steps wrote stays written).
     * params = { Values: {ParamId: members[] | number} } for the parameters of the multi action; each data action step maps them
     * onto the parameters of its data action. Inactive steps are skipped.
     * @returns {Promise<{Status:string, Changed:number, Log:string[], Steps:object[]}>}
     */
    async runMultiAction(id, params) {
      const started = Date.now();
      const action = MultiActionSchema.normalizeAction(await this.getMultiAction(id));
      const values = MultiActionSchema.resolveValues(action, params && params.Values);
      const actions = new Map((await this.listDataActions()).map((a) => [a.Id, a]));
      const log = [];
      const steps = [];
      let status = "S";
      let changed = 0;
      for (const step of action.Steps) {
        const entry = { no: step.StepNo, name: step.Name, type: step.StepType, active: step.Active, touched: 0, message: "" };
        steps.push(entry);
        if (!step.Active) { entry.message = "Inactive, skipped"; log.push(step.Name + ": inactive, skipped"); continue; }
        try {
          if (step.StepType === "DATAACTION") {
            const child = actions.get(step.ActionId);
            if (!child) { throw new Error("data action " + step.ActionId + " does not exist"); }
            const r = await this.executeDataAction(step.ActionId, { Values: MultiActionSchema.childValues(step, child, values), Filter: (params && params.Filter) || {} });
            changed += r.Changed;
            entry.touched = r.Changed;
            entry.message = "Ran " + child.Name;
            log.push(step.Name + ": " + r.Changed + " values changed");
          } else if (step.StepType === "PUBLISH") {
            const source = MultiActionSchema.versionValue(step.SourceVersion, values);
            const target = MultiActionSchema.versionValue(step.TargetVersion, values);
            const r = await this.publishVersion(step.ModelId, source, target);
            entry.touched = r.Published;
            entry.message = "Published " + source + " to " + target;
            log.push(step.Name + ": published " + source + " to " + target + ", " + r.Published + " values");
          } else {
            throw new Error("unknown step type " + step.StepType);
          }
        } catch (e) {
          entry.message = "Failed: " + e.message;
          log.push(step.Name + " failed: " + e.message);
          status = "E";
          break;
        }
      }
      const shown = Object.keys(values).map((k) => k + "=" + (Array.isArray(values[k]) ? values[k].join(",") || "(all)" : values[k])).join("; ");
      await this._putRun({ Kind: "MULTI", ActionId: id, ActionName: action.Name, ModelId: "", Status: status, Changed: changed, DurationMs: Date.now() - started,
        ParamsText: shown, Log: log, Steps: steps.map((x) => ({ no: x.no, name: x.name, type: x.type, touched: x.touched, message: x.message })) }).catch(() => {});
      return { Status: status, Changed: changed, Log: log, Steps: steps };
    }

    /** Keeps the Files catalogue in step with the object a user saved. */
    async _index(type, objectId, name, description) {
      const files = await this.listFiles();
      const existing = files.find((f) => f.Type === type && f.ObjectId === objectId);
      await this.saveFile(Object.assign({
        Id: "F_" + type + "_" + objectId, ParentId: "", Owner: "ME", Favourite: false, Shared: false
      }, existing || {}, { Type: type, ObjectId: objectId, Name: name, Description: description || "",
        ChangedAt: new Date().toISOString() }));
    }
  }

  return DataProvider;
});
