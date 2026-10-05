# Technical specification

## Architecture

```
 zsac.fiori (app)  --uses-->  zsac.lib (library)  --provider contract-->  MockProvider | ODataV4Provider | your provider
  routes, pages               core, widget, designer, planning                         |
                                                                              RAP service ZUI_SAC_O4
                                                                    ZR_SAC_* BOs, ZCL_SAC_* engines, ZSAC_* tables
```

### zsac.lib

| Area | Modules | Role |
|---|---|---|
| core | `DataProvider`, `ProviderRegistry`, `QueryEngine`, `FilterEngine`, `ModelSchema`, `StorySchema`, `WidgetRegistry`, `EventBus`, `Format` | contracts and pure logic, no UI |
| provider | `MockProvider`, `ODataV4Provider`, `mockdata/*.json` | data sources |
| planning | `DataActionEngine`, `VersionEngine`, `PlanningTable` | planning semantics and the editable grid |
| widget | `SvgChart` + `ChartBuilders`/`ChartData`, `KpiTile`, `PivotTable`, `WidgetCard`, `Widgets` (registrations) | what a story shows |
| designer | `StoryCanvas`, `StoryViewer`, `BuilderPanel`, `FilterEditor` | grid, drag and resize, viewer, generated forms |

The pure modules (`QueryEngine`, `FilterEngine`, both planning engines, chart builders, `MockProvider`) run under `node --test`
with a small `sap.ui.define` shim (`test/node/loader.js`).

### Data model

Facts are flat rows `{ModelId, VersionId, Period, Measure, Dim1..Dim5, Value}`. A model maps its dimension ids to the five slots
(`Dimensions[].Slot`), so any model fits one table. `VERSION`, `PERIOD` and `MEASURE` are built-in dimensions. Queries
(`provider.query({ModelId, Rows, Columns, Filters})`) read facts through `readFacts` and aggregate with the shared `QueryEngine`
in the browser. This is fine for planning sized models (some ten thousand facts); a server side `$apply` aggregation is the
next step for larger data.

### Model properties

| Level | Properties |
|---|---|
| Model | `PlanningEnabled` (off: read only in Planning), `DataLocking` (planners can lock and unlock public versions), `DataAudit` (change history of plan values), `DataSource` (last CSV imported) |
| Measure | `DataType`, `Aggregation` (SUM, AVG, MIN, MAX, COUNT), `ExceptionAggregation` + `ExceptionDims`, `UnitType` + `Unit`, `Scale` (1, 1000, 1000000), `Decimals` |
| Dimension | `DimId`, `Label` (the description), `Slot`, members; Version and Date are shown as built-in dimensions |

`QueryEngine.aggregate` applies the measure's aggregation to every cell and total (an average total is the average of the facts, not of the cell
averages). With an exception aggregation the facts are first reduced along the exception dimensions, then the standard aggregation applies to
the rest. Tables use the measure's scale and decimals unless the widget overrides them, KPI tiles can use them (`Number format: Measure format`),
the planning grid uses the decimals. `ModelSchema` holds the defaults and the validation the Modeller runs before saving.

Data Audit is recorded by `MockProvider` (`capabilities.audit`) and shown in Planning; the OData backend stores the flag but has no change log table yet.

### Story JSON

```json
{ "Id": "STORY_SALES", "Name": "...", "ModelId": "SALES_PLAN", "Status": "P",
  "Pages": [{ "Id": 1, "Title": "Overview" }], "Filters": {},
  "Widgets": [{ "Id": "W2", "Page": 1, "Type": "chart.bar", "Title": "...", "X": 0, "Y": 2, "W": 6, "H": 4,
                "Binding": { "ModelId": "SALES_PLAN", "Rows": ["REGION"], "Columns": ["VERSION"], "Measure": "REVENUE",
                             "Filters": { "VERSION": ["ACT", "BUD"] } },
                "Props": {} }] }
```

Grid: 12 columns, row height 80 px. On narrow screens the viewer stacks widgets in reading order.

### Backend (sap/src)

Generated from `sap/tools/sac_spec.py` by `gen_rap.py` and `abapgit_meta.py`; handlers and engines by hand.

| Layer | Objects |
|---|---|
| Tables | `ZSAC_FILE`, `_STORY`, `_WIDGET`, `_MODEL`, `_DIM`, `_MEASURE`, `_VERSION`, `_FACT`, `_DATAACT`, `_DASTEP`, `_MULTIACT`, `_MASTEP`, `_CALTASK` |
| BOs | `ZR_SAC_*` managed (no draft: the freestyle app edits directly), compositions Story-Widget, Model-Dimension/Measure, DataAction-Step, MultiAction-Step; `ZC_SAC_*` projections |
| Actions | Version: `CreatePrivate` (static), `Publish`, `Revert`; Fact: `WriteFacts`, `DeleteFacts` (static, bulk); DataAction: `Execute`; MultiAction: `Run` |
| Engines | `ZCL_SAC_FACT_WRITER` (all fact writes go through the Fact BO), `ZCL_SAC_VERSION_ENGINE`, `ZCL_SAC_DATAACT_ENGINE`, `ZCL_SAC_FILTER` |
| Service | `ZUI_SAC_O4` (OData V4 UI), binding created in ADT |
| Seed | `ZCL_SAC_SEED` (F9) |

Wire formats: facts travel as one tab separated line per fact (`model, version, period, measure, dim1..dim5, value`);
filters as `REGION=APAC,EMEA;PERIOD=2026-01`; allocation targets as a comma list. Members containing `,` `;` `=` or a tab are not
supported in these text formats.

Rules enforced on the server: a locked version (Actual) cannot be written by `WriteFacts` or a data action; publish needs an
unlocked target; deleting a version deletes its facts; a story needs a name; a model has 1 to 5 dimensions with unique slots and a measure.

### Planning semantics (JS and ABAP twins)

* Data action steps: COPY (source to target times factor), SCALE (target times factor), DELETE (target slice), ALLOCATE (sum of the
  source slice spread equally over target members of a dimension). The data filter parameter narrows the filter of every step.
* Version: private = copy of a source; publish replaces the target version; revert copies the source again.

## Known gaps

* ABAP: not activated on a system. Likely first findings: the generated CDS/BDEF syntax, `strict ( 2 )` details,
  `EML` field names for the aliased `Value`, the deep delete in `ZCL_SAC_FACT_WRITER`.
* `ODataV4Provider` is not run against a live service. Items to verify: delete-then-create of roots (ETags), child creation by
  association paths, action names with the generated namespace `com.sap.gateway.srvd.zui_sac_o4.v0001.`.
* Authorization is open to every user (`get_global_authorizations` is empty, no DCL). Add owner and sharing rules per customer.
* The deployed app ships the library inside itself (`--include-dependency zsac.lib`); the library can also be deployed on its own.
* Modeller: no undo/redo, grid view, calculated measures (the Calculations view is a placeholder), dimension types beyond Generic, attributes or hierarchies.
* Not included: Predictive Scenarios, Compass, Just Ask, prompt insight widget, scripting (Analytics Designer), server side aggregation.
