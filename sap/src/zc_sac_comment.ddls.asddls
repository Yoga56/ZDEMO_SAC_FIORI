@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Cell Comment'
@AccessControl.authorizationCheck: #CHECK
define root view entity ZC_SAC_COMMENT
  provider contract transactional_query
  as projection on ZR_SAC_COMMENT
{
  key CommentId,
  ModelId,
  VersionId,
  Period,
  Measure,
  DimsJson,
  CommentText,
  CreatedBy,
  CreatedAt,
  LastChangedBy,
  LastChangedAt,
  LocalLastChangedAt
}
