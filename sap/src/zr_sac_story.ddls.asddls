@AccessControl.authorizationCheck: #CHECK
@Metadata.allowExtensions: true
@EndUserText.label: 'Story'
define root view entity ZR_SAC_STORY
  as select from zsac_story
  composition [0..*] of ZR_SAC_WIDGET as _Widget
  association [0..1] to ZR_SAC_SHARE as _ShareMe  on _ShareMe.ObjectKind = 'STORY' and _ShareMe.ObjectId = $projection.StoryId and _ShareMe.Principal = $session.user
  association [0..1] to ZR_SAC_SHARE as _ShareAll on _ShareAll.ObjectKind = 'STORY' and _ShareAll.ObjectId = $projection.StoryId and _ShareAll.Principal = '*'
{
  key story_id as StoryId,
  story_name as StoryName,
  description as Description,
  model_id as ModelId,
  status as Status,
  pages_json as PagesJson,
  filters as Filters,
  owner_id as OwnerId,
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
  $session.user as CurrentUser,
  _Widget,
  _ShareMe,
  _ShareAll
}
