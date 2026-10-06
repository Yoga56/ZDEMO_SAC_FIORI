@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Calendar Event'
@AccessControl.authorizationCheck: #CHECK
define root view entity ZC_SAC_CALTASK
  provider contract transactional_query
  as projection on ZR_SAC_CALTASK
{
  key TaskId,
  Title,
  ModelId,
  VersionId,
  Assignee,
  DueDate,
  Status,
  Approver,
  Notes,
  EventType,
  ParentId,
  StartDate,
  EndDate,
  Progress,
  PeopleJson,
  FilesJson,
  ConfigJson,
  OwnerId,
  CreatedBy,
  CreatedAt,
  LastChangedBy,
  LastChangedAt,
  LocalLastChangedAt,
  CurrentUser,
  _ShareMe : redirected to ZC_SAC_SHARE,
  _ShareAll : redirected to ZC_SAC_SHARE
}
