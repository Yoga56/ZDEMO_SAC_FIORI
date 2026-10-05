@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Multi Action Step'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define view entity ZC_SAC_MASTEP
  as projection on ZR_SAC_MASTEP
{
  key ActionId,
  key StepNo,
  StepType,
  StepName,
  Description,
  Active,
  Config,
  LocalLastChangedAt,
  _MultiAction : redirected to parent ZC_SAC_MULTIACT
}
