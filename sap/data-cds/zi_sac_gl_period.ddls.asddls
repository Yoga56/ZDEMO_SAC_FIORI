@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'G/L amounts per period for SAC on Fiori'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZI_SAC_GL_PERIOD
  as select from I_JournalEntryItem
{
  key concat( FiscalYear, substring( FiscalPeriod, 2, 2 ) ) as FiscalPeriod,
  key CompanyCode,
  key GLAccount,
  key ProfitCenter,
  key CompanyCodeCurrency                                   as Currency,

      @Semantics.amount.currencyCode: 'Currency'
      @Aggregation.default: #SUM
      sum( AmountInCompanyCodeCurrency )                    as Amount
}
where Ledger = '0L'
group by
  FiscalYear,
  FiscalPeriod,
  CompanyCode,
  GLAccount,
  ProfitCenter,
  CompanyCodeCurrency
