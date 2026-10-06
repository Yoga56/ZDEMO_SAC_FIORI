@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Purchase order value per period for SAC on Fiori'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZI_SAC_PURCHASE_PERIOD
  as select from ZI_SAC_PURCHASE_B
{
  key FiscalPeriod,
  key CompanyCode,
  key PurchasingOrganization,
  key Supplier,
  key Plant,
  key Material,
  key Currency,

      @Semantics.amount.currencyCode: 'Currency'
      @Aggregation.default: #SUM
      sum( Amount ) as Amount
}
group by
  FiscalPeriod,
  CompanyCode,
  PurchasingOrganization,
  Supplier,
  Plant,
  Material,
  Currency
