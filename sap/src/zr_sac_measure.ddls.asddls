@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'Model Measure'
define view entity ZR_SAC_MEASURE
  as select from zsac_measure
  association to parent ZR_SAC_MODEL as _Model on $projection.ModelId = _Model.ModelId
{
  key model_id as ModelId,
  key measure_id as MeasureId,
  label as Label,
  unit as Unit,
  aggregation as Aggregation,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true,
  local_last_changed_at as LocalLastChangedAt,
  _Model
}
