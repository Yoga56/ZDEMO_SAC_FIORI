@AccessControl.authorizationCheck: #CHECK
@Metadata.allowExtensions: true
@EndUserText.label: 'Calendar Event'
define root view entity ZR_SAC_CALTASK
  as select from zsac_caltask
  association [0..1] to ZR_SAC_SHARE as _ShareMe  on _ShareMe.ObjectKind = 'CALEVENT' and _ShareMe.ObjectId = $projection.TaskId and _ShareMe.Principal = $session.user
  association [0..1] to ZR_SAC_SHARE as _ShareAll on _ShareAll.ObjectKind = 'CALEVENT' and _ShareAll.ObjectId = $projection.TaskId and _ShareAll.Principal = '*'
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
  event_type as EventType,
  parent_id as ParentId,
  start_date as StartDate,
  end_date as EndDate,
  progress as Progress,
  people_json as PeopleJson,
  files_json as FilesJson,
  config_json as ConfigJson,
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
  _ShareMe,
  _ShareAll
}
