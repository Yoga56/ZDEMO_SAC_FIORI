@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'Action Run'
define root view entity ZR_SAC_RUN
  as select from zsac_run
{
  key run_id as RunId,
  action_id as ActionId,
  action_name as ActionName,
  model_id as ModelId,
  run_kind as RunKind,
  status as Status,
  changed as Changed,
  duration_ms as DurationMs,
  user_name as UserName,
  started_at as StartedAt,
  params_text as ParamsText,
  log_text as LogText,
  steps_json as StepsJson,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true,
  local_last_changed_at as LocalLastChangedAt
}
