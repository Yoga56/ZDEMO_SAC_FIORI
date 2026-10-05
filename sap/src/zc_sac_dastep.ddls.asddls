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
  StepName,
  Description,
  Active,
  Config,
  LocalLastChangedAt,
  _DataAction : redirected to parent ZC_SAC_DATAACT
}
