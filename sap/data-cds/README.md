# CDS views for live models (SAC on Fiori)

Each view is one row per period and dimension members with one `Amount`. A model reads it live (Modeller, Data Source, Live) and
then works like any other model in stories, the Data Analyser and Planning (read only).

| View | Entity set | Period | Dimensions | Amount |
|---|---|---|---|---|
| `ZI_SAC_GL_PERIOD` (service `ZUI_SAC_GL`) | `SAC_GL_PERIOD` | posting period | CompanyCode, GLAccount, ProfitCenter, Currency | line items, ledger 0L |
| `ZI_SAC_SALES_PERIOD` (service `ZUI_SAC_BIZ`) | `SAC_SALES_PERIOD` | billing date month | SalesOrganization, DistributionChannel, Division, Product, Currency | net billed amount, not cancelled |
| `ZI_SAC_PURCHASE_PERIOD` | `SAC_PURCHASE_PERIOD` | order date month | CompanyCode, PurchasingOrganization, Supplier, Plant, Material, Currency | net order value |
| `ZI_SAC_COSTCENTER_PERIOD` | `SAC_COSTCENTER_PERIOD` | posting period | CompanyCode, CostCenter, GLAccount, FunctionalArea, Currency | cost center postings, ledger 0L |
| `ZI_SAC_OPENITEM_PERIOD` | `SAC_OPENITEM_PERIOD` | due month | CompanyCode, FinancialAccountType (D customer, K supplier), Customer, Supplier, Currency | open items |

Period field is `FiscalPeriod`, format `YYYYMM`, amount field `Amount`, currency field `Currency`.

## Create them in ADT (package ZDEMO_SAC_FIORI_DATA)
1. New, Data Definition, name as in the table, template Define View Entity, paste the file. Activate (Ctrl+F3).
2. New, Service Definition `ZUI_SAC_BIZ`, paste `zui_sac_biz.srvd.srvdsrv`. Activate. (`ZUI_SAC_GL` exposes `ZI_SAC_GL_PERIOD as SAC_GL_PERIOD`.)
3. New, Service Binding `ZUI_SAC_BIZ`, binding type OData V4 - Web API (or UI), Publish.
4. In the app, Modeller, New model, Data Source: service
   `/sap/opu/odata4/sap/zui_sac_biz/srvd_a2x/sap/zui_sac_biz/0001/`, entity as in the table, mode Live, period `FiscalPeriod` (YYYYMM),
   dimensions and measure `Amount` as listed, currency field `Currency`.

The views are written against released S/4HANA Cloud views (`I_JournalEntryItem`, `I_BillingDocumentItem`, `I_BillingDocument`,
`I_PurchaseOrderItemAPI01`, `I_PurchaseOrderAPI01`, `I_OperationalAcctgDocItem`). They were not activated on a system by the author:
if a field name is refused, take the one ADT proposes (Ctrl+Space) and keep the alias on the left of `as`.

## Combining models
A story page binds one model, but a story has many pages and widgets, so a dashboard can show G/L, sales and cost centers side by side.
To compare across views, give the models the same dimension names (CompanyCode) and use the story filters.
