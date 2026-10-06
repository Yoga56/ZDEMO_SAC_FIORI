@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Open receivables and payables per due month for SAC on Fiori'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZI_SAC_OPENITEM_PERIOD
  as select from ZI_SAC_OPENITEM_B
{
  key FiscalPeriod,
  key CompanyCode,
  key FinancialAccountType,
  key Customer,
  key Supplier,
  key Currency,

      @Semantics.amount.currencyCode: 'Currency'
      @Aggregation.default: #SUM
      sum( Amount ) as Amount
}
group by
  FiscalPeriod,
  CompanyCode,
  FinancialAccountType,
  Customer,
  Supplier,
  Currency
