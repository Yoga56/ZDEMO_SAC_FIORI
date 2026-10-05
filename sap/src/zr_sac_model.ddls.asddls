@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'Planning Model'
define root view entity ZR_SAC_MODEL
  as select from zsac_model
  composition [0..*] of ZR_SAC_DIM as _Dimension
  composition [0..*] of ZR_SAC_MEASURE as _Measure
{
  key model_id as ModelId,
  model_name as ModelName,
  description as Description,
  currency as Currency,
  period_from as PeriodFrom,
  period_to as PeriodTo,
  @Semantics.user.createdBy: true,
  created_by as CreatedBy,
  @Semantics.systemDateTime.createdAt: true,
  created_at as CreatedAt,
  @Semantics.user.lastChangedBy: true,
  last_changed_by as LastChangedBy,
  @Semantics.systemDateTime.lastChangedAt: true,
  last_changed_at as LastChangedAt,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true,
  local_last_changed_at as LocalLastChangedAt,
  _Dimension,
  _Measure
}
