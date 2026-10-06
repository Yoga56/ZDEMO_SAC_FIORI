@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Billing items with their month (base of ZI_SAC_SALES_PERIOD)'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZI_SAC_SALES_B
  as select from I_BillingDocumentItem as item
    inner join   I_BillingDocument     as head on head.BillingDocument = item.BillingDocument
{
  key item.BillingDocument,
  key item.BillingDocumentItem,
      substring( head.BillingDocumentDate, 1, 6 ) as FiscalPeriod,
      item.SalesOrganization,
      item.DistributionChannel,
      item.Division,
      item.Product,
      item.TransactionCurrency                    as Currency,

      @Semantics.amount.currencyCode: 'Currency'
      item.NetAmount                              as Amount
}
where head.BillingDocumentIsCancelled = ''
