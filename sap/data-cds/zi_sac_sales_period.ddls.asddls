@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Billed sales per period for SAC on Fiori'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZI_SAC_SALES_PERIOD
  as select from ZI_SAC_SALES_B
{
  key FiscalPeriod,
  key SalesOrganization,
  key DistributionChannel,
  key Division,
  key Product,
  key Currency,

      @Semantics.amount.currencyCode: 'Currency'
      @Aggregation.default: #SUM
      sum( Amount ) as Amount
}
group by
  FiscalPeriod,
  SalesOrganization,
  DistributionChannel,
  Division,
  Product,
  Currency
