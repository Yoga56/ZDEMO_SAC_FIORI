@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Purchase order value per period for SAC on Fiori'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZI_SAC_PURCHASE_PERIOD
  as select from I_PurchaseOrderItemAPI01 as item
    inner join   I_PurchaseOrderAPI01     as head on head.PurchaseOrder = item.PurchaseOrder
{
  key substring( head.PurchaseOrderDate, 1, 6 ) as FiscalPeriod,
  key head.CompanyCode,
  key head.PurchasingOrganization,
  key head.Supplier,
  key item.Plant,
  key item.Material,
  key item.DocumentCurrency                     as Currency,

      @Semantics.amount.currencyCode: 'Currency'
      @Aggregation.default: #SUM
      sum( item.NetAmount )                     as Amount
}
where item.PurchasingDocumentDeletionCode = ''
group by
  substring( head.PurchaseOrderDate, 1, 6 ),
  head.CompanyCode,
  head.PurchasingOrganization,
  head.Supplier,
  item.Plant,
  item.Material,
  item.DocumentCurrency
