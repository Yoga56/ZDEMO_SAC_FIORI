@AccessControl.authorizationCheck: #CHECK
@Metadata.allowExtensions: true
@EndUserText.label: 'Planning Model'
define root view entity ZR_SAC_MODEL
  as select from zsac_model
  composition [0..*] of ZR_SAC_DIM as _Dimension
  composition [0..*] of ZR_SAC_MEASURE as _Measure
  association [0..1] to ZR_SAC_SHARE as _ShareMe  on _ShareMe.ObjectKind = 'MODEL' and _ShareMe.ObjectId = $projection.ModelId and _ShareMe.Principal = $session.user
  association [0..1] to ZR_SAC_SHARE as _ShareAll on _ShareAll.ObjectKind = 'MODEL' and _ShareAll.ObjectId = $projection.ModelId and _ShareAll.Principal = '*'
{
  key model_id as ModelId,
  model_name as ModelName,
  description as Description,
  currency as Currency,
  period_from as PeriodFrom,
  period_to as PeriodTo,
  planning_enabled as PlanningEnabled,
  data_locking as DataLocking,
  data_audit as DataAudit,
  data_source as DataSource,
  source_json as SourceJson,
  owner_id as OwnerId,
  lock_default as LockDefault,
  lock_json as LockJson,
  valid_json as ValidJson,
  calc_json as CalcJson,
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
  _Dimension,
  _Measure,
  _ShareMe,
  _ShareAll
}
