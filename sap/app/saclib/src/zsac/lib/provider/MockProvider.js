/**
 * In-memory provider seeded from mockdata/*.json. Changes (new stories, edited plan cells ...) are kept in
 * localStorage so a demo survives a reload; `reset()` returns to the seed. Runs with no backend at all.
 *
 * new MockProvider({ seed })              seed injected (unit tests)
 * MockProvider.create()                   loads mockdata/*.json relative to the library
 */
sap.ui.define([
  "../core/DataProvider",
  "../core/QueryEngine",
  "../core/ModelSchema",
  "../planning/DataActionEngine",
  "../planning/VersionEngine"
], function (DataProvider, QueryEngine, ModelSchema, DataActionEngine, VersionEngine) {
  "use strict";

  const STORE_KEY = "zsac.mock.v1";
  const COLLECTIONS = ["models", "facts", "versions", "stories", "dataactions", "multiactions", "files", "tasks", "audit"];
  const AUDIT_LIMIT = 2000;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const wait = (v) => Promise.resolve(clone(v));

  class MockProvider extends DataProvider {
    constructor(options) {
      super();
      this._persist = !!(options && options.persist);
      this._seed = clone(options.seed);
      this._db = null;
      this._load();
    }

    get id() { return "mock"; }

    get capabilities() { return { audit: true }; }

    static async create(options) {
      const seed = {};
      await Promise.all(COLLECTIONS.map(async (name) => {
        const res = await fetch(sap.ui.require.toUrl("zsac/lib/provider/mockdata/" + name + ".json"));
        seed[name] = res.ok ? await res.json() : [];
      }));
      return new MockProvider(Object.assign({ persist: true }, options, { seed }));
    }

    _load() {
      let db = null;
      if (this._persist) {
        try { db = JSON.parse(window.localStorage.getItem(STORE_KEY)); } catch (e) { db = null; }
      }
      this._db = db && typeof db === "object" ? db : clone(this._seed);
      // a store written by an older version lacks newer collections: add them instead of dropping the user's work
      COLLECTIONS.forEach((c) => { if (!Array.isArray(this._db[c])) { this._db[c] = clone(this._seed[c] || []); } });
    }

    _save() {
      if (!this._persist) { return; }
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(this._db)); } catch (e) { /* quota or private mode: stay in memory */ }
    }

    reset() {
      this._db = clone(this._seed);
      this._save();
    }

    _upsert(collection, item, keyFn) {
      const list = this._db[collection];
      const k = keyFn(item);
      const i = list.findIndex((x) => keyFn(x) === k);
      if (i >= 0) { list[i] = clone(item); } else { list.push(clone(item)); }
      this._save();
      return item;
    }

    _remove(collection, pred) {
      this._db[collection] = this._db[collection].filter((x) => !pred(x));
      this._save();
    }

    // models
    listModels() { return wait(this._db.models.map(ModelSchema.normalize)); }
    getModel(id) {
      const m = this._db.models.find((x) => x.ModelId === id);
      return m ? wait(ModelSchema.normalize(m)) : Promise.reject(new Error("Model not found: " + id));
    }
    _putModel(model) { return Promise.resolve(this._upsert("models", ModelSchema.normalize(model), (x) => x.ModelId)).then(clone); }
    deleteModel(id) {
      this._remove("models", (x) => x.ModelId === id);
      this._remove("facts", (x) => x.ModelId === id);
      this._remove("versions", (x) => x.ModelId === id);
      this._remove("files", (x) => x.Type === "MODEL" && x.ObjectId === id);
      return Promise.resolve();
    }

    // facts
    async readFacts(modelId, filters) {
      const model = await this.getModel(modelId);
      const own = this._db.facts.filter((f) => f.ModelId === modelId);
      return clone(QueryEngine.applyFilters(model, own, filters || {}));
    }
    async writeFacts(modelId, rows) {
      const model = this._db.models.find((x) => x.ModelId === modelId);
      const audit = !!(model && model.DataAudit);
      const at = new Date().toISOString();
      const index = new Map(this._db.facts.map((f, i) => [DataActionEngine.keyOf(f), i]));
      rows.forEach((r) => {
        const f = Object.assign({ Dim1: "", Dim2: "", Dim3: "", Dim4: "", Dim5: "" }, r, { ModelId: modelId });
        const k = DataActionEngine.keyOf(f);
        const old = index.has(k) ? this._db.facts[index.get(k)].Value : null;
        if (audit && old !== f.Value) {
          this._db.audit.unshift({ At: at, User: "ME", ModelId: modelId, VersionId: f.VersionId, Period: f.Period, Measure: f.Measure,
            Dims: [f.Dim1, f.Dim2, f.Dim3, f.Dim4, f.Dim5].filter(Boolean).join(" / "), Old: old, New: f.Value });
        }
        if (index.has(k)) { this._db.facts[index.get(k)] = f; } else { index.set(k, this._db.facts.push(f) - 1); }
      });
      if (this._db.audit.length > AUDIT_LIMIT) { this._db.audit.length = AUDIT_LIMIT; }
      this._save();
      return rows.length;
    }
    async deleteFacts(modelId, rows) {
      const keys = new Set(rows.map((r) => DataActionEngine.keyOf(Object.assign({ ModelId: modelId, Dim1: "", Dim2: "", Dim3: "", Dim4: "", Dim5: "" }, r))));
      this._remove("facts", (f) => keys.has(DataActionEngine.keyOf(f)));
      return rows.length;
    }

    async listAudit(modelId, limit) {
      return clone(this._db.audit.filter((a) => !modelId || a.ModelId === modelId).slice(0, limit || 100));
    }

    // versions
    listVersions(modelId) { return wait(this._db.versions.filter((v) => !modelId || v.ModelId === modelId)); }
    saveVersion(v) { return Promise.resolve(this._upsert("versions", v, (x) => x.ModelId + "|" + x.VersionId)).then(clone); }
    async createPrivateVersion(modelId, fromVersionId, name) {
      let n = 1;
      const used = new Set(this._db.versions.filter((v) => v.ModelId === modelId).map((v) => v.VersionId));
      while (used.has("PRIV" + n)) { n++; }
      const version = { ModelId: modelId, VersionId: "PRIV" + n, Name: name || ("Private " + n), Category: "PRIVATE",
        Locked: false, Owner: "ME", SourceVersion: fromVersionId, Status: "D" };
      this._upsert("versions", version, (v) => v.ModelId + "|" + v.VersionId);
      await this.writeFacts(modelId, VersionEngine.copyVersion(this._db.facts.filter((f) => f.ModelId === modelId), fromVersionId, version.VersionId));
      return clone(version);
    }
    async publishVersion(modelId, privateId, targetId) {
      const target = this._db.versions.find((v) => v.ModelId === modelId && v.VersionId === targetId);
      if (!target) { throw new Error("Target version not found: " + targetId); }
      if (target.Locked) { throw new Error("Version " + targetId + " is locked"); }
      const own = this._db.facts.filter((f) => f.ModelId === modelId);
      const after = VersionEngine.publish(own, privateId, targetId);
      this._db.facts = this._db.facts.filter((f) => f.ModelId !== modelId).concat(after);
      this._save();
      return { Published: after.filter((f) => f.VersionId === targetId).length };
    }
    async revertVersion(modelId, privateId) {
      const v = this._db.versions.find((x) => x.ModelId === modelId && x.VersionId === privateId);
      if (!v || !v.SourceVersion) { throw new Error("Nothing to revert for " + privateId); }
      const own = this._db.facts.filter((f) => f.ModelId === modelId);
      const kept = VersionEngine.revert(own, privateId).concat(VersionEngine.copyVersion(own, v.SourceVersion, privateId));
      this._db.facts = this._db.facts.filter((f) => f.ModelId !== modelId).concat(kept);
      this._save();
    }
    async deleteVersion(modelId, versionId) {
      const v = this._db.versions.find((x) => x.ModelId === modelId && x.VersionId === versionId);
      if (v && v.Category !== "PRIVATE") { throw new Error("Only private versions can be deleted"); }
      this._remove("facts", (f) => f.ModelId === modelId && f.VersionId === versionId);
      this._remove("versions", (x) => x.ModelId === modelId && x.VersionId === versionId);
    }

    // stories
    listStories() { return wait(this._db.stories.map((s) => Object.assign({}, s, { Widgets: undefined }))); }
    getStory(id) {
      const s = this._db.stories.find((x) => x.Id === id);
      return s ? wait(s) : Promise.reject(new Error("Story not found: " + id));
    }
    _putStory(story) { return Promise.resolve(this._upsert("stories", story, (x) => x.Id)).then(clone); }
    async deleteStory(id) {
      this._remove("stories", (x) => x.Id === id);
      this._remove("files", (x) => x.Type === "STORY" && x.ObjectId === id);
    }

    // data actions
    listDataActions() { return wait(this._db.dataactions); }
    getDataAction(id) {
      const a = this._db.dataactions.find((x) => x.Id === id);
      return a ? wait(a) : Promise.reject(new Error("Data action not found: " + id));
    }
    _putDataAction(a) { return Promise.resolve(this._upsert("dataactions", a, (x) => x.Id)).then(clone); }
    async deleteDataAction(id) {
      this._remove("dataactions", (x) => x.Id === id);
      this._remove("files", (x) => x.Type === "DATAACTION" && x.ObjectId === id);
    }
    async executeDataAction(id, params) {
      const action = await this.getDataAction(id);
      const model = await this.getModel(action.ModelId);
      const versions = this._db.versions.filter((v) => v.ModelId === action.ModelId);
      const locked = new Set(versions.filter((v) => v.Locked).map((v) => v.VersionId));
      const targets = (action.Steps || []).filter((s) => s.TgtVersion && locked.has(s.TgtVersion));
      if (targets.length) { throw new Error("Version " + targets[0].TgtVersion + " is locked"); }
      const before = this._db.facts.filter((f) => f.ModelId === action.ModelId);
      const run = DataActionEngine.run(model, before, action, params);
      const delta = DataActionEngine.diff(before, run.facts);
      await this.deleteFacts(action.ModelId, delta.deletes);
      await this.writeFacts(action.ModelId, delta.upserts);
      return { Changed: run.changed, Log: run.log };
    }

    // multi actions
    listMultiActions() { return wait(this._db.multiactions); }
    getMultiAction(id) {
      const a = this._db.multiactions.find((x) => x.Id === id);
      return a ? wait(a) : Promise.reject(new Error("Multi action not found: " + id));
    }
    _putMultiAction(a) { return Promise.resolve(this._upsert("multiactions", a, (x) => x.Id)).then(clone); }
    async deleteMultiAction(id) {
      this._remove("multiactions", (x) => x.Id === id);
      this._remove("files", (x) => x.Type === "MULTIACTION" && x.ObjectId === id);
    }
    async runMultiAction(id, params) {
      const action = await this.getMultiAction(id);
      const log = [];
      for (const step of (action.Steps || []).slice().sort((a, b) => a.StepNo - b.StepNo)) {
        try {
          if (step.StepType === "DATAACTION") {
            const r = await this.executeDataAction(step.ActionId, params);
            log.push("Step " + step.StepNo + " data action " + step.ActionId + ": " + r.Changed + " values changed");
          } else if (step.StepType === "PUBLISH") {
            const r = await this.publishVersion(step.ModelId, step.SourceVersion, step.TargetVersion);
            log.push("Step " + step.StepNo + " publish " + step.SourceVersion + " to " + step.TargetVersion + ": " + r.Published + " values");
          } else {
            log.push("Step " + step.StepNo + ": unknown type " + step.StepType);
          }
        } catch (e) {
          log.push("Step " + step.StepNo + " failed: " + e.message);
          return { Status: "E", Log: log };
        }
      }
      return { Status: "S", Log: log };
    }

    // files and calendar
    listFiles() { return wait(this._db.files); }
    saveFile(file) { return Promise.resolve(this._upsert("files", file, (x) => x.Id)).then(clone); }
    deleteFile(id) { this._remove("files", (x) => x.Id === id); return Promise.resolve(); }
    listTasks() { return wait(this._db.tasks); }
    saveTask(task) { return Promise.resolve(this._upsert("tasks", task, (x) => x.Id)).then(clone); }
    deleteTask(id) { this._remove("tasks", (x) => x.Id === id); return Promise.resolve(); }
  }

  return MockProvider;
});
