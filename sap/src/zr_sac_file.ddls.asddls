@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'File'
define root view entity ZR_SAC_FILE
  as select from zsac_file
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
  local_last_changed_at as LocalLastChangedAt
}
