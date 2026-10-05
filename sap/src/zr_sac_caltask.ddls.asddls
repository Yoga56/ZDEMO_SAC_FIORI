@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'Calendar Task'
define root view entity ZR_SAC_CALTASK
  as select from zsac_caltask
{
  key task_id as TaskId,
  title as Title,
  model_id as ModelId,
  version_id as VersionId,
  assignee as Assignee,
  due_date as DueDate,
  status as Status,
  approver as Approver,
  notes as Notes,
  @Semantics.user.createdBy: true
  created_by as CreatedBy,
  @Semantics.systemDateTime.createdAt: true
  created_at as CreatedAt,
  @Semantics.user.lastChangedBy: true
  last_changed_by as LastChangedBy,
  @Semantics.systemDateTime.lastChangedAt: true
  last_changed_at as LastChangedAt,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true
  local_last_changed_at as LocalLastChangedAt
}
