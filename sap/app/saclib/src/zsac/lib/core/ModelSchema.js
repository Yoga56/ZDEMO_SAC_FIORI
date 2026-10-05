/**
 * Model definition helpers (pure): defaults for measure properties, normalisation of models coming from any
 * provider, and the validation the Modeller runs before saving.
 *
 * model   = { ModelId, Name, Description, Currency, PeriodFrom, PeriodTo, PlanningEnabled, DataLocking, DataAudit, DataSource,
 *             Dimensions: [{ DimId, Label, Slot, Members: [{Id, Text}] }],
 *             Measures:   [{ MeasureId, Label, DataType, Aggregation, ExceptionAggregation, ExceptionDims, UnitType, Unit, Scale, Decimals }] }
 */
sap.ui.define([], function () {
  "use strict";

  const AGGREGATIONS = ["SUM", "AVG", "MIN", "MAX", "COUNT"];
  const DATA_TYPES = ["Decimal", "Integer"];
  const UNIT_TYPES = ["None", "Currency", "Unit"];
  const SCALES = [[1, "None"], [1000, "Thousand (k)"], [1000000, "Million (M)"]];
  const ID = /^[A-Z][A-Z0-9_]*$/;
  const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
  const BUILTIN = ["VERSION", "PERIOD", "MEASURE"];

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

  /** Fills every missing property so engines and widgets never test for undefined. */
  function normalize(model) {
    return Object.assign({ Description: "", Currency: "", PlanningEnabled: true, DataLocking: false, DataAudit: false, DataSource: "" }, model, {
      Dimensions: (model.Dimensions || []).map((d) => Object.assign({ Label: d.DimId, Members: [] }, d)),
      Measures: (model.Measures || []).map(normalizeMeasure)
    });
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

  return { AGGREGATIONS, DATA_TYPES, UNIT_TYPES, SCALES, BUILTIN, normalize, normalizeMeasure, newModel, validate, unitLabel, scaleSuffix };
});
