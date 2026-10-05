@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'Story Widget'
define view entity ZR_SAC_WIDGET
  as select from zsac_widget
  association to parent ZR_SAC_STORY as _Story on $projection.StoryId = _Story.StoryId
{
  key story_id as StoryId,
  key widget_id as WidgetId,
  page_no as PageNo,
  widget_type as WidgetType,
  title as Title,
  grid_x as GridX,
  grid_y as GridY,
  grid_w as GridW,
  grid_h as GridH,
  binding as Binding,
  props as Props,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true
  local_last_changed_at as LocalLastChangedAt,
  _Story
}
