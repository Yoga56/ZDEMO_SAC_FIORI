@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Story'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define root view entity ZC_SAC_STORY
  provider contract transactional_query
  as projection on ZR_SAC_STORY
{
  key StoryId,
  StoryName,
  Description,
  ModelId,
  Status,
  Pages,
  Filters,
  CreatedBy,
  CreatedAt,
  LastChangedBy,
  LastChangedAt,
  LocalLastChangedAt,
  _Widget : redirected to composition child ZC_SAC_WIDGET
}
