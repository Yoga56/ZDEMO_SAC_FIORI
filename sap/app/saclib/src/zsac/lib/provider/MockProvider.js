/**
 * In-memory provider seeded from mockdata/*.json. Changes (new stories, edited plan cells ...) are kept in
 * localStorage so a demo survives a reload; `reset()` returns to the seed. Runs with no backend at all.
 *
 * new MockProvider({ seed })              seed injected (unit tests)
 * MockProvider.create()                   loads mockdata/*.json relative to the library
 */
sap.ui.define([
  "../core/DataProvider",
  "../core/Access",
  "../core/QueryEngine",
  "../core/ModelSchema",
  "../planning/DataActionEngine",
  "../planning/VersionEngine",
  "./LiveSource",
  "./FakeODataService"
], function (DataProvider, Access, QueryEngine, ModelSchema, DataActionEngine, VersionEngine, LiveSource, FakeODataService) {
  "use strict";

  const STORE_KEY = "zsac.mock.v1";
  const COLLECTIONS = ["models", "facts", "versions", "stories", "dataactions", "multiactions", "files", "tasks", "audit", "runs", "comments", "shares"];
  const AUDIT_LIMIT = 2000;
  const RUN_LIMIT = 500;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const wait = (v) => Promise.resolve(clone(v));

  /** The objects that have an owner and can be shared: where they are kept, which field is the id, what they are called in a message. */
  const KINDS = {
    STORY: { coll: "stories", id: "Id", noun: "story" },
    MODEL: { coll: "models", id: "ModelId", noun: "model" },
    DATAACTION: { coll: "dataactions", id: "Id", noun: "data action" },
    MULTIACTION: { coll: "multiactions", id: "Id", noun: "multi action" },
    CALEVENT: { coll: "tasks", id: "Id", noun: "calendar event" }
  };

  class MockProvider extends DataProvider {
    constructor(options) {
      super();
      this._persist = !!(options && options.persist);
      this._user = String((options && options.user) || "ME").toUpperCase(); // ?user=ALICE in the URL plays another user
      this._seed = clone(options.seed);
      this._db = null;
      this._load();
    }

    get id() { return "mock"; }

    get capabilities() { return { audit: true, comments: true, sharing: true }; }

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

    // ---- ownership and sharing -----------------------------------------------------------
    currentUser() { return Promise.resolve(this._user); }
    /** Another user on the same data (for tests and demos): the store is shared, only the identity differs. */
    asUser(user) {
      const other = new MockProvider({ seed: this._seed, persist: false, user });
      other._db = this._db;
      return other;
    }
    _idOf(kind, o) { return o[KINDS[kind].id]; }
    _sharesOf(kind, id) { return this._db.shares.filter((x) => x.Kind === kind && x.ObjectId === id); }
    _level(kind, o) { return Access.level(this._user, o.Owner, this._sharesOf(kind, this._idOf(kind, o))); }
    _can(kind, o, action) { return Access.can(this._level(kind, o), action, Access.isOpen(o.Owner)); }
    _withAccess(kind, o) { return Object.assign({}, o, { Access: Access.isOpen(o.Owner) ? "WRITE" : this._level(kind, o) }); }
    _denied(kind, o, verb) {
      const what = KINDS[kind].noun;
      return new Error("You are not allowed to " + verb + " the " + what + " " + this._idOf(kind, o) + (o.Owner ? " (owner " + o.Owner + ")" : "") + ".");
    }
    /** Saves an object that has an owner: a new one belongs to the user, an existing one needs edit access and keeps its owner. */
    _putOwned(kind, object) {
      const k = KINDS[kind];
      const old = this._db[k.coll].find((x) => x[k.id] === object[k.id]);
      if (old && !this._can(kind, old, "edit")) { return Promise.reject(this._denied(kind, old, "change")); }
      const stored = Object.assign({}, object, { Owner: old ? old.Owner : this._user });
      delete stored.Access;
      return Promise.resolve(this._upsert(k.coll, stored, (x) => x[k.id])).then((x) => this._withAccess(kind, clone(x)));
    }

    async _assertEditable(modelId) {
      const m = this._db.models.find((x) => x.ModelId === modelId);
      if (m && !this._can("MODEL", m, "edit")) { throw this._denied("MODEL", m, "change the data of"); }
    }
    async listShares(kind, id) {
      const o = this._find(kind, id);
      if (!o) { throw new Error("Not found: " + id); }
      const mine = this._level(kind, o) === "OWNER";
      return wait(this._sharesOf(kind, id).filter((x) => mine || x.Principal === "*" || x.Principal.toUpperCase() === this._user).map((x) => ({ Principal: x.Principal, Access: x.Access })));
    }
    _find(kind, id) { const k = KINDS[kind]; return k ? this._db[k.coll].find((x) => x[k.id] === id) : undefined; }
    async saveShares(kind, id, shares) {
      const o = this._find(kind, id);
      if (!o) { throw new Error("Not found: " + id); }
      if (Access.isOpen(o.Owner)) { throw new Error("This " + kind.toLowerCase() + " has no owner, so it is open to everyone and cannot be shared."); }
      if (this._level(kind, o) !== "OWNER") { throw new Error("Only the owner (" + o.Owner + ") can change who has access."); }
      const n = Access.normalize(shares, o.Owner);
      if (n.errors.length) { throw new Error(n.errors.join(" ")); }
      this._remove("shares", (x) => x.Kind === kind && x.ObjectId === id);
      n.shares.forEach((s) => this._db.shares.push({ Kind: kind, ObjectId: id, Principal: s.Principal, Access: s.Access }));
      const file = this._db.files.find((f) => f.Type === kind && f.ObjectId === id);
      if (file) { file.Shared = n.shares.length > 0; }
      this._save();
      return clone(n.shares);
    }

    // models
    listModels() { return wait(this._db.models.filter((m) => this._can("MODEL", m, "read")).map((m) => this._withAccess("MODEL", ModelSchema.normalize(m)))); }
    getModel(id) {
      const m = this._db.models.find((x) => x.ModelId === id);
      if (!m) { return Promise.reject(new Error("Model not found: " + id)); }
      return this._can("MODEL", m, "read") ? wait(this._withAccess("MODEL", ModelSchema.normalize(m))) : Promise.reject(this._denied("MODEL", m, "open"));
    }
    _putModel(model) {
      const old = this._db.models.find((x) => x.ModelId === model.ModelId);
      if (old && !this._can("MODEL", old, "edit")) { return Promise.reject(this._denied("MODEL", old, "change")); }
      const stored = ModelSchema.normalize(Object.assign({}, model, { Owner: old ? old.Owner : this._user }));
      delete stored.Access;
      return Promise.resolve(this._upsert("models", stored, (x) => x.ModelId)).then((m) => this._withAccess("MODEL", clone(m)));
    }
    deleteModel(id) {
      const m = this._db.models.find((x) => x.ModelId === id);
      if (m && !this._can("MODEL", m, "delete")) { return Promise.reject(this._denied("MODEL", m, "delete")); }
      this._remove("shares", (x) => x.Kind === "MODEL" && x.ObjectId === id);
      this._remove("models", (x) => x.ModelId === id);
      this._remove("facts", (x) => x.ModelId === id);
      this._remove("versions", (x) => x.ModelId === id);
      this._remove("files", (x) => x.Type === "MODEL" && x.ObjectId === id);
      return Promise.resolve();
    }

    // facts
    /**
     * The sample data source: a fake OData service "mock://cds/ZSALES_CUBE" whose rows are the actuals of SALES_PLAN (region, product, channel, a YYYYMM period,
     * revenue and cost), so a model with a CDS source can be tried without a backend.
     */
    sourceFetch() {
      const fake = FakeODataService.createFetch({
        "mock://cds/ZSALES_CUBE": {
          entitySet: "ZSalesCube",
          properties: { Region: "Edm.String", Product: "Edm.String", Channel: "Edm.String", FiscalPeriod: "Edm.String", Revenue: "Edm.Decimal", Cost: "Edm.Decimal" },
          rows: () => {
            const rows = new Map();
            this._db.facts.filter((f) => f.ModelId === "SALES_PLAN" && f.VersionId === "ACT").forEach((f) => {
              const k = [f.Dim1, f.Dim2, f.Dim3, f.Period].join("|");
              if (!rows.has(k)) { rows.set(k, { Region: f.Dim1, Product: f.Dim2, Channel: f.Dim3, FiscalPeriod: f.Period.replace("-", ""), Revenue: null, Cost: null }); }
              rows.get(k)[f.Measure === "REVENUE" ? "Revenue" : "Cost"] = f.Value;
            });
            return Array.from(rows.values());
          }
        }
      });
      return LiveSource.browserFetch((url, init) => (String(url).indexOf("mock://") === 0 ? fake(url, init) : window.fetch(url, init)));
    }

    async readFacts(modelId, filters) {
      const model = await this.getModel(modelId); // refused when the user may not open the model
      if (LiveSource.isLive(model)) { return clone(await LiveSource.readFacts(model, filters, this.sourceFetch().json)); }
      const own = this._db.facts.filter((f) => f.ModelId === modelId);
      return clone(QueryEngine.applyFilters(model, own, filters || {}));
    }
    async writeFacts(modelId, rows) {
      await this._assertWritable(modelId);
      await this._assertEditable(modelId);
      const changed = this._changed(modelId, rows);
      await this._assertUnlocked(modelId, changed);
      await this._assertValid(modelId, changed);
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
    /** The rows that change the stored data (a new fact, or another value): data locking only looks at changes. */
    _changed(modelId, rows) {
      const m = this._db.models.find((x) => x.ModelId === modelId);
      if (!m || (!m.DataLocking && !(m.ValidationRules || []).length)) { return rows; }
      const have = new Map(this._db.facts.filter((f) => f.ModelId === modelId).map((f) => [DataActionEngine.keyOf(f), f.Value]));
      return rows.filter((r) => {
        const k = DataActionEngine.keyOf(Object.assign({ Dim1: "", Dim2: "", Dim3: "", Dim4: "", Dim5: "" }, r, { ModelId: modelId }));
        return !have.has(k) || have.get(k) !== r.Value;
      });
    }
    async deleteFacts(modelId, rows) {
      await this._assertWritable(modelId);
      await this._assertEditable(modelId);
      await this._assertUnlocked(modelId, rows);
      const keys = new Set(rows.map((r) => DataActionEngine.keyOf(Object.assign({ ModelId: modelId, Dim1: "", Dim2: "", Dim3: "", Dim4: "", Dim5: "" }, r))));
      this._remove("facts", (f) => keys.has(DataActionEngine.keyOf(f)));
      return rows.length;
    }

    async listAudit(modelId, limit) {
      return clone(this._db.audit.filter((a) => !modelId || a.ModelId === modelId).slice(0, limit || 100));
    }

    // versions
    listVersions(modelId) {
      const model = modelId && this._db.models.find((m) => m.ModelId === modelId);
      if (model && model.Source && model.Source.Mode === "LIVE") { return wait([LiveSource.liveVersion(model)]); }
      return wait(this._db.versions.filter((v) => !modelId || v.ModelId === modelId));
    }
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
      // data locking looks at what the publish changes in the target: new and changed values, and values that disappear
      const was = new Map(own.filter((f) => f.VersionId === targetId).map((f) => [DataActionEngine.keyOf(f), f]));
      const now = after.filter((f) => f.VersionId === targetId);
      const nowKeys = new Set(now.map((f) => DataActionEngine.keyOf(f)));
      await this._assertEditable(modelId);
      const changedNow = now.filter((f) => !was.has(DataActionEngine.keyOf(f)) || was.get(DataActionEngine.keyOf(f)).Value !== f.Value);
      await this._assertUnlocked(modelId, changedNow.concat(Array.from(was.values()).filter((f) => !nowKeys.has(DataActionEngine.keyOf(f)))));
      await this._assertValid(modelId, changedNow);
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
      if (v && v.Locked) { throw new Error("Version " + versionId + " is locked. Unlock it before deleting it."); }
      this._remove("facts", (f) => f.ModelId === modelId && f.VersionId === versionId);
      this._remove("versions", (x) => x.ModelId === modelId && x.VersionId === versionId);
    }

    // stories
    listStories() { return wait(this._db.stories.filter((s) => this._can("STORY", s, "read")).map((s) => this._withAccess("STORY", Object.assign({}, s, { Widgets: undefined })))); }
    getStory(id) {
      const s = this._db.stories.find((x) => x.Id === id);
      if (!s) { return Promise.reject(new Error("Story not found: " + id)); }
      return this._can("STORY", s, "read") ? wait(this._withAccess("STORY", s)) : Promise.reject(this._denied("STORY", s, "open"));
    }
    _putStory(story) {
      const old = this._db.stories.find((x) => x.Id === story.Id);
      if (old && !this._can("STORY", old, "edit")) { return Promise.reject(this._denied("STORY", old, "change")); }
      const stored = Object.assign({}, story, { Owner: old ? old.Owner : this._user });
      delete stored.Access;
      return Promise.resolve(this._upsert("stories", stored, (x) => x.Id)).then((x) => this._withAccess("STORY", clone(x)));
    }
    async deleteStory(id) {
      const st = this._db.stories.find((x) => x.Id === id);
      if (st && !this._can("STORY", st, "delete")) { throw this._denied("STORY", st, "delete"); }
      this._remove("shares", (x) => x.Kind === "STORY" && x.ObjectId === id);
      this._remove("stories", (x) => x.Id === id);
      this._remove("files", (x) => x.Type === "STORY" && x.ObjectId === id);
    }

    // data actions
    listDataActions() { return wait(this._db.dataactions.filter((a) => this._can("DATAACTION", a, "read")).map((a) => this._withAccess("DATAACTION", a))); }
    getDataAction(id) {
      const a = this._db.dataactions.find((x) => x.Id === id);
      if (!a) { return Promise.reject(new Error("Data action not found: " + id)); }
      return this._can("DATAACTION", a, "read") ? wait(this._withAccess("DATAACTION", a)) : Promise.reject(this._denied("DATAACTION", a, "open"));
    }
    _putDataAction(a) { return this._putOwned("DATAACTION", a); }
    async deleteDataAction(id) {
      const old = this._db.dataactions.find((x) => x.Id === id);
      if (old && !this._can("DATAACTION", old, "delete")) { throw this._denied("DATAACTION", old, "delete"); }
      this._remove("shares", (x) => x.Kind === "DATAACTION" && x.ObjectId === id);
      this._remove("dataactions", (x) => x.Id === id);
      this._remove("files", (x) => x.Type === "DATAACTION" && x.ObjectId === id);
    }

    // comments (Comment Management step); a comment belongs to a version and, optionally, a period and a member combination
    async listComments(modelId, versionId) {
      return clone(this._db.comments.filter((c) => (!modelId || c.ModelId === modelId) && (!versionId || c.VersionId === versionId)));
    }
    async saveComment(comment) {
      const c = Object.assign({ Author: "ME", At: new Date().toISOString() }, clone(comment));
      this._upsert("comments", c, (x) => x.Id);
      return clone(c);
    }
    async deleteComment(id) { this._remove("comments", (c) => c.Id === id); }

    /** The mock has no PaPM: the run is simulated so a multi action with a PaPM step can be tried out. */
    async runPapm(request) {
      return { Status: "S", Message: "Simulated PaPM run of " + request.FunctionId + " in " + request.Environment + " (" + Object.keys(request.Parameters || {}).length + " parameters)" };
    }

    // run history of data and multi actions
    async listRuns(actionId, limit) {
      const readable = (r) => { const kind = r.Kind === "MULTI" ? "MULTIACTION" : "DATAACTION"; const o = this._find(kind, r.ActionId); return !o || this._can(kind, o, "read"); }; // the history of an action the user may not open is not shown
      return clone(this._db.runs.filter((r) => (!actionId || r.ActionId === actionId) && readable(r)).slice(0, limit || 100));
    }
    async _putRun(entry) {
      const at = new Date().toISOString();
      this._db.runs.unshift(Object.assign({ Id: "RUN" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), User: "ME", At: at }, clone(entry)));
      if (this._db.runs.length > RUN_LIMIT) { this._db.runs.length = RUN_LIMIT; }
      this._save();
    }

    // multi actions
    listMultiActions() { return wait(this._db.multiactions.filter((a) => this._can("MULTIACTION", a, "read")).map((a) => this._withAccess("MULTIACTION", a))); }
    getMultiAction(id) {
      const a = this._db.multiactions.find((x) => x.Id === id);
      if (!a) { return Promise.reject(new Error("Multi action not found: " + id)); }
      return this._can("MULTIACTION", a, "read") ? wait(this._withAccess("MULTIACTION", a)) : Promise.reject(this._denied("MULTIACTION", a, "open"));
    }
    _putMultiAction(a) { return this._putOwned("MULTIACTION", a); }
    async deleteMultiAction(id) {
      const old = this._db.multiactions.find((x) => x.Id === id);
      if (old && !this._can("MULTIACTION", old, "delete")) { throw this._denied("MULTIACTION", old, "delete"); }
      this._remove("shares", (x) => x.Kind === "MULTIACTION" && x.ObjectId === id);
      this._remove("multiactions", (x) => x.Id === id);
      this._remove("files", (x) => x.Type === "MULTIACTION" && x.ObjectId === id);
    }

    // files and calendar
    /** Folders are open; any other file shows when the user may open what it stands for (a story or model they cannot open is not listed). */
    listFiles() {
      return wait(this._db.files.filter((f) => {
        if (f.Type === "STORY") { const o = this._db.stories.find((x) => x.Id === f.ObjectId); return !o || this._can("STORY", o, "read"); }
        if (f.Type === "MODEL") { const o = this._db.models.find((x) => x.ModelId === f.ObjectId); return !o || this._can("MODEL", o, "read"); }
        if (f.Type === "DATAACTION") { const o = this._db.dataactions.find((x) => x.Id === f.ObjectId); return !o || this._can("DATAACTION", o, "read"); }
        if (f.Type === "MULTIACTION") { const o = this._db.multiactions.find((x) => x.Id === f.ObjectId); return !o || this._can("MULTIACTION", o, "read"); }
        return true;
      }));
    }
    saveFile(file) { return Promise.resolve(this._upsert("files", file, (x) => x.Id)).then(clone); }
    deleteFile(id) { this._remove("files", (x) => x.Id === id); return Promise.resolve(); }
    listTasks() { return wait(this._db.tasks.filter((t) => this._can("CALEVENT", t, "read")).map((t) => this._withAccess("CALEVENT", t))); }
    getTask(id) {
      const t = this._db.tasks.find((x) => x.Id === id);
      if (!t) { return Promise.reject(new Error("Event not found: " + id)); }
      return this._can("CALEVENT", t, "read") ? wait(this._withAccess("CALEVENT", t)) : Promise.reject(this._denied("CALEVENT", t, "open"));
    }
    saveTask(task) { return this._putOwned("CALEVENT", task); }
    deleteTask(id) {
      const t = this._db.tasks.find((x) => x.Id === id);
      if (t && !this._can("CALEVENT", t, "delete")) { return Promise.reject(this._denied("CALEVENT", t, "delete")); }
      this._remove("shares", (x) => x.Kind === "CALEVENT" && x.ObjectId === id);
      this._remove("tasks", (x) => x.Id === id);
      return Promise.resolve();
    }
  }

  return MockProvider;
});
