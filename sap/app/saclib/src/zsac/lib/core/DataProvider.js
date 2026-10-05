/**
 * Contract every data source implements. Widgets, designer, analyser and planning only talk to this class,
 * never to OData or to JSON, so a source (mock, RAP OData V4, S/4 analytical query, Datasphere ...) is
 * swapped by registering another provider (see ProviderRegistry).
 *
 * A subclass implements the underscore-free primitives below (all return promises). `query`, `saveStory`,
 * `saveModel` ... are composed here from those primitives so every provider behaves the same.
 */
sap.ui.define(["./QueryEngine"], function (QueryEngine) {
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
    /** @returns {Promise<{Changed:number, Log:string[]}>} */
    executeDataAction(/* id, params */) { return abstract("executeDataAction").call(this); }

    listMultiActions() { return abstract("listMultiActions").call(this); }
    getMultiAction(/* id */) { return abstract("getMultiAction").call(this); }
    _putMultiAction(/* action */) { return abstract("_putMultiAction").call(this); }
    deleteMultiAction(/* id */) { return abstract("deleteMultiAction").call(this); }
    /** @returns {Promise<{Status:string, Log:string[]}>} */
    runMultiAction(/* id, params */) { return abstract("runMultiAction").call(this); }

    // --- files and calendar ------------------------------------------------------------------
    listFiles() { return abstract("listFiles").call(this); }
    saveFile(/* file */) { return abstract("saveFile").call(this); }
    deleteFile(/* id */) { return abstract("deleteFile").call(this); }
    listTasks() { return abstract("listTasks").call(this); }
    saveTask(/* task */) { return abstract("saveTask").call(this); }
    deleteTask(/* id */) { return abstract("deleteTask").call(this); }

    // --- composed behaviour (same for every provider) ----------------------------------------
    /**
     * Aggregated read. spec = { ModelId, Rows:[dim], Columns:[dim], Filters:{dim:[m]} }.
     * Providers return raw facts; the aggregation is the shared QueryEngine.
     */
    async query(spec) {
      const model = await this.getModel(spec.ModelId);
      const facts = await this.readFacts(spec.ModelId, spec.Filters || {});
      const result = QueryEngine.aggregate(model, facts, {
        rows: spec.Rows || [], columns: spec.Columns || [], filters: spec.Filters || {}
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
