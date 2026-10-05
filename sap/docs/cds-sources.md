# CDS views as data sources

A model normally keeps its own data in the fact table (`ZSAC_FACT`). A model can instead be connected to a **CDS view**, standard or custom,
exposed as an OData V4 service. There are two ways to use it, and both use the same mapping.

| | Live | Import |
|---|---|---|
| Where the data is | in the CDS view, read when a story, table or analysis asks | copied into versions of a planning model |
| Planning, versions, data actions | no (read only, one version) | yes, on the copy |
| Always current | yes | as of the last import |
| Size | the service aggregates, only the result travels | rows of the view per import |
| Authorization | CDS access control of the user who looks | CDS access control of the user who imports; plan data has no row-level control |

SAC calls these live and import data connections, Power BI calls them DirectQuery and Import. The difference here is that the call is made by the
user's own session on the ABAP system, so no gateway or SSO setup is needed and DCL roles apply.

## 1. Expose the CDS view

The app needs an OData V4 entity set with one row per combination of period, dimension members and measure values (a cube-like view). Any other
shape works if the fields can be mapped.

**Custom CDS** (ABAP Cloud syntax):

```abap
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'Sales cube'
define view entity ZI_SalesCube
  as select from zsales_item
{
  key Region,
  key Product,
  key Channel,
  key concat( FiscalYear, FiscalPeriod ) as FiscalPeriod,   // '202603'
      @Semantics.amount.currencyCode: 'Currency'
      @Aggregation.default: #SUM
      NetAmount as Revenue,
      @Semantics.amount.currencyCode: 'Currency'
      @Aggregation.default: #SUM
      CostAmount as Cost,
      Currency
}
```

**Standard CDS**: do not expose the standard view itself. Create a view entity of your own that selects from it, renames the fields, derives the period
and keeps only what the app needs; on ABAP Cloud only released views may be used. The wrapper is also where you add access control (`DEFINE ROLE`).

Then a service definition and a binding:

```abap
define service ZUI_SALES_CUBE { expose ZI_SalesCube as SalesCube; }
```

Create the service binding in ADT (**OData V4 - Web API**) and publish it. The service URL is shown on the binding, for example
`/sap/opu/odata4/sap/zui_sales_cube/srvd_a2x/sap/zui_sales_cube/0001/` and the entity set is `SalesCube`.

## 2. Connect the model

Modeller, model, **CDS Source**, *Connect to CDS ...*:

1. Choose **Live** or **Import**.
2. Enter the service URL and press *Read fields*: the app reads `$metadata` and lists the entity sets and their fields.
3. Choose the entity set. Choose the **period field** and its format (`202603`, `2026-03`, or a date such as `2026-03-15`).
4. Map every dimension and every measure of the model to a field (names that match are filled in). A dimension can also have a text field that names its members.
5. *Test* reads the source with the mapping and shows a few values. *OK* can also read the members of the dimensions and the period range from the source.
6. Save the model.

A live model has one version (the *Version of the rows*, for example `ACT`), is locked and read only, and has planning, data locking and audit switched off.

## 3. Use it

* **Live**: stories, the Data Analyser, tables, charts and KPIs use the model like any other. Filters become `$filter`, the aggregation becomes
  `$apply=filter(...)/groupby((period,dimensions),aggregate(field with sum as MEASURE))`, so only the aggregated rows travel.
* **Import**: *Import from source* (Modeller) copies all periods into a version; the multi action step **Import from Source** copies the months you choose
  (parameters allowed) into a version, replacing or updating. Importing into a locked version is refused.

## What to check on your system

* `$apply` with `groupby` and `aggregate` is supported for aggregating view entities and analytical cubes, not for every plain view. If the service answers
  501, 405 or a 400 that mentions `$apply`, the app reads the rows as they are (`$select`, `$filter`) and aggregates them itself, which works for views
  up to **MaxRows** (100 000 by default) and fails with a clear message beyond that: then filter by period or aggregate in the view.
* The dimension members seen in the filter lists are the ones read from the source when you pressed *OK* with the option set. Read them again when the master data changes.
* A measure with the aggregation *Count* cannot be read from a CDS source; *Average* by month cannot be built from a date field when the service aggregates.
* Hierarchies, attributes and texts of the dimension are defined in the model (Modeller), not read from the view.
* **Another client.** The app's own data (models, stories, plan data) lives in the client the destination points to, while the CDS data can be in another client. Enter the client (for example `100`) in the data source dialog: it is sent as `sap-client` with every request to the source. The user of the destination must exist in that client.
* Calls are made without CSRF token and cookies of other origins; use a service on the same server as the app, or one that allows this origin (CORS).
* None of this was run against an SAP system: the generated requests follow the OData V4 aggregation specification and are tested against an in-memory
  stand-in (`FakeODataService`). Check a first request in the browser's network tab and in ADT's service test (`Service Binding > Preview`).
