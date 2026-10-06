/**
 * Model definition helpers (pure): defaults for measure properties, normalisation of models coming from any
 * provider, and the validation the Modeller runs before saving.
 *
 * model   = { ModelId, Name, Description, Currency, PeriodFrom, PeriodTo, PlanningEnabled, DataLocking, LockDefault, LockRegions, DataAudit, DataSource,
 *             Dimensions: [{ DimId, Label, Slot, Type, Attributes: [{Id, Label}], Members: [{Id, Text, Props}],
 *                            Hierarchies: [{Id, Label, Parents: {childId: parentId}}] }],
 *             Measures:   [{ MeasureId, Label, DataType, Aggregation, ExceptionAggregation, ExceptionDims, UnitType, Unit, Scale, Decimals }],
 *             Source:     null | { Type: "CDS", Mode: "LIVE" | "IMPORT", Service, Entity, Version, PeriodField, PeriodFormat, Dims, Texts, Measures, MaxRows } }
 * A model with a LIVE source reads its data from the source on demand: it is read only, so planning is switched off (see provider/LiveSource).
 */
sap.ui.define(["./HierarchyEngine", "../provider/LiveSource"], function (HierarchyEngine, LiveSource) {
  "use strict";

  const AGGREGATIONS = ["SUM", "AVG", "MIN", "MAX", "COUNT"];
  const DATA_TYPES = ["Decimal", "Integer"];
  const UNIT_TYPES = ["None", "Currency", "Unit"];
  const SCALES = [[1, "None"], [1000, "Thousand (k)"], [1000000, "Million (M)"]];
  const ID = /^[A-Z][A-Z0-9_]*$/;
  const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
  const BUILTIN = ["VERSION", "PERIOD", "MEASURE"];
  /** Dimension types: they start with a set of member attributes (master data columns) and can be changed freely. */
  const DIM_TYPES = {
    GENERIC: { label: "Generic", attributes: [] },
    ORGANIZATION: { label: "Organization", attributes: [{ Id: "OWNER", Label: "Owner" }, { Id: "CURRENCY", Label: "Currency" }] },
    ACCOUNT: { label: "Account", attributes: [{ Id: "ACCOUNT_TYPE", Label: "Account type" }, { Id: "UNIT", Label: "Unit" }] }
  };
  const MEMBER_ID = /^[^\n|]+$/;

  function normalizeMeasure(m) {
    return Object.assign({
      Label: m.MeasureId, DataType: "Decimal", Aggregation: "SUM", ExceptionAggregation: "", ExceptionDims: [],
      UnitType: m.Unit ? "Currency" : "None", Unit: "", Scale: 1, Decimals: 0
    }, m, {
      ExceptionDims: Array.isArray(m.ExceptionDims) ? m.ExceptionDims : [],
      Scale: Number(m.Scale) || 1,
      Decimals: Number.isFinite(Number(m.Decimals)) ? Number(m.Decimals) : 0
    });
  }

  function normalizeDimension(d) {
    const type = DIM_TYPES[d.Type] ? d.Type : "GENERIC";
    return Object.assign({ Label: d.DimId }, d, {
      Type: type,
      Attributes: Array.isArray(d.Attributes) ? d.Attributes : DIM_TYPES[type].attributes.map((a) => Object.assign({}, a)),
      Hierarchies: Array.isArray(d.Hierarchies) ? d.Hierarchies : [],
      Members: (d.Members || []).map((m) => (typeof m === "string" ? { Id: m, Text: m, Props: {} } : Object.assign({ Text: m.Id, Props: {} }, m)))
    });
  }

  /** Fills every missing property so engines and widgets never test for undefined. */
  function normalize(model) {
    const source = model.Source ? LiveSource.defaults(model.Source) : null;
    const live = !!source && source.Mode === "LIVE";
    return Object.assign({ Description: "", Currency: "", PlanningEnabled: true, DataLocking: false, LockDefault: "OPEN", DataAudit: false, DataSource: "" }, model, {
      LockRegions: Array.isArray(model.LockRegions) ? model.LockRegions : [],
      Dimensions: (model.Dimensions || []).map(normalizeDimension),
      Measures: (model.Measures || []).map(normalizeMeasure),
      Source: source
    }, live ? { PlanningEnabled: false, DataLocking: false, DataAudit: false } : {});
  }

  function newModel() {
    return normalize({
      ModelId: "", Name: "", Currency: "USD", PeriodFrom: "2026-01", PeriodTo: "2026-12", PlanningEnabled: true,
      Dimensions: [{ DimId: "REGION", Label: "Region", Slot: 1, Members: [{ Id: "EMEA", Text: "EMEA" }, { Id: "APAC", Text: "APAC" }, { Id: "AMER", Text: "AMER" }] }],
      Measures: [{ MeasureId: "AMOUNT", Label: "Amount", UnitType: "Currency", Unit: "USD" }]
    });
  }

  /** @returns {string[]} what is wrong, empty when the model can be saved */
  function validate(model) {
    const p = [];
    if (!ID.test(model.ModelId || "")) { p.push("Model ID: capital letters, digits and underscore, starting with a letter"); }
    if (!(model.Name || "").trim()) { p.push("Name is required"); }
    if (!PERIOD.test(model.PeriodFrom || "") || !PERIOD.test(model.PeriodTo || "") || model.PeriodFrom > model.PeriodTo) {
      p.push("Periods must look like 2026-01 and start before they end");
    }
    const dims = model.Dimensions || [];
    const measures = model.Measures || [];
    if (!dims.length) { p.push("At least one dimension"); }
    if (dims.length > 5) { p.push("At most five dimensions"); }
    if (!measures.length) { p.push("At least one measure"); }
    if (dims.concat(measures).some((x) => !ID.test(x.DimId || x.MeasureId || ""))) { p.push("Dimension and measure IDs: capital letters, digits and underscore"); }
    if (new Set(dims.map((d) => d.DimId)).size !== dims.length || dims.some((d) => BUILTIN.indexOf(d.DimId) >= 0)) {
      p.push("Dimension IDs must be unique and not VERSION, PERIOD or MEASURE");
    }
    if (new Set(measures.map((x) => x.MeasureId)).size !== measures.length) { p.push("Measure IDs must be unique"); }
    dims.forEach((d) => {
      if (d.Type && !DIM_TYPES[d.Type]) { p.push("Dimension " + d.DimId + ": unknown type " + d.Type); }
      const attrs = d.Attributes || [];
      if (attrs.some((a) => !ID.test(a.Id || "")) || new Set(attrs.map((a) => a.Id)).size !== attrs.length) {
        p.push("Dimension " + d.DimId + ": attribute ids are capital letters, digits and underscore, and unique");
      }
      const ids = (d.Members || []).map((m) => m.Id);
      if (ids.some((x) => !x || !MEMBER_ID.test(x))) { p.push("Dimension " + d.DimId + ": every member needs an id (no | or line break)"); }
      if (new Set(ids).size !== ids.length) { p.push("Dimension " + d.DimId + ": member ids must be unique"); }
      HierarchyEngine.validate(d).forEach((x) => p.push(x));
    });
    LiveSource.validate(model).forEach((x) => p.push(x));
    const known = dims.map((d) => d.DimId).concat(["PERIOD", "VERSION"]);
    measures.forEach((x) => {
      if (AGGREGATIONS.indexOf(x.Aggregation) < 0) { p.push("Measure " + x.MeasureId + ": unknown aggregation " + x.Aggregation); }
      if (x.ExceptionAggregation && AGGREGATIONS.indexOf(x.ExceptionAggregation) < 0) { p.push("Measure " + x.MeasureId + ": unknown exception aggregation"); }
      if (x.ExceptionAggregation && !(x.ExceptionDims || []).length) { p.push("Measure " + x.MeasureId + ": choose the exception aggregation dimensions"); }
      (x.ExceptionDims || []).forEach((d) => { if (known.indexOf(d) < 0) { p.push("Measure " + x.MeasureId + ": unknown dimension " + d); } });
      if (!(x.Decimals >= 0 && x.Decimals <= 6)) { p.push("Measure " + x.MeasureId + ": decimal places 0 to 6"); }
    });
    return p;
  }

  function scaleSuffix(scale) { return scale >= 1000000 ? "M" : scale >= 1000 ? "k" : ""; }

  /** "USD k": the unit with the scale prefix, for headers and KPI tiles. */
  function unitLabel(measure) {
    if (!measure) { return ""; }
    return [measure.UnitType === "None" ? "" : measure.Unit || "", scaleSuffix(measure.Scale)].filter(Boolean).join(" ");
  }

  return { AGGREGATIONS, DATA_TYPES, UNIT_TYPES, SCALES, BUILTIN, DIM_TYPES, normalize, normalizeDimension, normalizeMeasure, newModel, validate, unitLabel, scaleSuffix };
});
