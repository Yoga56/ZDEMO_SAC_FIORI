@AccessControl.authorizationCheck: #CHECK
@Metadata.allowExtensions: true
@EndUserText.label: 'Data Action'
define root view entity ZR_SAC_DATAACT
  as select from zsac_dataact
  composition [0..*] of ZR_SAC_DASTEP as _Step
  association [0..1] to ZR_SAC_SHARE as _ShareMe  on _ShareMe.ObjectKind = 'DATAACTION' and _ShareMe.ObjectId = $projection.ActionId and _ShareMe.Principal = $session.user
  association [0..1] to ZR_SAC_SHARE as _ShareAll on _ShareAll.ObjectKind = 'DATAACTION' and _ShareAll.ObjectId = $projection.ActionId and _ShareAll.Principal = '*'
{
  key action_id as ActionId,
  model_id as ModelId,
  action_name as ActionName,
  description as Description,
  parameters as Parameters,
  owner_id as OwnerId,
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
  $session.user as CurrentUser,
  _Step,
  _ShareMe,
  _ShareAll
}
