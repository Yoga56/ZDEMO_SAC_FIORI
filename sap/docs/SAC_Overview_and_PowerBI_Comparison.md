# SAP Analytics Cloud (SAC): Functions and Comparison vs Power BI

*Prepared 5 Oct 2026. Pricing figures are third-party estimates (SAP does not publish them). Verify with a quote.*

---

## 1. What is SAC

SAP Analytics Cloud is a multi-tenant SaaS on SAP BTP that combines three capabilities in one tenant:

| Capability | What it does |
|---|---|
| **BI** | Dashboards ("Stories"), ad-hoc analysis, scripted analytic applications, Digital Boardroom |
| **Planning** | Budgeting, forecasting, allocations, workflow, what-if simulation |
| **Predictive / Augmented** | Smart Predict, Predictive Planning, Smart Insights, Smart Discovery, Just Ask / Joule |

Since 1 Jan 2026, SAC (with Datasphere) is sold through **SAP Business Data Cloud (BDC)** for new subscriptions. Existing tenants are preserved, with no technical migration required.

---

## 2. Architecture and Object Types

| Layer | Objects |
|---|---|
| Data | Connections (Live / Import), Datasets, Models (Analytic Model, classic Model) |
| Content | Stories, Analytic Applications (scripted), Digital Boardroom |
| Planning | Versions, Data Actions, Multi-Actions, Allocations, Value Driver Trees, Planning Calendar |
| Augmented | Smart Insights, Smart Discovery, Search to Insight, Just Ask, Joule |
| Platform | Teams, Roles, Content Network, Transport, REST APIs |

---

## 3. Functions in Detail

### 3.1 Business Intelligence
- **Stories**: low-code dashboards with filters, prompts, linked analysis, calculations.
- **Analytic Applications**: full scripting (Analytics Designer) for popups, planning API, custom logic, and custom widgets.
- **Digital Boardroom**: executive presentation mode over live data.
- **Search to Insight / Just Ask**: natural-language querying over models.

### 3.2 Planning
- **Versions**: Actual, Forecast, Budget (public), plus private versions for what-if.
- **Data Actions**: advanced formulas, copy, allocation, currency conversion.
- **Multi-Actions**: orchestrate data actions, predictive steps, API steps, and version publishing across models.
- **Planning Calendar**: tasks, workflow, approvals.
- **Value Driver Trees**: driver-based simulation.
- Planning-capable sources: native SAC models, BPC/BW, Datasphere models. S/4 CDS live queries are read-only for planning.

### 3.3 Predictive and Augmented Analytics
- **Smart Predict**: classification, regression, time-series forecasting without code.
- **Predictive Planning**: time-series forecast written into a planning version.
- **Smart Insights / Smart Discovery**: automatic driver and anomaly explanation.
- **Just Ask / Joule**: natural-language layer on top of models.

### 3.4 Extensibility
- Custom widgets (Web Components, `widget.json`).
- REST APIs: Data Import, Content, Users/Teams, Activities.
- Data Export Service (OData), Content Network packaging, Jobs/Schedules.

---

## 4. Connectivity

| | Live | Import (Acquired) |
|---|---|---|
| Data location | Stays in source | Copied into SAC |
| Sources | S/4HANA (CDS analytical queries), BW/4HANA, HANA, Datasphere | Files, S/4 via OData/ODP, Datasphere, other SaaS |
| Planning | Only on BW IP/BPC, Datasphere, or HANA planning-enabled sources | Native |
| Security | Source-side authorizations (SSO/SAML) | SAC roles, Data Access Control |
| Use | Operational reporting | Planning, blending |

**S/4 live connection prerequisites:**
- Activate ICF nodes `/sap/bw/ina` and `/sap/bw/ina/GetServiceMetaData` (`SICF`).
- Cloud Connector (`SM59` destination) or direct access with CORS.
- SAML SSO (`SAML2`).
- Connection in SAC: Connections → Live Data → SAP S/4HANA.

---

## 5. Backend Modeling for SAC (RAP/CDS)

```abap
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'Sales Cube'
@Analytics.dataCategory: #CUBE
@ObjectModel.usageType: { serviceQuality: #D, sizeCategory: #XL, dataClass: #TRANSACTIONAL }
define view entity ZI_SalesCube
  as select from ztsales
  association [0..1] to ZI_CustomerDim as _Customer
    on $projection.Customer = _Customer.Customer
{
  key sales_doc  as SalesDocument,
      @ObjectModel.foreignKey.association: '_Customer'
      customer   as Customer,
      @Semantics.currencyCode: true
      currency   as Currency,
      @DefaultAggregation: #SUM
      @Semantics.amount.currencyCode: 'Currency'
      net_amount as NetAmount,
      _Customer
}
```

```abap
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'Sales by Customer'
define transient view entity ZC_SalesQuery
  provider contract analytical_query
  as projection on ZI_SalesCube
{
  @AnalyticsDetails.query.axis: #ROWS
  Customer,
  @AnalyticsDetails.query.axis: #COLUMNS
  NetAmount
}
```

- Dimensions: `@Analytics.dataCategory: #DIMENSION`, texts via `@ObjectModel.text.element`, hierarchies via `@Hierarchy.parentChild`.
- Test in ADT with Data Preview (F8). Fiori apps: Custom Analytical Queries, Query Browser.
- Row security: DCL (`define role`), respected by the live connection.

---

## 6. SAC Planning and S/4HANA Transactions

SAC Planning **cannot block transactions in S/4HANA directly**. Plan and budget are two separate objects:

| | Plan (`ACDOCP`) | Budget (`CJ30`) |
|---|---|---|
| Created by | SAC Planning for S/4 (plan data write-back) | `CJ30` / `CJ37`, or API/BAPI |
| Checked by transactions | No | Yes, by Availability Control (AVC) |
| Purpose | Plan vs actual reporting | Spending control |
| Can block postings | No | Yes (`OPTK` warning/error) |

**Pattern to enforce plan in S/4:**
1. Planners work in a private version, then publish to a Budget version via Planning Calendar approval.
2. A Multi-Action API step calls a RAP action or released API that posts the approved values as WBS budget (`CJ30` / `CJ37`; release with `CJ32` if required).
3. PS AVC (`OPSV` profile, `OPTK` tolerances) enforces limits at posting time.
4. Verify in `CJ20N`; check actuals in `CJI3` / `KSB1`; check plan data in `SE16N` on `ACDOCP`.

```abap
define behavior for ZI_BudgetUpload alias Budget
{
  static action uploadBudget parameter ZA_BudgetTab result [1] ZA_Result;
}
```

Write approved versions only. Never write draft plan versions to S/4.

---

## 7. Security

- **Roles**: standard (Admin, BI Admin, Planner, Viewer) and custom roles.
- **Teams**: sharing and folder-level access.
- **Data Access Control**: model-level, dimension-based (Import models). Live models inherit source authorizations.
- **Identity**: SAML SSO or SAP IAS. Network: IP allowlist, Cloud Connector.

---

## 8. Licensing and Cost

SAP does not publish SAC prices. Third-party sources conflict widely:

| Source | BI user | Planning user |
|---|---|---|
| Redress (negotiation advisory) | $22-36 / user / month list | Professional $36-48, Standard $22-30 |
| Vendr (deal data) | Standard $30-40, BI $40-50 | $50-70+ |
| Vendorbenchmark | n/a | $90-150 list |
| Redress licensing guide | about $180 list | Professional about $250-300 |
| Soltius Indonesia | SAC Pro package from IDR 295,000,000 (undated page) | n/a |

**Cost drivers and controls:**
- Planning Professional is about 3-5x a BI user at list price. Reserve it for model builders and FP&A architects.
- Budget-entry users need Planning Standard. Viewers need BI.
- BTP credits and Datasphere are separate cost buckets. Ask for disaggregated pricing, especially in RISE bundles.
- Negotiate SAC and Datasphere together under BDC.

---

## 9. SAC vs Power BI

| | **Power BI** | **SAC** |
|---|---|---|
| **Positioning** | General-purpose BI on the Microsoft stack (Fabric, Azure, M365) | SAP-centric BI, planning and predictive in one tenant |
| **BI authoring** | Strongest: rich visuals, DAX, Power Query, composite models, large community, Excel/Teams integration | Good: Stories and Analytic Applications (scripting), less visual flexibility and community |
| **SAP data access** | Via HANA/BW connectors, OData, Datasphere or an extract layer. S/4 CDS semantics and authorizations are not inherited by default. | Native live connection to S/4 CDS analytical queries, BW/4HANA, HANA. Source authorizations respected. |
| **Data modeling** | Semantic model (DAX), Fabric/OneLake | Analytic Model, live source models, Datasphere |
| **Planning** | No native planning historically. Planning in Fabric IQ was introduced at FabCon Atlanta 2026 (budgets, forecasts, scenarios, what-if; writeback to Fabric SQL) and is still in preview. Mature options are third-party (Lumel, K4, Acterys, Vena). | Mature native planning: versions, data actions, multi-actions, allocations, calendar workflow, value driver trees |
| **Predictive** | Forecast line, anomaly detection, Key Influencers, Decomposition Tree, Copilot. Real ML via Fabric Data Science or Azure ML (needs data science skills). | Smart Predict, Predictive Planning, Smart Insights/Discovery, Just Ask/Joule. No-code, business-user oriented. |
| **Security** | Row-level security, Entra ID, Purview | Roles, Teams, Data Access Control, or source authorizations on live connections |
| **Cost** | Roughly $14-20 / user / month (cheapest in category per erpresearch); Fabric capacity extra | Quote-based. See section 8. |
| **Best fit** | Enterprise-wide self-service BI, non-SAP or mixed sources | SAP-heavy shops needing governed live S/4 reporting and integrated planning |

### Decision guide
- **SAP-heavy landscape with real planning needs** (budget, forecast, workflow, version control): SAC. Power BI's native planning is in preview, and third-party add-ons bring their own cost and governance.
- **Mostly dashboards and BI**: Power BI is cheaper. Main cost is rebuilding SAP authorizations and semantics in the extract layer.
- **Hybrid** is common: SAC for planning and live S/4 reporting, Power BI for broad self-service, both fed from Datasphere or BW.

Caveat: the "no per-seat licensing" claim for Fabric Planning comes from a Lumel (vendor) session description. Confirm in Microsoft's pricing.

---

## 10. SAC in Indonesia (publicly verifiable references)

| Customer | Scope | Partner |
|---|---|---|
| Enesis Group (FMCG) | S/4HANA, SAC and BPC for core finance, cost management, profitability analysis. Go-live 2019. | Soltius Indonesia |
| Garuda Indonesia | Selected SAP Business Data Cloud (includes SAC), plus Cloud ERP Private, Signavio, Taulia. SAC itself not confirmed. | n/a |
| Chandra Asri Pacific | Signavio and Datasphere (data layer, SAC not confirmed) | n/a |
| UHAMKA | SAC training via ASEAN Foundation. Not an enterprise rollout. | n/a |

Partners with SAC offerings: **Soltius Indonesia** (SAP Platinum partner), **Think Tank Solusindo**.
Most Indonesian SAC deployments are not public. Ask SAP Indonesia or local partners for references.

---

## 11. Lifecycle and Troubleshooting

- Dev/Test/Prod tenants: Transport via Content Network or export/import.
- Common issues:
  - CORS/SSO errors on live connections: check `SICF` nodes and SAML config.
  - Blank data: missing Data Access Control assignment.
  - Currency conversion failures: missing rate table.
- Useful T-codes: `SICF`, `SM59`, `/UI2/FLP`, `SAML2`, `RSRT` (BW query test), `ODQMON` (ODP delta).

---

## 12. Learning Path

1. SAP Learning: *Introduction to SAP Analytics Cloud* (free).
2. Free SAC trial tenant.
3. SAP Help: *Analytics Designer Developer Guide* and Planning guides.
4. First exercise: RAP CDS cube, then live connection, then a Story.
5. SAP Community SAC Planning blogs and quarterly release notes.

---

## Sources

- SAP Community: Announcement, Datasphere and SAC availability via SAP Business Data Cloud.
- Microsoft Fabric Blog: Introducing Planning in Microsoft Fabric IQ (Apr 2026).
- Soltius Indonesia: Enesis Group go-live; SAC pricing blog.
- SAP Southeast Asia News Center: Q4 2023 and Q1 2026 customer announcements.
- Redress Compliance, Vendr, Vendorbenchmark, ERPResearch: pricing estimates (third-party).
- Lumel, K4 Analytics: Power BI planning/writeback add-ons.
