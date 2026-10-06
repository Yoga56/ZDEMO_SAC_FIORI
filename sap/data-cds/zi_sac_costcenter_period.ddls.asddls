@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Cost center postings per period for SAC on Fiori'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZI_SAC_COSTCENTER_PERIOD
  as select from I_JournalEntryItem
{
  key concat( FiscalYear, substring( FiscalPeriod, 2, 2 ) ) as FiscalPeriod,
  key CompanyCode,
  key CostCenter,
  key GLAccount,
  key FunctionalArea,
  key CompanyCodeCurrency                                    as Currency,

      @Semantics.amount.currencyCode: 'Currency'
      @Aggregation.default: #SUM
      sum( AmountInCompanyCodeCurrency )                     as Amount
}
where Ledger     = '0L'
  and CostCenter <> ''
group by
  FiscalYear,
  FiscalPeriod,
  CompanyCode,
  CostCenter,
  GLAccount,
  FunctionalArea,
  CompanyCodeCurrency
