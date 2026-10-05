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
  src_version as SrcVersion,
  tgt_version as TgtVersion,
  filter_text as FilterText,
  factor as Factor,
  target_dim as TargetDim,
  target_members as TargetMembers,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true,
  local_last_changed_at as LocalLastChangedAt,
  _DataAction
}
