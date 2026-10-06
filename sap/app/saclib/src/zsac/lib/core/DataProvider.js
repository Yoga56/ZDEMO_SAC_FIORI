/**
 * Contract every data source implements. Widgets, designer, analyser and planning only talk to this class,
 * never to OData or to JSON, so a source (mock, RAP OData V4, S/4 analytical query, Datasphere ...) is
 * swapped by registering another provider (see ProviderRegistry).
 *
 * A subclass implements the underscore-free primitives below (all return promises). `query`, `saveStory`,
 * `saveModel` ... are composed here from those primitives so every provider behaves the same.
 */
sap.ui.define(["./QueryEngine", "./Access", "../planning/DataActionEngine", "../planning/DataActionSchema", "../planning/MultiActionSchema", "../planning/StepRunners", "../provider/LiveSource", "../planning/LockEngine", "../planning/ValidationEngine"], function (QueryEngine, Access, DataActionEngine, DataActionSchema, MultiActionSchema, StepRunners, LiveSource, LockEngine, ValidationEngine) {
  "use strict";

  const abstract = (name) => function () { return Promise.reject(new Error(this.constructor.name + " does not implement " + name)); };

  class DataProvider {
    get id() { return "abstract"; }

    /** What this source supports beyond reading and planning: { audit: change history of plan data, comments: comments on plan cells }. */
    get capabilities() { return {}; }

    // --- ownership and sharing of stories and models (see core/Access) -----------------------------
    /** The user the data source works for ("" when it cannot tell). */
    currentUser() { return Promise.resolve(""); }
    /**
     * Who an object is shared with: [{ Principal: "BOB" | "*", Access: "READ" | "WRITE" }]. kind is "STORY" or "MODEL". The owner sees every row,
     * anyone else only the rows that are about them or about everyone.
     */
    listShares(/* kind, id */) { return Promise.resolve([]); }
    /** Replaces the shares of an object (owner only). Returns the list that was stored. */
    saveShares(/* kind, id, shares */) { return Promise.reject(new Error("Sharing is not supported by the data source " + this.id)); }
    /** What can be shared: STORY, MODEL, DATAACTION, MULTIACTION and CALEVENT (an event of the calendar). The id of a model is ModelId, the id of the others is Id. */
    static idOf(kind, object) { return kind === "MODEL" ? object.ModelId : object.Id; }

    /** The object a share is about, as the provider reads it (with its Owner and Access). */
    getShareable(kind, id) {
      switch (kind) {
        case "STORY": return this.getStory(id);
        case "MODEL": return this.getModel(id);
        case "DATAACTION": return this.getDataAction(id);
        case "MULTIACTION": return this.getMultiAction(id);
        case "CALEVENT": return this.getTask(id);
        default: return Promise.reject(new Error("Cannot share a " + kind));
      }
    }

    /** The access of the current user to an object read from this provider: "OWNER" | "WRITE" | "READ" | "NONE". */
    async accessOf(kind, object) {
      const owner = object && object.Owner;
      if (Access.isOpen(owner)) { return "WRITE"; }
      const user = await this.currentUser();
      return Access.level(user, owner, user && owner && String(owner).toUpperCase() === String(user).toUpperCase() ? [] : await this.listShares(kind, DataProvider.idOf(kind, object)));
    }

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

    // --- CDS / OData sources (models with a Source, see provider/LiveSource) --------------------
    /** { json(url), text(url) }: how this provider reads a data source. The default is the browser's fetch with the session of the user. */
    sourceFetch() { return LiveSource.browserFetch(); }

    /** Entity sets and their fields found in the $metadata of a service (of a client of the backend, when one is given). */
    discoverSource(service, client) { return LiveSource.discover(service, this.sourceFetch().text, client); }

    /** Members and period range found in the source of a (not yet saved) model. */
    loadSourceMembers(model) { return LiveSource.loadMembers(model, this.sourceFetch().json); }

    /** Reads the source of a (not yet saved) model: how many facts it gives and the first few, to try a mapping. */
    async testSource(model) {
      const facts = await LiveSource.readFacts(model, {}, this.sourceFetch().json);
      return { Count: facts.length, Sample: facts.slice(0, 5) };
    }

    /**
     * Data locking: refuses the rows (facts to write or to delete) that lie in a locked region, or in a restricted one the current user
     * does not own. Private versions are not locked. Nothing is written when any row is refused.
     */
    async _assertUnlocked(modelId, rows) {
      const model = await this.getModel(modelId);
      if (!model.DataLocking || !rows.length) { return; }
      const user = await this.currentUser();
      let priv = null;
      const first = LockEngine.blocked(model, rows, user, null);
      if (!first.length) { return; }
      priv = new Set((await this.listVersions(modelId)).filter((v) => v.Category === "PRIVATE").map((v) => v.VersionId));
      const list = first.filter((b) => !priv.has(b.fact.VersionId));
      if (list.length) { throw new Error(LockEngine.message(list)); }
    }

    /** Validation rules: refuses rows whose value breaks an ERROR rule of the model (warnings are for the planner typing, not for writes). Private versions are exempt. */
    async _assertValid(modelId, rows) {
      const model = await this.getModel(modelId);
      if (!(model.ValidationRules || []).length || !rows.length) { return; }
      const first = ValidationEngine.run(model, rows).errors;
      if (!first.length) { return; }
      const priv = new Set((await this.listVersions(modelId)).filter((v) => v.Category === "PRIVATE").map((v) => v.VersionId));
      const list = first.filter((b) => !priv.has(b.fact.VersionId));
      if (list.length) { throw new Error("Validation stops this change: " + ValidationEngine.message(list) + "."); }
    }

    /** Models with a live source are read only. */
    async _assertWritable(modelId) {
      const model = await this.getModel(modelId);
      if (LiveSource.isLive(model)) { throw new Error("The model " + modelId + " reads its data live from " + model.Source.Entity + " and is read only"); }
    }

    /**
     * Copies the rows of the source of an IMPORT model into a version. opts = { VersionId, Filters: {PERIOD: [...], DIM: [...]}, Mode: "UPDATE" | "REPLACE" }.
     * UPDATE writes the rows over the same cells; REPLACE first deletes the facts of the version within the same filters.
     * @returns {Promise<{Read:number, Written:number, Deleted:number}>}
     */
    async importFromSource(modelId, opts) {
      const model = await this.getModel(modelId);
      const src = model.Source;
      if (!src || src.Mode !== "IMPORT") { throw new Error("The model " + modelId + " has no import source"); }
      const target = (await this.listVersions(modelId)).find((v) => v.VersionId === opts.VersionId);
      if (!target) { throw new Error("Version " + (opts.VersionId || "(empty)") + " does not exist in " + modelId); }
      if (target.Locked) { throw new Error("Version " + target.VersionId + " is locked"); }
      const filters = QueryEngine.expandFilters(model, Object.assign({}, opts.Filters || {}, { VERSION: [] }));
      const facts = (await LiveSource.readFacts(model, filters, this.sourceFetch().json)).map((f) => Object.assign({}, f, { VersionId: target.VersionId }));
      let deleted = 0;
      if (opts.Mode === "REPLACE") {
        const old = await this.readFacts(modelId, Object.assign({}, filters, { VERSION: [target.VersionId] }));
        if (old.length) { await this.deleteFacts(modelId, old); }
        deleted = old.length;
      }
      if (facts.length) { await this.writeFacts(modelId, facts); }
      return { Read: facts.length, Written: facts.length, Deleted: deleted };
    }

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
    // ---- what the API, PaPM and Comment Management steps of a multi action need from the data source ----------------------
    /**
     * Calls an HTTP endpoint for an API step. request = { Method, Url, Headers: [{Name, Value}], Body, TimeoutSec }.
     * No cookies or credentials are sent; the browser's CORS rules apply, so the endpoint must allow calls from this origin.
     * @returns {Promise<{status:number, text:string}>}
     */
    async callApi(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), (request.TimeoutSec || 30) * 1000);
      const headers = {};
      (request.Headers || []).forEach((h) => { headers[h.Name] = h.Value; });
      try {
        const res = await fetch(request.Url, { method: request.Method, headers, body: request.Body ? request.Body : undefined, credentials: "omit", signal: controller.signal });
        return { status: res.status, text: await res.text() };
      } catch (e) {
        throw new Error(e && e.name === "AbortError" ? "no answer within " + (request.TimeoutSec || 30) + " seconds" : "the call failed (network, certificate or CORS): " + ((e && e.message) || e));
      } finally {
        clearTimeout(timer);
      }
    }

    /** Runs a PaPM function: { Environment, FunctionId, Parameters: {name: value} } -> { Status: "S"|"E", Message }. A data source that is connected to PaPM overrides this. */
    async runPapm(/* request */) { throw new Error("PaPM integration is not connected to the data source " + this.id); }

    /**
     * Comments on plan cells (only where capabilities.comments is true). A comment is { Id, ModelId, VersionId, Period, Measure, Dims: {DIM: member}, Text, Author, At }.
     * listComments(modelId, versionId?) newest last; saveComment creates or replaces; deleteComment by id.
     */
    async listComments(/* modelId, versionId */) { return []; }
    async saveComment(/* comment */) { throw new Error("Comments are not supported by the data source " + this.id); }
    async deleteComment(/* id */) { throw new Error("Comments are not supported by the data source " + this.id); }

    /** Comment Management step: the comments of a version are added to another version, or all deleted. */
    async copyComments(modelId, fromVersionId, toVersionId) {
      if (!this.capabilities.comments) { throw new Error("Comments are not supported by the data source " + this.id); }
      const source = await this.listComments(modelId, fromVersionId);
      for (const c of source) {
        await this.saveComment(Object.assign({}, c, { Id: "C" + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36) + Math.floor(Math.random() * 46656).toString(36), VersionId: toVersionId }));
      }
      return source.length;
    }
    async deleteComments(modelId, versionId) {
      if (!this.capabilities.comments) { throw new Error("Comments are not supported by the data source " + this.id); }
      const source = await this.listComments(modelId, versionId);
      for (const c of source) { await this.deleteComment(c.Id); }
      return source.length;
    }

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
    getTask(/* id */) { return abstract("getTask").call(this); }
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
          } else if (step.StepType === "VERSION") {
            const source = MultiActionSchema.versionValue(step.SourceVersion, values);
            const version = MultiActionSchema.versionValue(step.Version, values);
            if (step.Operation === "CREATE_PRIVATE") {
              const v = await this.createPrivateVersion(step.ModelId, source, step.VersionName || "");
              entry.message = "Created private version " + v.VersionId + " from " + source;
            } else if (step.Operation === "REVERT") {
              await this.revertVersion(step.ModelId, version);
              entry.message = "Reverted " + version;
            } else {
              await this.deleteVersion(step.ModelId, version);
              entry.message = "Deleted version " + version;
            }
            log.push(step.Name + ": " + entry.message);
          } else if (step.StepType === "LOCK") {
            const version = MultiActionSchema.versionValue(step.Version, values);
            const locked = step.Operation === "LOCK";
            const v = (await this.listVersions(step.ModelId)).find((x) => x.VersionId === version);
            if (!v) { throw new Error("version " + version + " does not exist"); }
            if (!!v.Locked !== locked) { await this.saveVersion(Object.assign({}, v, { Locked: locked })); }
            entry.message = (locked ? "Locked " : "Unlocked ") + version + (!!v.Locked === locked ? " (already so)" : "");
            log.push(step.Name + ": " + entry.message);
          } else if (StepRunners.handles(step.StepType)) {
            const r = await StepRunners.run(this, step, values, action.Parameters);
            entry.touched = r.touched;
            entry.message = r.message;
            log.push(step.Name + ": " + r.message);
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
        Id: "F_" + type + "_" + objectId, ParentId: "", Owner: (await this.currentUser()) || "ME", Favourite: false, Shared: false
      }, existing || {}, { Type: type, ObjectId: objectId, Name: name, Description: description || "",
        ChangedAt: new Date().toISOString() }));
    }
  }

  return DataProvider;
});
