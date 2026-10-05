@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Multi Action'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define root view entity ZC_SAC_MULTIACT
  provider contract transactional_query
  as projection on ZR_SAC_MULTIACT
{
  key ActionId,
  ActionName,
  Description,
  CreatedBy,
  CreatedAt,
  LastChangedBy,
  LastChangedAt,
  LocalLastChangedAt,
  _Step : redirected to composition child ZC_SAC_MASTEP
}
