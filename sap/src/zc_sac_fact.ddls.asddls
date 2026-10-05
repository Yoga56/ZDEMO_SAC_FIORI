@Metadata.allowExtensions: true
@Metadata.ignorePropagatedAnnotations: true
@EndUserText.label: 'Plan Fact'
@AccessControl.authorizationCheck: #NOT_REQUIRED
define root view entity ZC_SAC_FACT
  provider contract transactional_query
  as projection on ZR_SAC_FACT
{
  key ModelId,
  key VersionId,
  key Period,
  key Measure,
  key Dim1,
  key Dim2,
  key Dim3,
  key Dim4,
  key Dim5,
  Value,
  LocalLastChangedAt
}
