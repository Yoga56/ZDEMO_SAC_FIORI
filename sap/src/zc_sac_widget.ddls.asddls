@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Story Widget'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define view entity ZC_SAC_WIDGET
  as projection on ZR_SAC_WIDGET
{
  key StoryId,
  key WidgetId,
  PageNo,
  WidgetKind,
  Title,
  GridX,
  GridY,
  GridW,
  GridH,
  Binding,
  Props,
  ChildChangedAt,
  _Story : redirected to parent ZC_SAC_STORY
}
