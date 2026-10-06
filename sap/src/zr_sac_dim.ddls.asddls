@AccessControl.authorizationCheck: #CHECK
@Metadata.allowExtensions: true
@EndUserText.label: 'Model Dimension'
define view entity ZR_SAC_DIM
  as select from zsac_dim
  association to parent ZR_SAC_MODEL as _Model on $projection.ModelId = _Model.ModelId
{
  key model_id as ModelId,
  key dim_id as DimId,
  dim_label as DimLabel,
  slot as Slot,
  members as Members,
  dim_type as DimType,
  attributes as Attributes,
  hierarchies as Hierarchies,
  local_last_changed_at as ChildChangedAt,
  _Model
}
