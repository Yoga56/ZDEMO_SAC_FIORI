@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Action Run'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define root view entity ZC_SAC_RUN
  provider contract transactional_query
  as projection on ZR_SAC_RUN
{
  key RunId,
  ActionId,
  ActionName,
  ModelId,
  RunKind,
  Status,
  Changed,
  DurationMs,
  UserName,
  StartedAt,
  ParamsText,
  LogText,
  StepsJson,
  LocalLastChangedAt
}
