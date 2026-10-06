@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'File'
@AccessControl.authorizationCheck: #CHECK
define root view entity ZC_SAC_FILE
  provider contract transactional_query
  as projection on ZR_SAC_FILE
{
  key FileId,
  ParentId,
  FileKind,
  ObjectId,
  FileName,
  Description,
  OwnerId,
  Favourite,
  Shared,
  CreatedBy,
  CreatedAt,
  LastChangedBy,
  LastChangedAt,
  LocalLastChangedAt,
  _ShareMe : redirected to ZC_SAC_SHARE,
  _ShareAll : redirected to ZC_SAC_SHARE
}
