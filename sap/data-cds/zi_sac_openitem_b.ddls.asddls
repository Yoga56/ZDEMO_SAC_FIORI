@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Open items with their due month (base of ZI_SAC_OPENITEM_PERIOD)'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZI_SAC_OPENITEM_B
  as select from I_OperationalAcctgDocItem
{
  key CompanyCode,
  key AccountingDocument,
  key FiscalYear,
  key AccountingDocumentItem,
      substring( NetDueDate, 1, 6 ) as FiscalPeriod,
      FinancialAccountType,
      Customer,
      Supplier,
      CompanyCodeCurrency           as Currency,

      @Semantics.amount.currencyCode: 'Currency'
      AmountInCompanyCodeCurrency   as Amount
}
where ClearingDate is initial
  and ( FinancialAccountType = 'D' or FinancialAccountType = 'K' )
