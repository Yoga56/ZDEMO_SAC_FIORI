@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Story'
@AccessControl.authorizationCheck: #CHECK
define root view entity ZC_SAC_STORY
  provider contract transactional_query
  as projection on ZR_SAC_STORY
{
  key StoryId,
  StoryName,
  Description,
  ModelId,
  Status,
  PagesJson,
  Filters,
  OwnerId,
  CreatedBy,
  CreatedAt,
  LastChangedBy,
  LastChangedAt,
  LocalLastChangedAt,
  CurrentUser,
  _Widget : redirected to composition child ZC_SAC_WIDGET,
  _ShareMe : redirected to ZC_SAC_SHARE,
  _ShareAll : redirected to ZC_SAC_SHARE
}
