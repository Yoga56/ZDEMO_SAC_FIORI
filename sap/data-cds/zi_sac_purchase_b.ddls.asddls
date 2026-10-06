@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Purchase order items with their month (base of ZI_SAC_PURCHASE_PERIOD)'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZI_SAC_PURCHASE_B
  as select from I_PurchaseOrderItemAPI01 as item
    inner join   I_PurchaseOrderAPI01     as head on head.PurchaseOrder = item.PurchaseOrder
{
  key item.PurchaseOrder,
  key item.PurchaseOrderItem,
      substring( head.PurchaseOrderDate, 1, 6 ) as FiscalPeriod,
      head.CompanyCode,
      head.PurchasingOrganization,
      head.Supplier,
      item.Plant,
      item.Material,
      item.DocumentCurrency                     as Currency,

      @Semantics.amount.currencyCode: 'Currency'
      item.NetAmount                            as Amount
}
where item.PurchasingDocumentDeletionCode = ''
