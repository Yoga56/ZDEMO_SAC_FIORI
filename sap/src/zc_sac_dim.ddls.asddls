@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Model Dimension'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define view entity ZC_SAC_DIM
  as projection on ZR_SAC_DIM
{
  key ModelId,
  key DimId,
  Label,
  Slot,
  Members,
  DimType,
  Attributes,
  Hierarchies,
  LocalLastChangedAt,
  _Model : redirected to parent ZC_SAC_MODEL
}
