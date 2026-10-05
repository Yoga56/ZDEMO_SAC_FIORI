@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'Plan Fact'
define root view entity ZR_SAC_FACT
  as select from zsac_fact
{
  key model_id as ModelId,
  key version_id as VersionId,
  key period as Period,
  key measure as Measure,
  key dim1 as Dim1,
  key dim2 as Dim2,
  key dim3 as Dim3,
  key dim4 as Dim4,
  key dim5 as Dim5,
  fact_value as Value,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true
  local_last_changed_at as LocalLastChangedAt
}
