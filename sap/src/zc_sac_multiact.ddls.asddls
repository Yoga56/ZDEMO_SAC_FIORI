@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Multi Action'
@AccessControl.authorizationCheck: #CHECK
define root view entity ZC_SAC_MULTIACT
  provider contract transactional_query
  as projection on ZR_SAC_MULTIACT
{
  key ActionId,
  ActionName,
  Description,
  Parameters,
  OwnerId,
  CreatedBy,
  CreatedAt,
  LastChangedBy,
  LastChangedAt,
  LocalLastChangedAt,
  CurrentUser,
  _Step : redirected to composition child ZC_SAC_MASTEP,
  _ShareMe : redirected to ZC_SAC_SHARE,
  _ShareAll : redirected to ZC_SAC_SHARE
}
