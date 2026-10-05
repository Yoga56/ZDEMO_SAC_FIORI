@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'Data Action Step'
define view entity ZR_SAC_DASTEP
  as select from zsac_dastep
  association to parent ZR_SAC_DATAACT as _DataAction on $projection.ActionId = _DataAction.ActionId
{
  key action_id as ActionId,
  key step_no as StepNo,
  step_type as StepType,
  step_name as StepName,
  description as Description,
  active as Active,
  config as Config,
  local_last_changed_at as ChildChangedAt,
  _DataAction
}
