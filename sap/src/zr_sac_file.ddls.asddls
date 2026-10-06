@AccessControl.authorizationCheck: #CHECK
@Metadata.allowExtensions: true
@EndUserText.label: 'File'
define root view entity ZR_SAC_FILE
  as select from zsac_file
  association [0..1] to ZR_SAC_SHARE as _ShareMe  on _ShareMe.ObjectKind = $projection.FileKind and _ShareMe.ObjectId = $projection.ObjectId and _ShareMe.Principal = $session.user
  association [0..1] to ZR_SAC_SHARE as _ShareAll on _ShareAll.ObjectKind = $projection.FileKind and _ShareAll.ObjectId = $projection.ObjectId and _ShareAll.Principal = '*'
{
  key file_id as FileId,
  parent_id as ParentId,
  file_kind as FileKind,
  object_id as ObjectId,
  file_name as FileName,
  description as Description,
  owner_id as OwnerId,
  favourite as Favourite,
  shared as Shared,
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
  _ShareMe,
  _ShareAll
}
