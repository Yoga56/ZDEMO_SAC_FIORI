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
  "../core/ModelSchema",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator"
], function (DataProvider, ModelSchema, Filter, FilterOperator) {
  "use strict";

  const NS = "com.sap.gateway.srvd.zui_sac_o4.v0001.";
  const PAGE = 10000;
  const json = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; } };
  const str = (o) => JSON.stringify(o === undefined ? null : o);
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

    /** Create or update by key: delete-and-create keeps the mapping simple and cascades children (compositions). */
    async _replace(path, keyPath, entity) {
      try { await this._invokeDelete(keyPath); } catch (e) { /* not there yet */ }
      const binding = this._m.bindList(path);
      const context = binding.create(entity, true);
      await context.created();
      return context.getObject();
    }

    /** Changes fields of an existing row with a PATCH (no delete, so determinations and dependants of a delete do not fire). Rejects when the row is missing. */
    async _patch(keyPath, values) {
      const context = this._m.bindContext(keyPath).getBoundContext();
      await context.requestObject();
      for (const k of Object.keys(values)) { await context.setProperty(k, values[k]); }
    }

    async _invokeDelete(keyPath) {
      const binding = this._m.bindContext(keyPath);
      const context = binding.getBoundContext();
      await context.requestObject();
      await context.delete();
    }

    async _action(path, params) {
      const op = this._m.bindContext(path);
      Object.keys(params || {}).forEach((k) => op.setParameter(k, params[k]));
      await op.execute();
      return op.getBoundContext().getObject();
    }

    // ---- models -----------------------------------------------------------------------------
    _toModel(e) {
      return ModelSchema.normalize({
        ModelId: e.ModelId, Name: e.ModelName, Description: e.Description, Currency: e.Currency,
        PeriodFrom: e.PeriodFrom, PeriodTo: e.PeriodTo, PlanningEnabled: !!e.PlanningEnabled, DataLocking: !!e.DataLocking,
        DataAudit: !!e.DataAudit, DataSource: e.DataSource,
        Dimensions: (e._Dimension || []).map((d) => ({ DimId: d.DimId, Label: d.Label, Slot: d.Slot, Members: json(d.Members, []), Type: d.DimType || "GENERIC",
          Attributes: json(d.Attributes, undefined), Hierarchies: json(d.Hierarchies, []) }))
          .sort((a, b) => a.Slot - b.Slot),
        Measures: (e._Measure || []).map((m) => ({ MeasureId: m.MeasureId, Label: m.Label, Unit: m.Unit, Aggregation: m.Aggregation || "SUM",
          DataType: m.DataType || "Decimal", UnitType: m.UnitType || "None", Scale: m.Scale, Decimals: m.Decimals,
          ExceptionAggregation: m.ExceptionAgg || "", ExceptionDims: String(m.ExceptionDims || "").split(",").filter(Boolean) }))
      });
    }
    async listModels() {
      return (await this._list("/Model", [], { $expand: "_Dimension,_Measure" })).map((e) => this._toModel(e));
    }
    async getModel(id) { return this._toModel(await this._one("/Model", ["ModelId", id], { $expand: "_Dimension,_Measure" })); }
    async _putModel(m) {
      const key = "/Model(ModelId=" + quote(m.ModelId) + ")";
      await this._replace("/Model", key, {
        ModelId: m.ModelId, ModelName: m.Name, Description: m.Description || "", Currency: m.Currency || "",
        PeriodFrom: m.PeriodFrom || "", PeriodTo: m.PeriodTo || "", PlanningEnabled: m.PlanningEnabled !== false, DataLocking: !!m.DataLocking,
        DataAudit: !!m.DataAudit, DataSource: m.DataSource || ""
      });
      for (const d of m.Dimensions || []) {
        await this._m.bindList(key + "/_Dimension").create({ ModelId: m.ModelId, DimId: d.DimId, Label: d.Label, Slot: d.Slot, Members: str(d.Members || []),
          DimType: d.Type || "GENERIC", Attributes: str(d.Attributes || []), Hierarchies: str(d.Hierarchies || []) }, true).created();
      }
      for (const x of m.Measures || []) {
        await this._m.bindList(key + "/_Measure").create({ ModelId: m.ModelId, MeasureId: x.MeasureId, Label: x.Label, Unit: x.Unit || "", Aggregation: x.Aggregation || "SUM",
          DataType: x.DataType || "Decimal", UnitType: x.UnitType || "None", Scale: x.Scale || 1, Decimals: x.Decimals || 0,
          ExceptionAgg: x.ExceptionAggregation || "", ExceptionDims: (x.ExceptionDims || []).join(",") }, true).created();
      }
      return m;
    }
    deleteModel(id) { return this._invokeDelete("/Model(ModelId=" + quote(id) + ")"); }

    // ---- facts ------------------------------------------------------------------------------
    async readFacts(modelId, filters) {
      const model = await this.getModel(modelId);
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
      rows = rows.map((r) => Object.assign({}, r, { ModelId: modelId }));
      await this._action("/Fact/" + NS + "WriteFacts(...)", { Payload: this._payload(rows) });
      return rows.length;
    }
    async deleteFacts(modelId, rows) {
      rows = rows.map((r) => Object.assign({}, r, { ModelId: modelId }));
      await this._action("/Fact/" + NS + "DeleteFacts(...)", { Payload: this._payload(rows) });
      return rows.length;
    }
    /** One tab separated line per fact: version, period, measure, dim1..dim5, value. The model comes from ModelId of the rows. */
    _payload(rows) {
      return rows.map((r) => [r.ModelId, r.VersionId, r.Period, r.Measure, r.Dim1 || "", r.Dim2 || "", r.Dim3 || "", r.Dim4 || "", r.Dim5 || "", r.Value].join("\t")).join("\n");
    }

    get capabilities() { return { comments: true }; }

    // ---- versions ---------------------------------------------------------------------------
    _toVersion(e) { return { ModelId: e.ModelId, VersionId: e.VersionId, Name: e.VersionName, Category: e.Category, Locked: !!e.Locked, Owner: e.OwnerId, SourceVersion: e.SourceVersion, Status: e.Status }; }
    async listVersions(modelId) {
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
      let missing = false;
      try { await this._patch(key, fields); } catch (e) {
        if (!(e && (e.status === 404 || /not found|404/i.test(e.message || "")))) { throw e; }
        missing = true;
      }
      if (missing) {
        await this._m.bindList("/Version").create(Object.assign({ ModelId: v.ModelId, VersionId: v.VersionId }, fields), true).created();
      }
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
        Id: e.StoryId, Name: e.StoryName, Description: e.Description, ModelId: e.ModelId, Status: e.Status,
        Pages: json(e.Pages, [{ Id: 1, Title: "Page 1" }]), Filters: json(e.Filters, {}),
        Widgets: withWidgets ? (e._Widget || []).map((w) => ({
          Id: w.WidgetId, Page: w.PageNo, Type: w.WidgetType, Title: w.Title, X: w.GridX, Y: w.GridY, W: w.GridW, H: w.GridH,
          Binding: json(w.Binding, {}), Props: json(w.Props, {})
        })) : undefined
      };
    }
    async listStories() { return (await this._list("/Story")).map((e) => this._toStory(e, false)); }
    async getStory(id) { return this._toStory(await this._one("/Story", ["StoryId", id], { $expand: "_Widget" }), true); }
    async _putStory(s) {
      const key = "/Story(StoryId=" + quote(s.Id) + ")";
      await this._replace("/Story", key, { StoryId: s.Id, StoryName: s.Name, Description: s.Description || "", ModelId: s.ModelId || "",
        Status: s.Status || "D", Pages: str(s.Pages), Filters: str(s.Filters || {}) });
      for (const w of s.Widgets || []) {
        await this._m.bindList(key + "/_Widget").create({ StoryId: s.Id, WidgetId: w.Id, PageNo: w.Page, WidgetType: w.Type, Title: w.Title || "",
          GridX: w.X, GridY: w.Y, GridW: w.W, GridH: w.H, Binding: str(w.Binding || {}), Props: str(w.Props || {}) }, true).created();
      }
      return s;
    }
    deleteStory(id) { return this._invokeDelete("/Story(StoryId=" + quote(id) + ")"); }

    // ---- data actions -----------------------------------------------------------------------
    /** A step is its own columns for what every step has and CONFIG (JSON) for what depends on the step type. */
    _toDataAction(e) {
      return {
        Id: e.ActionId, ModelId: e.ModelId, Name: e.ActionName, Description: e.Description, Parameters: json(e.Parameters, []),
        Steps: (e._Step || []).map((s) => Object.assign(json(s.Config, {}), { StepNo: s.StepNo, StepType: s.StepType, Name: s.StepName,
          Description: s.Description, Active: s.Active !== false })).sort((a, b) => a.StepNo - b.StepNo)
      };
    }
    async listDataActions() { return (await this._list("/DataAction", [], { $expand: "_Step" })).map((e) => this._toDataAction(e)); }
    async getDataAction(id) { return this._toDataAction(await this._one("/DataAction", ["ActionId", id], { $expand: "_Step" })); }
    async _putDataAction(a) {
      const key = "/DataAction(ActionId=" + quote(a.Id) + ")";
      await this._replace("/DataAction", key, { ActionId: a.Id, ModelId: a.ModelId, ActionName: a.Name, Description: a.Description || "", Parameters: str(a.Parameters || []) });
      for (const s of a.Steps || []) {
        const config = Object.assign({}, s);
        ["StepNo", "StepType", "Name", "Description", "Active"].forEach((k) => { delete config[k]; });
        await this._m.bindList(key + "/_Step").create({ ActionId: a.Id, StepNo: s.StepNo, StepType: s.StepType, StepName: s.Name || "", Description: s.Description || "",
          Active: s.Active !== false, Config: str(config) }, true).created();
      }
      return a;
    }
    deleteDataAction(id) { return this._invokeDelete("/DataAction(ActionId=" + quote(id) + ")"); }
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
      return rows.sort((a, b) => String(b.At).localeCompare(String(a.At))).slice(0, limit || 100);
    }
    async _putRun(r) {
      const id = "RUN" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
      await this._m.bindList("/ActionRun").create({ RunId: id, ActionId: r.ActionId, ActionName: r.ActionName || "", ModelId: r.ModelId || "", RunKind: r.Kind,
        Status: r.Status, Changed: r.Changed || 0, DurationMs: r.DurationMs || 0, UserName: "", StartedAt: new Date().toISOString(), ParamsText: String(r.ParamsText || "").slice(0, 255),
        LogText: (r.Log || []).join("\n"), StepsJson: str(r.Steps || []) }, true).created();
    }

    // ---- multi actions ----------------------------------------------------------------------
    _toMulti(e) {
      return {
        Id: e.ActionId, Name: e.ActionName, Description: e.Description, Parameters: json(e.Parameters, []),
        Steps: (e._Step || []).map((s) => Object.assign(json(s.Config, {}), { StepNo: s.StepNo, StepType: s.StepType, Name: s.StepName,
          Description: s.Description, Active: s.Active !== false })).sort((a, b) => a.StepNo - b.StepNo)
      };
    }
    async listMultiActions() { return (await this._list("/MultiAction", [], { $expand: "_Step" })).map((e) => this._toMulti(e)); }
    async getMultiAction(id) { return this._toMulti(await this._one("/MultiAction", ["ActionId", id], { $expand: "_Step" })); }
    async _putMultiAction(a) {
      const key = "/MultiAction(ActionId=" + quote(a.Id) + ")";
      await this._replace("/MultiAction", key, { ActionId: a.Id, ActionName: a.Name, Description: a.Description || "", Parameters: str(a.Parameters || []) });
      for (const s of a.Steps || []) {
        const config = Object.assign({}, s);
        ["StepNo", "StepType", "Name", "Description", "Active"].forEach((k) => { delete config[k]; });
        await this._m.bindList(key + "/_Step").create({ ActionId: a.Id, StepNo: s.StepNo, StepType: s.StepType, StepName: s.Name || "", Description: s.Description || "",
          Active: s.Active !== false, Config: str(config) }, true).created();
      }
      return a;
    }
    deleteMultiAction(id) { return this._invokeDelete("/MultiAction(ActionId=" + quote(id) + ")"); }

    // ---- files and calendar -----------------------------------------------------------------
    _toFile(e) { return { Id: e.FileId, ParentId: e.ParentId, Type: e.FileType, ObjectId: e.ObjectId, Name: e.FileName, Description: e.Description,
      Owner: e.OwnerId, Favourite: !!e.Favourite, Shared: !!e.Shared, ChangedAt: e.LastChangedAt }; }
    async listFiles() { return (await this._list("/File")).map((e) => this._toFile(e)); }
    async saveFile(f) {
      await this._replace("/File", "/File(FileId=" + quote(f.Id) + ")", { FileId: f.Id, ParentId: f.ParentId || "", FileType: f.Type, ObjectId: f.ObjectId || "",
        FileName: f.Name, Description: f.Description || "", OwnerId: f.Owner || "", Favourite: !!f.Favourite, Shared: !!f.Shared });
      return f;
    }
    deleteFile(id) { return this._invokeDelete("/File(FileId=" + quote(id) + ")"); }
    _toTask(e) { return { Id: e.TaskId, Title: e.Title, ModelId: e.ModelId, VersionId: e.VersionId, Assignee: e.Assignee, DueDate: e.DueDate, Status: e.Status, Approver: e.Approver, Notes: e.Notes }; }
    async listTasks() { return (await this._list("/CalendarTask")).map((e) => this._toTask(e)); }
    async saveTask(t) {
      await this._replace("/CalendarTask", "/CalendarTask(TaskId=" + quote(t.Id) + ")", { TaskId: t.Id, Title: t.Title, ModelId: t.ModelId || "", VersionId: t.VersionId || "",
        Assignee: t.Assignee || "", DueDate: t.DueDate || null, Status: t.Status || "OPEN", Approver: t.Approver || "", Notes: t.Notes || "" });
      return t;
    }
    deleteTask(id) { return this._invokeDelete("/CalendarTask(TaskId=" + quote(id) + ")"); }
  }

  return ODataV4Provider;
});
