@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Model Measure'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define view entity ZC_SAC_MEASURE
  as projection on ZR_SAC_MEASURE
{
  key ModelId,
  key MeasureId,
  Label,
  Unit,
  Aggregation,
  DataType,
  UnitType,
  Scale,
  Decimals,
  ExceptionAgg,
  ExceptionDims,
  LocalLastChangedAt,
  _Model : redirected to parent ZC_SAC_MODEL
}
