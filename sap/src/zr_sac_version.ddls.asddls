@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'Planning Version'
define root view entity ZR_SAC_VERSION
  as select from zsac_version
{
  key model_id as ModelId,
  key version_id as VersionId,
  version_name as VersionName,
  category as Category,
  locked as Locked,
  owner_id as OwnerId,
  source_version as SourceVersion,
  status as Status,
  @Semantics.user.createdBy: true,
  created_by as CreatedBy,
  @Semantics.systemDateTime.createdAt: true,
  created_at as CreatedAt,
  @Semantics.user.lastChangedBy: true,
  last_changed_by as LastChangedBy,
  @Semantics.systemDateTime.lastChangedAt: true,
  last_changed_at as LastChangedAt,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true,
  local_last_changed_at as LocalLastChangedAt
}
