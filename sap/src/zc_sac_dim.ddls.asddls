@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Model Dimension'
@AccessControl.authorizationCheck: #CHECK
define view entity ZC_SAC_DIM
  as projection on ZR_SAC_DIM
{
  key ModelId,
  key DimId,
  DimLabel,
  Slot,
  Members,
  DimType,
  Attributes,
  Hierarchies,
  ChildChangedAt,
  _Model : redirected to parent ZC_SAC_MODEL
}
