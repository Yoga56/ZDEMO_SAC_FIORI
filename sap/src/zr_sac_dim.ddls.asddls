@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@EndUserText.label: 'Model Dimension'
define view entity ZR_SAC_DIM
  as select from zsac_dim
  association to parent ZR_SAC_MODEL as _Model on $projection.ModelId = _Model.ModelId
{
  key model_id as ModelId,
  key dim_id as DimId,
  label as Label,
  slot as Slot,
  members as Members,
  dim_type as DimType,
  attributes as Attributes,
  hierarchies as Hierarchies,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true,
  local_last_changed_at as LocalLastChangedAt,
  _Model
}
