@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Billed sales per period for SAC on Fiori'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZI_SAC_SALES_PERIOD
  as select from I_BillingDocumentItem as item
    inner join   I_BillingDocument     as head on head.BillingDocument = item.BillingDocument
{
  key substring( head.BillingDocumentDate, 1, 6 ) as FiscalPeriod,
  key item.SalesOrganization,
  key item.DistributionChannel,
  key item.Division,
  key item.Product,
  key item.TransactionCurrency                    as Currency,

      @Semantics.amount.currencyCode: 'Currency'
      @Aggregation.default: #SUM
      sum( item.NetAmount )                       as Amount
}
where head.BillingDocumentIsCancelled = ''
group by
  substring( head.BillingDocumentDate, 1, 6 ),
  item.SalesOrganization,
  item.DistributionChannel,
  item.Division,
  item.Product,
  item.TransactionCurrency
