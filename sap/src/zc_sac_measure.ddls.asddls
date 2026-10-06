@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Model Measure'
@AccessControl.authorizationCheck: #CHECK
define view entity ZC_SAC_MEASURE
  as projection on ZR_SAC_MEASURE
{
  key ModelId,
  key MeasureId,
  MeasureLabel,
  Unit,
  Aggregation,
  DataType,
  UnitType,
  Scale,
  Decimals,
  ExceptionAgg,
  ExceptionDims,
  ChildChangedAt,
  _Model : redirected to parent ZC_SAC_MODEL
}
