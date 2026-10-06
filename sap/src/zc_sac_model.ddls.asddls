@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Planning Model'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define root view entity ZC_SAC_MODEL
  provider contract transactional_query
  as projection on ZR_SAC_MODEL
{
  key ModelId,
  ModelName,
  Description,
  Currency,
  PeriodFrom,
  PeriodTo,
  PlanningEnabled,
  DataLocking,
  DataAudit,
  DataSource,
  SourceJson,
  OwnerId,
  CreatedBy,
  CreatedAt,
  LastChangedBy,
  LastChangedAt,
  LocalLastChangedAt,
  CurrentUser,
  _Dimension : redirected to composition child ZC_SAC_DIM,
  _Measure : redirected to composition child ZC_SAC_MEASURE
}
