@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Data Action Step'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define view entity ZC_SAC_DASTEP
  as projection on ZR_SAC_DASTEP
{
  key ActionId,
  key StepNo,
  StepType,
  SrcVersion,
  TgtVersion,
  FilterText,
  Factor,
  TargetDim,
  TargetMembers,
  LocalLastChangedAt,
  _DataAction : redirected to parent ZC_SAC_DATAACT
}
