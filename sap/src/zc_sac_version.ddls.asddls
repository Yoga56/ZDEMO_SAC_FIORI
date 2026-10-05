@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Planning Version'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define root view entity ZC_SAC_VERSION
  provider contract transactional_query
  as projection on ZR_SAC_VERSION
{
  key ModelId,
  key VersionId,
  VersionName,
  Category,
  Locked,
  OwnerId,
  SourceVersion,
  Status,
  CreatedBy,
  CreatedAt,
  LastChangedBy,
  LastChangedAt,
  LocalLastChangedAt
}
