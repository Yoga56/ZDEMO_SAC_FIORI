@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Data Action'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define root view entity ZC_SAC_DATAACT
  provider contract transactional_query
  as projection on ZR_SAC_DATAACT
{
  key ActionId,
  ModelId,
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
  _Step : redirected to composition child ZC_SAC_DASTEP
}
