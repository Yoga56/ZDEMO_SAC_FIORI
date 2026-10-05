@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'Multi Action Step'
define view entity ZR_SAC_MASTEP
  as select from zsac_mastep
  association to parent ZR_SAC_MULTIACT as _MultiAction on $projection.ActionId = _MultiAction.ActionId
{
  key action_id as ActionId,
  key step_no as StepNo,
  step_type as StepType,
  step_name as StepName,
  description as Description,
  active as Active,
  config as Config,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true,
  local_last_changed_at as LocalLastChangedAt,
  _MultiAction
}
