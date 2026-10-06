@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Open receivables and payables per due month for SAC on Fiori'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZI_SAC_OPENITEM_PERIOD
  as select from I_OperationalAcctgDocItem
{
  key substring( NetDueDate, 1, 6 )       as FiscalPeriod,
  key CompanyCode,
  key FinancialAccountType,
  key Customer,
  key Supplier,
  key CompanyCodeCurrency                 as Currency,

      @Semantics.amount.currencyCode: 'Currency'
      @Aggregation.default: #SUM
      sum( AmountInCompanyCodeCurrency )  as Amount
}
where ClearingDate is initial
  and ( FinancialAccountType = 'D' or FinancialAccountType = 'K' )
group by
  substring( NetDueDate, 1, 6 ),
  CompanyCode,
  FinancialAccountType,
  Customer,
  Supplier,
  CompanyCodeCurrency
