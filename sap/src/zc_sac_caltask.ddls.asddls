@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Calendar Task'
@AccessControl.authorizationCheck: #NOT_REQUIRED
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
  CreatedBy,
  CreatedAt,
  LastChangedBy,
  LastChangedAt,
  LocalLastChangedAt
}
