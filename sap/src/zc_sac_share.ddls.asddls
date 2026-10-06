@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Share'
@AccessControl.authorizationCheck: #CHECK
define root view entity ZC_SAC_SHARE
  provider contract transactional_query
  as projection on ZR_SAC_SHARE
{
  key ObjectKind,
  key ObjectId,
  key Principal,
  AccessLevel,
  OwnerId,
  CreatedBy,
  CreatedAt,
  LastChangedBy,
  LastChangedAt,
  LocalLastChangedAt
}
