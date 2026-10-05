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
  data_action_id as DataActionId,
  model_id as ModelId,
  source_version as SourceVersion,
  target_version as TargetVersion,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true,
  local_last_changed_at as LocalLastChangedAt,
  _MultiAction
}
