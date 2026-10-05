@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'Cell Comment'
define root view entity ZR_SAC_COMMENT
  as select from zsac_comment
{
  key comment_id as CommentId,
  model_id as ModelId,
  version_id as VersionId,
  period as Period,
  measure as Measure,
  dims_json as DimsJson,
  comment_text as CommentText,
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
