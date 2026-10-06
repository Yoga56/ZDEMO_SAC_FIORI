/**
 * Provider over the RAP OData V4 service ZUI_SAC_O4 (sap/src). It maps the flat entities of the service to the
 * JSON objects the library works with (see mapping helpers) and calls the RAP actions for everything that must
 * run on the server: planning writes, version publish, data actions, multi actions.
 *
 * Pattern follows PlanService.js of Estate Command: a V4 ODataModel, list bindings for reads, operation
 * bindings (bindContext("/Entity/ns.Action(...)")) for actions. Not exercised against a live system in this
 * repository: the mock provider is the tested path.
 *
 * new ODataV4Provider({ model })   model = the app's default sap.ui.model.odata.v4.ODataModel
 */
sap.ui.define([
  "../core/DataProvider",
  "../core/Access",
  "../core/ModelSchema",
  "../core/QueryEngine",
  "../planning/LockEngine",
  "../planning/ValidationEngine",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "./LiveSource"
], function (DataProvider, Access, ModelSchema, QueryEngine, LockEngine, ValidationEngine, Filter, FilterOperator, LiveSource) {
  "use strict";

  const NS = "com.sap.gateway.srvd.zui_sac_o4.v0001.";
  const PAGE = 10000;
  const json = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; } };
  const str = (o) => JSON.stringify(o === undefined ? null : o);

  // Data locking and validation rules are stored as {"regions": [...]} / {"rules": [...]} for the client and, next to it, "srv": the same rules
  // in the form the ABAP class ZCL_SAC_DATA_RULES reads (lower case names, every slice resolved to the members it covers).
  const FIELD = { Period: "period", VersionId: "version_id", Measure: "measure", Dim1: "dim1", Dim2: "dim2", Dim3: "dim3", Dim4: "dim4", Dim5: "dim5" };
  const unpack = (doc, key) => (Array.isArray(doc) ? doc : (doc && doc[key]) || []);
  const slices = (model, filter) => {
    const x = QueryEngine.expandFilters(model, filter || {});
    return Object.keys(x).map((d) => ({ fname: FIELD[QueryEngine.fieldOf(model, d)], members: x[d] }));
  };
  const packLocks = (m) => {
    const regions = LockEngine.normalize(m.LockRegions);
    return str({ regions, srv: regions.map((r) => ({ id: r.Id, name: r.Name, state: r.State, owners: r.Owners, slices: slices(m, r.Filter) })) });
  };
  const packRules = (m) => {
    const rules = ValidationEngine.normalize(m.ValidationRules);
    return str({ rules, srv: rules.map((r) => ({ id: r.Id, name: r.Name, measure: r.Measure, level: r.Level, message: r.Message,
      min_value: r.Min === null ? "" : String(r.Min), max_value: r.Max === null ? "" : String(r.Max), slices: slices(m, r.Filter) })) });
  };
  const quote = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  /** Filters travel as "REGION=APAC,EMEA;PERIOD=2026-01" in the filter columns and action parameters of the backend. */
  const strip = (o) => { const c = Object.assign({}, o); Object.keys(c).forEach((k) => { if (k.startsWith("@") || k.startsWith("_")) { delete c[k]; } }); return c; };

  class ODataV4Provider extends DataProvider {
    constructor(options) {
      super();
      if (!options || !options.model) { throw new Error("ODataV4Provider needs the app's OData V4 model"); }
      this._m = options.model;
    }

    get id() { return "odata"; }

    // ---- plumbing ---------------------------------------------------------------------------
    async _list(path, filters, params) {
      const binding = this._m.bindList(path, null, null, filters || [], params);
      const contexts = await binding.requestContexts(0, PAGE);
      return contexts.map((c) => c.getObject());
    }

    async _one(path, key, params) {
      const rows = await this._list(path, [new Filter(key[0], FilterOperator.EQ, key[1])], params);
      if (!rows.length) { throw new Error("Not found: " + path + " " + key[1]); }
      return rows[0];
    }

    // ---- writing ----------------------------------------------------------------------------
    // Rows are written with plain requests, one POST per business object with its children inside (deep insert), because
    //  - the server checks a business object when it is saved: a model without dimensions is refused, and a root created first and its children after would be;
    //  - the UI5 model keeps a failed creation pending forever, which made Save look dead; here every failure is an exception with the message of the service.
    async _token(fresh) {
      if (!fresh && this._csrf) { return this._csrf; }
      const fromModel = !fresh && this._m.getHttpHeaders && this._m.getHttpHeaders()["X-CSRF-Token"];
      if (fromModel) { return (this._csrf = fromModel); }
      const res = await fetch(this._m.getServiceUrl(), { method: "HEAD", headers: { "X-CSRF-Token": "Fetch" }, credentials: "same-origin" });
      this._csrf = res.headers.get("x-csrf-token") || "";
      return this._csrf;
    }

    async _errorText(res) {
      let detail = "";
      try {
        const b = await res.json();
        const m = b && b.error && b.error.message;
        const more = ((b && b.error && b.error.details) || []).map((d) => d.message).filter(Boolean);
        detail = [typeof m === "string" ? m : (m && m.value) || ""].concat(more).filter(Boolean).join(": ");
      } catch (e) { /* not json */ }
      return "The service answered " + res.status + (detail ? ": " + detail : "");
    }

    async _request(method, path, body, headers, retried) {
      const url = this._m.getServiceUrl() + encodeURI(String(path).replace(/^\//, ""));
      const h = Object.assign({ Accept: "application/json", "X-CSRF-Token": await this._token() }, body ? { "Content-Type": "application/json" } : {}, headers || {});
      const res = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
      if (res.status === 403 && res.headers.get("x-csrf-token") === "Required" && !retried) { await this._token(true); return this._request(method, path, body, headers, true); }
      if (!res.ok) { throw Object.assign(new Error(await this._errorText(res)), { status: res.status }); }
      return res;
    }

    _post(path, body) { return this._request("POST", path, body); }
    _delete(keyPath) { return this._request("DELETE", keyPath, null, { "If-Match": "*" }); }

    /** Create or replace by key: delete and create keeps the mapping simple and removes the children with the root (compositions). */
    async _replace(path, keyPath, entity) {
      await this._delete(keyPath).catch((e) => { if (!e || e.status !== 404) { throw e; } });
      await this._post(path, entity);
      return entity;
    }

    /** Same with children inside the payload; if the new object is refused the old one is put back (best effort) and the refusal is reported. */
    async _replaceDeep(path, keyPath, payload, old) {
      await this._delete(keyPath).catch((e) => { if (!e || e.status !== 404) { throw e; } });
      try { await this._post(path, payload); } catch (e) {
        if (old) { try { await this._post(path, old); } catch (x) { /* it could not be put back */ } }
        throw e;
      }
      return payload;
    }


    /**
     * Saves an object that exists: its own fields with a PATCH, its children replaced (deleted, then created through the composition).
     * Unlike delete and create this keeps the object, so its owner and its shares stay, and a user with edit access (who may not
     * delete the object) can save it. If a step is refused the old children and fields are put back (best effort) and the refusal is reported.
     * children = [{ prop: "_Widget", path: "/Widget", keys: ["StoryId", "WidgetId"] }]; keyFields are not sent with the PATCH.
     */
    async _updateDeep(keyPath, payload, old, children, keyFields) {
      const own = (o) => { const c = {}; Object.keys(o).forEach((k) => { if (k.charAt(0) !== "_" && keyFields.indexOf(k) < 0) { c[k] = o[k]; } }); return c; };
      const literal = (v) => (typeof v === "number" ? String(v) : quote(v)); // numbers (StepNo) are not quoted in an OData key
      const childKey = (c, row) => c.path + "(" + c.keys.map((k) => k + "=" + literal(row[k])).join(",") + ")";
      const patch = (target) => this._request("PATCH", keyPath, own(target), { "If-Match": "*" });
      const clear = async (list) => { for (const c of children) { for (const row of (list[c.prop] || [])) { await this._delete(childKey(c, row)).catch((e) => { if (!e || e.status !== 404) { throw e; } }); } } };
      const fill = async (target) => { for (const c of children) { for (const row of (target[c.prop] || [])) { await this._post(keyPath + "/" + c.prop, row); } } };
      await patch(payload);
      try {
        await clear(old);
        await fill(payload);
      } catch (e) {
        try { await clear(payload); await patch(old); await fill(old); } catch (x) { /* it could not be put back */ }
        throw e;
      }
      return payload;
    }

    /** Changes fields of an existing row with a PATCH (no delete, so determinations and dependants of a delete do not fire). Rejects when the row is missing. */
    async _patch(keyPath, values) {
      const context = this._m.bindContext(keyPath).getBoundContext();
      await context.requestObject();
      for (const k of Object.keys(values)) { await context.setProperty(k, values[k]); }
    }

    async _invokeDelete(keyPath) { return this._delete(keyPath); }

    async _action(path, params) {
      const op = this._m.bindContext(path);
      Object.keys(params || {}).forEach((k) => op.setParameter(k, params[k]));
      await op.execute();
      return op.getBoundContext().getObject();
    }

    // ---- ownership and sharing ---------------------------------------------------------------
    // The server stamps the owner on a new story or model and answers with the user's name in CurrentUser. The rows of /Share a user may see are
    // the shares of their own objects and the ones about them or about everyone, which is all the client needs to work out the access.
    _noteUser(rows) { const r = rows.find((x) => x && x.CurrentUser); if (r) { this._user = String(r.CurrentUser); } }

    async currentUser() {
      if (this._user) { return this._user; }
      for (const set of ["/Story", "/Model", "/DataAction", "/CalendarTask"]) {
        const rows = await this._list(set, [], { $select: "CurrentUser", $top: 1 }).catch(() => []);
        this._noteUser(rows);
        if (this._user) { return this._user; }
      }
      return "";
    }

    async _allShares() { return (await this._list("/Share")).map((e) => ({ Kind: e.ObjectKind, ObjectId: e.ObjectId, Principal: e.Principal, Access: e.AccessLevel })); }

    async _withAccess(kind, objects) {
      const user = await this.currentUser();
      const shares = objects.some((o) => !Access.isOpen(o.Owner) && String(o.Owner).toUpperCase() !== String(user).toUpperCase()) ? await this._allShares().catch(() => []) : [];
      return objects.map((o) => Object.assign({}, o, { Access: Access.level(user, o.Owner, shares.filter((x) => x.Kind === kind && x.ObjectId === DataProvider.idOf(kind, o))) }));
    }

    async listShares(kind, id) {
      return (await this._allShares()).filter((x) => x.Kind === kind && x.ObjectId === id).map((x) => ({ Principal: x.Principal, Access: x.Access }));
    }

    async saveShares(kind, id, shares) {
      const object = await this.getShareable(kind, id);
      if (Access.isOpen(object.Owner)) { throw new Error("This object has no owner, so it is open to everyone and cannot be shared."); }
      const n = Access.normalize(shares, object.Owner);
      if (n.errors.length) { throw new Error(n.errors.join(" ")); }
      const old = await this.listShares(kind, id);
      const key = (p) => "/Share(ObjectKind=" + quote(kind) + ",ObjectId=" + quote(id) + ",Principal=" + quote(p) + ")";
      const same = (p, a) => old.some((o) => o.Principal === p && o.Access === a);
      for (const o of old) { if (!n.shares.some((x) => x.Principal === o.Principal && x.Access === o.Access)) { await this._delete(key(o.Principal)); } }
      for (const x of n.shares) { if (!same(x.Principal, x.Access)) { await this._post("/Share", { ObjectKind: kind, ObjectId: id, Principal: x.Principal, AccessLevel: x.Access }); } }
      const file = (await this._list("/File", [new Filter("ObjectId", FilterOperator.EQ, id)])).find((f) => f.FileKind === kind);
      if (file && !!file.Shared !== (n.shares.length > 0)) { await this._request("PATCH", "/File(FileId=" + quote(file.FileId) + ")", { Shared: n.shares.length > 0 }, { "If-Match": "*" }).catch(() => {}); }
      return n.shares;
    }

    // ---- models -----------------------------------------------------------------------------
    _toModel(e) {
      return ModelSchema.normalize({
        ModelId: e.ModelId, Name: e.ModelName, Description: e.Description, Currency: e.Currency, Owner: e.OwnerId || "",
        PeriodFrom: e.PeriodFrom, PeriodTo: e.PeriodTo, PlanningEnabled: !!e.PlanningEnabled, DataLocking: !!e.DataLocking, LockDefault: e.LockDefault || "OPEN", LockRegions: unpack(json(e.LockJson, []), "regions"), ValidationRules: unpack(json(e.ValidJson, []), "rules"),
        DataAudit: !!e.DataAudit, DataSource: e.DataSource, Source: json(e.SourceJson, null),
        Dimensions: (e._Dimension || []).map((d) => ({ DimId: d.DimId, Label: d.DimLabel, Slot: d.Slot, Members: json(d.Members, []), Type: d.DimType || "GENERIC",
          Attributes: json(d.Attributes, undefined), Hierarchies: json(d.Hierarchies, []) }))
          .sort((a, b) => a.Slot - b.Slot),
        Measures: (e._Measure || []).map((m) => ({ MeasureId: m.MeasureId, Label: m.MeasureLabel, Unit: m.Unit, Aggregation: m.Aggregation || "SUM",
          DataType: m.DataType || "Decimal", UnitType: m.UnitType || "None", Scale: m.Scale, Decimals: m.Decimals,
          ExceptionAggregation: m.ExceptionAgg || "", ExceptionDims: String(m.ExceptionDims || "").split(",").filter(Boolean) }))
      });
    }
    async listModels() {
      const rows = await this._list("/Model", [], { $expand: "_Dimension,_Measure" });
      this._noteUser(rows);
      return this._withAccess("MODEL", rows.map((e) => this._toModel(e)));
    }
    async getModel(id) {
      const row = await this._one("/Model", ["ModelId", id], { $expand: "_Dimension,_Measure" });
      this._noteUser([row]);
      return (await this._withAccess("MODEL", [this._toModel(row)]))[0];
    }
    _modelPayload(m) {
      return {
        ModelId: m.ModelId, ModelName: m.Name, Description: m.Description || "", Currency: m.Currency || "",
        PeriodFrom: m.PeriodFrom || "", PeriodTo: m.PeriodTo || "", PlanningEnabled: m.PlanningEnabled !== false, DataLocking: !!m.DataLocking, LockDefault: m.LockDefault || "OPEN", LockJson: packLocks(m), ValidJson: packRules(m),
        DataAudit: !!m.DataAudit, DataSource: m.DataSource || "", SourceJson: m.Source ? str(m.Source) : "",
        _Dimension: (m.Dimensions || []).map((d) => ({ ModelId: m.ModelId, DimId: d.DimId, DimLabel: d.Label, Slot: d.Slot, Members: str(d.Members || []),
          DimType: d.Type || "GENERIC", Attributes: str(d.Attributes || []), Hierarchies: str(d.Hierarchies || []) })),
        _Measure: (m.Measures || []).map((x) => ({ ModelId: m.ModelId, MeasureId: x.MeasureId, MeasureLabel: x.Label, Unit: x.Unit || "", Aggregation: x.Aggregation || "SUM",
          DataType: x.DataType || "Decimal", UnitType: x.UnitType || "None", Scale: x.Scale || 1, Decimals: x.Decimals || 0,
          ExceptionAgg: x.ExceptionAggregation || "", ExceptionDims: (x.ExceptionDims || []).join(",") }))
      };
    }
    async _putModel(m) {
      const old = await this.getModel(m.ModelId).then((x) => this._modelPayload(x)).catch(() => null);
      const keyPath = "/Model(ModelId=" + quote(m.ModelId) + ")";
      if (old) {
        await this._updateDeep(keyPath, this._modelPayload(m), old, [{ prop: "_Dimension", path: "/Dimension", keys: ["ModelId", "DimId"] }, { prop: "_Measure", path: "/Measure", keys: ["ModelId", "MeasureId"] }], ["ModelId"]);
      } else {
        await this._post("/Model", this._modelPayload(m)); // the owner is the user who creates it: the server sets it
      }
      return this.getModel(m.ModelId).catch(() => m);
    }
    /** Deleting an object also removes its entry in Files (the mock provider does the same). */
    async _dropFile(type, id) {
      const rows = await this._list("/File", [new Filter("ObjectId", FilterOperator.EQ, id)]);
      for (const f of rows.filter((x) => x.FileKind === type)) { await this._delete("/File(FileId=" + quote(f.FileId) + ")").catch(() => {}); }
    }
    async deleteModel(id) { await this._invokeDelete("/Model(ModelId=" + quote(id) + ")"); await this._dropFile("MODEL", id); }

    // ---- facts ------------------------------------------------------------------------------
    async readFacts(modelId, filters) {
      const model = await this.getModel(modelId);
      if (LiveSource.isLive(model)) { return LiveSource.readFacts(model, filters, this.sourceFetch().json); }
      const list = [new Filter("ModelId", FilterOperator.EQ, modelId)];
      const slot = { VERSION: "VersionId", PERIOD: "Period", MEASURE: "Measure" };
      Object.keys(filters || {}).forEach((dim) => {
        const members = filters[dim] || [];
        if (!members.length) { return; }
        const d = (model.Dimensions || []).find((x) => x.DimId === dim);
        const field = slot[dim] || (d ? "Dim" + d.Slot : null);
        if (!field) { return; }
        list.push(new Filter({ filters: members.map((v) => new Filter(field, FilterOperator.EQ, v)), and: false }));
      });
      const rows = await this._list("/Fact", list, { $select: "ModelId,VersionId,Period,Measure,Dim1,Dim2,Dim3,Dim4,Dim5,Value" });
      return rows.map((r) => Object.assign(strip(r), { Value: Number(r.Value) }));
    }
    async writeFacts(modelId, rows) {
      await this._assertWritable(modelId);
      await this._assertUnlocked(modelId, rows);
      await this._assertValid(modelId, rows);
      rows = rows.map((r) => Object.assign({}, r, { ModelId: modelId }));
      await this._action("/Fact/" + NS + "WriteFacts(...)", { Payload: this._payload(rows) });
      return rows.length;
    }
    async deleteFacts(modelId, rows) {
      await this._assertWritable(modelId);
      await this._assertUnlocked(modelId, rows);
      rows = rows.map((r) => Object.assign({}, r, { ModelId: modelId }));
      await this._action("/Fact/" + NS + "DeleteFacts(...)", { Payload: this._payload(rows) });
      return rows.length;
    }
    /** One tab separated line per fact: version, period, measure, dim1..dim5, value. The model comes from ModelId of the rows. */
    _payload(rows) {
      return rows.map((r) => [r.ModelId, r.VersionId, r.Period, r.Measure, r.Dim1 || "", r.Dim2 || "", r.Dim3 || "", r.Dim4 || "", r.Dim5 || "", r.Value].join("\t")).join("\n");
    }

    get capabilities() { return { comments: true, sharing: true }; }

    // ---- versions ---------------------------------------------------------------------------
    _toVersion(e) { return { ModelId: e.ModelId, VersionId: e.VersionId, Name: e.VersionName, Category: e.Category, Locked: !!e.Locked, Owner: e.OwnerId, SourceVersion: e.SourceVersion, Status: e.Status }; }
    async listVersions(modelId) {
      if (modelId) {
        const model = await this.getModel(modelId).catch(() => null);
        if (model && LiveSource.isLive(model)) { return [LiveSource.liveVersion(model)]; }
      }
      const filters = modelId ? [new Filter("ModelId", FilterOperator.EQ, modelId)] : [];
      return (await this._list("/Version", filters)).map((e) => this._toVersion(e));
    }
    /**
     * Changes the version in place with a PATCH. Deleting and re-creating it would fire the DeleteFacts determination of the Version BO and delete
     * its values, which is what locking, unlocking and renaming must never do. A version that does not exist yet is created.
     */
    async saveVersion(v) {
      const key = "/Version(ModelId=" + quote(v.ModelId) + ",VersionId=" + quote(v.VersionId) + ")";
      const fields = { VersionName: v.Name, Category: v.Category, Locked: !!v.Locked, OwnerId: v.Owner || "", SourceVersion: v.SourceVersion || "", Status: v.Status || "P" };
      const exists = (await this._list("/Version", [new Filter("ModelId", FilterOperator.EQ, v.ModelId), new Filter("VersionId", FilterOperator.EQ, v.VersionId)])).length > 0;
      if (exists) { await this._patch(key, fields); } else { await this._post("/Version", Object.assign({ ModelId: v.ModelId, VersionId: v.VersionId }, fields)); }
      return v;
    }
    async createPrivateVersion(modelId, fromVersionId, name) {
      const r = await this._action("/Version/" + NS + "CreatePrivate(...)", { ModelId: modelId, SourceVersion: fromVersionId, VersionName: name || "" });
      return this._toVersion(r);
    }
    publishVersion(modelId, privateId, targetId) {
      return this._action("/Version(ModelId=" + quote(modelId) + ",VersionId=" + quote(privateId) + ")/" + NS + "Publish(...)", { TargetVersion: targetId })
        .then((r) => ({ Published: r && r.Published }));
    }
    revertVersion(modelId, privateId) {
      return this._action("/Version(ModelId=" + quote(modelId) + ",VersionId=" + quote(privateId) + ")/" + NS + "Revert(...)", {});
    }
    deleteVersion(modelId, versionId) { return this._invokeDelete("/Version(ModelId=" + quote(modelId) + ",VersionId=" + quote(versionId) + ")"); }

    // ---- stories ----------------------------------------------------------------------------
    _toStory(e, withWidgets) {
      return {
        Id: e.StoryId, Name: e.StoryName, Description: e.Description, ModelId: e.ModelId, Status: e.Status, Owner: e.OwnerId || "",
        Pages: json(e.PagesJson, [{ Id: 1, Title: "Page 1" }]), Filters: json(e.Filters, {}),
        Widgets: withWidgets ? (e._Widget || []).map((w) => ({
          Id: w.WidgetId, Page: w.PageNo, Type: w.WidgetKind, Title: w.Title, X: w.GridX, Y: w.GridY, W: w.GridW, H: w.GridH,
          Binding: json(w.Binding, {}), Props: json(w.Props, {})
        })) : undefined
      };
    }
    async listStories() { const rows = await this._list("/Story"); this._noteUser(rows); return this._withAccess("STORY", rows.map((e) => this._toStory(e, false))); }
    async getStory(id) {
      const row = await this._one("/Story", ["StoryId", id], { $expand: "_Widget" });
      this._noteUser([row]);
      return (await this._withAccess("STORY", [this._toStory(row, true)]))[0];
    }
    _storyPayload(s) {
      return {
        StoryId: s.Id, StoryName: s.Name, Description: s.Description || "", ModelId: s.ModelId || "", Status: s.Status || "D", PagesJson: str(s.Pages), Filters: str(s.Filters || {}),
        _Widget: (s.Widgets || []).map((w) => ({ StoryId: s.Id, WidgetId: w.Id, PageNo: w.Page, WidgetKind: w.Type, Title: w.Title || "",
          GridX: w.X, GridY: w.Y, GridW: w.W, GridH: w.H, Binding: str(w.Binding || {}), Props: str(w.Props || {}) }))
      };
    }
    async _putStory(s) {
      const old = await this.getStory(s.Id).then((x) => this._storyPayload(x)).catch(() => null);
      const keyPath = "/Story(StoryId=" + quote(s.Id) + ")";
      if (old) { await this._updateDeep(keyPath, this._storyPayload(s), old, [{ prop: "_Widget", path: "/Widget", keys: ["StoryId", "WidgetId"] }], ["StoryId"]); }
      else { await this._post("/Story", this._storyPayload(s)); }
      return this.getStory(s.Id).catch(() => s);
    }
    async deleteStory(id) { await this._invokeDelete("/Story(StoryId=" + quote(id) + ")"); await this._dropFile("STORY", id); }

    // ---- data actions -----------------------------------------------------------------------
    /** A step is its own columns for what every step has and CONFIG (JSON) for what depends on the step type. */
    _toDataAction(e) {
      return {
        Id: e.ActionId, ModelId: e.ModelId, Name: e.ActionName, Description: e.Description, Owner: e.OwnerId || "", Parameters: json(e.Parameters, []),
        Steps: (e._Step || []).map((s) => Object.assign(json(s.Config, {}), { StepNo: s.StepNo, StepType: s.StepType, Name: s.StepName,
          Description: s.Description, Active: s.Active !== false })).sort((a, b) => a.StepNo - b.StepNo)
      };
    }
    async listDataActions() {
      const rows = await this._list("/DataAction", [], { $expand: "_Step" });
      this._noteUser(rows);
      return this._withAccess("DATAACTION", rows.map((e) => this._toDataAction(e)));
    }
    async getDataAction(id) {
      const row = await this._one("/DataAction", ["ActionId", id], { $expand: "_Step" });
      this._noteUser([row]);
      return (await this._withAccess("DATAACTION", [this._toDataAction(row)]))[0];
    }
    _stepRows(a) {
      return (a.Steps || []).map((s) => {
        const config = Object.assign({}, s);
        ["StepNo", "StepType", "Name", "Description", "Active"].forEach((k) => { delete config[k]; });
        return { ActionId: a.Id, StepNo: s.StepNo, StepType: s.StepType, StepName: s.Name || "", Description: s.Description || "", Active: s.Active !== false, Config: str(config) };
      });
    }
    _dataActionPayload(a) {
      return { ActionId: a.Id, ModelId: a.ModelId, ActionName: a.Name, Description: a.Description || "", Parameters: str(a.Parameters || []), _Step: this._stepRows(a) };
    }
    async _putDataAction(a) {
      const old = await this.getDataAction(a.Id).then((x) => this._dataActionPayload(x)).catch(() => null);
      const keyPath = "/DataAction(ActionId=" + quote(a.Id) + ")";
      if (old) { await this._updateDeep(keyPath, this._dataActionPayload(a), old, [{ prop: "_Step", path: "/DataActionStep", keys: ["ActionId", "StepNo"] }], ["ActionId"]); }
      else { await this._post("/DataAction", this._dataActionPayload(a)); }
      return this.getDataAction(a.Id).catch(() => a);
    }
    async deleteDataAction(id) { await this._invokeDelete("/DataAction(ActionId=" + quote(id) + ")"); await this._dropFile("DATAACTION", id); }
    // executing (executeDataAction, previewDataAction, runMultiAction) is inherited: the steps run in the client and the difference is written as facts

    // ---- comments on cells --------------------------------------------------------------------
    _toComment(e) {
      return { Id: e.CommentId, ModelId: e.ModelId, VersionId: e.VersionId, Period: e.Period, Measure: e.Measure, Dims: json(e.DimsJson, {}), Text: e.CommentText, Author: e.CreatedBy, At: e.CreatedAt };
    }
    async listComments(modelId, versionId) {
      const filters = [new Filter("ModelId", FilterOperator.EQ, modelId)];
      if (versionId) { filters.push(new Filter("VersionId", FilterOperator.EQ, versionId)); }
      return (await this._list("/CellComment", filters)).map((e) => this._toComment(e)).sort((a, b) => String(a.At).localeCompare(String(b.At)));
    }
    async saveComment(c) {
      await this._replace("/CellComment", "/CellComment(CommentId=" + quote(c.Id) + ")", { CommentId: c.Id, ModelId: c.ModelId, VersionId: c.VersionId, Period: c.Period || "", Measure: c.Measure,
        DimsJson: str(c.Dims || {}), CommentText: c.Text });
      return c;
    }
    deleteComment(id) { return this._invokeDelete("/CellComment(CommentId=" + quote(id) + ")"); }

    // ---- run history ------------------------------------------------------------------------
    async listRuns(actionId, limit) {
      const filters = actionId ? [new Filter("ActionId", FilterOperator.EQ, actionId)] : [];
      const rows = (await this._list("/ActionRun", filters)).map((e) => ({
        Id: e.RunId, ActionId: e.ActionId, ActionName: e.ActionName, ModelId: e.ModelId, Kind: e.RunKind, Status: e.Status, Changed: e.Changed,
        DurationMs: e.DurationMs, User: e.UserName, At: e.StartedAt, ParamsText: e.ParamsText, Log: String(e.LogText || "").split("\n").filter(Boolean), Steps: json(e.StepsJson, []) }));
      // the history of an action the user may not open is not shown (the server does not filter runs, see docs/sharing-and-security.md)
      const [data, multi] = await Promise.all([this.listDataActions().catch(() => []), this.listMultiActions().catch(() => [])]);
      const known = { DATA: new Set(data.map((a) => a.Id)), MULTI: new Set(multi.map((a) => a.Id)) };
      return rows.filter((r) => (known[r.Kind] || new Set()).has(r.ActionId)).sort((a, b) => String(b.At).localeCompare(String(a.At))).slice(0, limit || 100);
    }
    async _putRun(r) {
      const id = "RUN" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
      await this._post("/ActionRun", { RunId: id, ActionId: r.ActionId, ActionName: r.ActionName || "", ModelId: r.ModelId || "", RunKind: r.Kind,
        Status: r.Status, Changed: r.Changed || 0, DurationMs: r.DurationMs || 0, UserName: "", StartedAt: new Date().toISOString(), ParamsText: String(r.ParamsText || "").slice(0, 255),
        LogText: (r.Log || []).join("\n"), StepsJson: str(r.Steps || []) });
    }

    // ---- multi actions ----------------------------------------------------------------------
    _toMulti(e) {
      return {
        Id: e.ActionId, Name: e.ActionName, Description: e.Description, Owner: e.OwnerId || "", Parameters: json(e.Parameters, []),
        Steps: (e._Step || []).map((s) => Object.assign(json(s.Config, {}), { StepNo: s.StepNo, StepType: s.StepType, Name: s.StepName,
          Description: s.Description, Active: s.Active !== false })).sort((a, b) => a.StepNo - b.StepNo)
      };
    }
    async listMultiActions() {
      const rows = await this._list("/MultiAction", [], { $expand: "_Step" });
      this._noteUser(rows);
      return this._withAccess("MULTIACTION", rows.map((e) => this._toMulti(e)));
    }
    async getMultiAction(id) {
      const row = await this._one("/MultiAction", ["ActionId", id], { $expand: "_Step" });
      this._noteUser([row]);
      return (await this._withAccess("MULTIACTION", [this._toMulti(row)]))[0];
    }
    _multiPayload(a) {
      return { ActionId: a.Id, ActionName: a.Name, Description: a.Description || "", Parameters: str(a.Parameters || []), _Step: this._stepRows(a) };
    }
    async _putMultiAction(a) {
      const old = await this.getMultiAction(a.Id).then((x) => this._multiPayload(x)).catch(() => null);
      const keyPath = "/MultiAction(ActionId=" + quote(a.Id) + ")";
      if (old) { await this._updateDeep(keyPath, this._multiPayload(a), old, [{ prop: "_Step", path: "/MultiActionStep", keys: ["ActionId", "StepNo"] }], ["ActionId"]); }
      else { await this._post("/MultiAction", this._multiPayload(a)); }
      return this.getMultiAction(a.Id).catch(() => a);
    }
    async deleteMultiAction(id) { await this._invokeDelete("/MultiAction(ActionId=" + quote(id) + ")"); await this._dropFile("MULTIACTION", id); }

    // ---- files and calendar -----------------------------------------------------------------
    _toFile(e) { return { Id: e.FileId, ParentId: e.ParentId, Type: e.FileKind, ObjectId: e.ObjectId, Name: e.FileName, Description: e.Description,
      Owner: e.OwnerId, Favourite: !!e.Favourite, Shared: !!e.Shared, ChangedAt: e.LastChangedAt }; }
    async listFiles() { return (await this._list("/File")).map((e) => this._toFile(e)); }
    async saveFile(f) {
      await this._replace("/File", "/File(FileId=" + quote(f.Id) + ")", { FileId: f.Id, ParentId: f.ParentId || "", FileKind: f.Type, ObjectId: f.ObjectId || "",
        FileName: f.Name, Description: f.Description || "", OwnerId: f.Owner || "", Favourite: !!f.Favourite, Shared: !!f.Shared });
      return f;
    }
    deleteFile(id) { return this._invokeDelete("/File(FileId=" + quote(id) + ")"); }
    /** An event of the calendar. The older columns (Assignee, DueDate, Notes) stay in step with the new ones (first assignee, end date, description). */
    _toTask(e) {
      return { Id: e.TaskId, Type: e.EventType || "GENERAL", ParentId: e.ParentId || "", Title: e.Title, ModelId: e.ModelId, VersionId: e.VersionId, Assignee: e.Assignee, DueDate: e.DueDate,
        StartDate: e.StartDate || e.DueDate || null, EndDate: e.EndDate || e.DueDate || null, Progress: e.Progress || 0, Status: e.Status, Approver: e.Approver, Notes: e.Notes,
        People: json(e.PeopleJson, {}), Files: json(e.FilesJson, []), Config: json(e.ConfigJson, {}), Owner: e.OwnerId || "" };
    }
    async listTasks() { const rows = await this._list("/CalendarTask"); this._noteUser(rows); return this._withAccess("CALEVENT", rows.map((e) => this._toTask(e))); }
    async getTask(id) { const row = await this._one("/CalendarTask", ["TaskId", id]); this._noteUser([row]); return (await this._withAccess("CALEVENT", [this._toTask(row)]))[0]; }
    _taskPayload(t) {
      return { TaskId: t.Id, EventType: t.Type || "GENERAL", ParentId: t.ParentId || "", Title: String(t.Title || "").slice(0, 120), ModelId: t.ModelId || "", VersionId: t.VersionId || "",
        Assignee: t.Assignee || "", DueDate: t.EndDate || t.DueDate || null, StartDate: t.StartDate || null, EndDate: t.EndDate || t.DueDate || null, Progress: Math.round(Number(t.Progress) || 0),
        Status: t.Status || "OPEN", Approver: t.Approver || "", Notes: String(t.Notes || t.Description || "").slice(0, 255),
        PeopleJson: str(t.People || {}), FilesJson: str(t.Files || []), ConfigJson: str(t.Config || {}) };
    }
    /** An event that exists is changed in place (so its owner and its shares stay); a new one is created and the server makes the user its owner. */
    async saveTask(t) {
      const exists = (await this._list("/CalendarTask", [new Filter("TaskId", FilterOperator.EQ, t.Id)])).length > 0;
      const payload = this._taskPayload(t);
      if (exists) {
        const own = Object.assign({}, payload); delete own.TaskId;
        await this._request("PATCH", "/CalendarTask(TaskId=" + quote(t.Id) + ")", own, { "If-Match": "*" });
      } else { await this._post("/CalendarTask", payload); }
      return this.getTask(t.Id).catch(() => t);
    }
    deleteTask(id) { return this._invokeDelete("/CalendarTask(TaskId=" + quote(id) + ")"); }
  }

  return ODataV4Provider;
});
