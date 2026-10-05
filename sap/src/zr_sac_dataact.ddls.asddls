@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'Data Action'
define root view entity ZR_SAC_DATAACT
  as select from zsac_dataact
  composition [0..*] of ZR_SAC_DASTEP as _Step
{
  key action_id as ActionId,
  model_id as ModelId,
  action_name as ActionName,
  description as Description,
  parameters as Parameters,
  @Semantics.user.createdBy: true
  created_by as CreatedBy,
  @Semantics.systemDateTime.createdAt: true
  created_at as CreatedAt,
  @Semantics.user.lastChangedBy: true
  last_changed_by as LastChangedBy,
  @Semantics.systemDateTime.lastChangedAt: true
  last_changed_at as LastChangedAt,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true
  local_last_changed_at as LocalLastChangedAt,
  _Step
}
