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
| core | `DataProvider`, `ProviderRegistry`, `QueryEngine`, `HierarchyEngine`, `FilterEngine`, `ModelSchema`, `StorySchema`, `WidgetRegistry`, `EventBus`, `Format` | contracts and pure logic, no UI |
| provider | `MockProvider`, `ODataV4Provider`, `mockdata/*.json` | data sources |
| planning | `DataActionEngine`, `VersionEngine`, `PlanBuffer`, `Spreader`, `PlanEditor`, `PlanPublisher`, `PlanGrid`, `PlanToolbar` | planning semantics, the unpublished buffer and the editable cross-tab |
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
| Dimension | `DimId`, `Label` (the description), `Slot`, `Type` (GENERIC, ORGANIZATION, ACCOUNT), `Attributes` (master data columns, preset by type), `Members` (`Id`, `Text`, `Props`), `Hierarchies`; Version and Date are shown as built-in dimensions |

`QueryEngine.aggregate` applies the measure's aggregation to every cell and total (an average total is the average of the facts, not of the cell
averages). With an exception aggregation the facts are first reduced along the exception dimensions, then the standard aggregation applies to
the rest. Tables use the measure's scale and decimals unless the widget overrides them, KPI tiles can use them (`Number format: Measure format`),
the planning grid uses the decimals. `ModelSchema` holds the defaults and the validation the Modeller runs before saving.

### Hierarchies

A hierarchy is `{Id, Label, Parents: {childId: parentId}}` on the dimension; members without a parent are roots, several hierarchies per dimension are
allowed, validation rejects unknown parents and cycles. A query names the hierarchy per dimension (`Hierarchies: {REGION: "GEO"}`); the dimension on that axis
is then expanded to the nodes: every fact counts for its member and each ancestor, so a parent shows the total of its subtree, while grand and axis totals
still count each fact once. Where it shows:

* **Tables** render the tree with indentation and expand/collapse per node (`ExpandLevel` sets the levels open at first).
* **Charts** show one level (`Props.Level`, 1 = top): the nodes at that depth plus shallower leaves, so no value is counted twice.
* **Filters**: selecting a node selects its whole subtree.
* **Planning** can group the rows under a hierarchy (toolbar select): parent nodes are read-only subtotal rows that collapse, leaf rows stay editable; the
  add-row dialog offers leaf members only.

The dimension type presets the attribute set (Organization: Owner, Currency; Account: Account type, Unit) and can be changed at any time. Attributes are master
data columns; they are not used for filtering or calculation yet (no account-type sign rules, no time dimension).

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

### Planning session (stories and the Planning page)

* **Unpublished buffer.** Typing goes to a `PlanBuffer` (one per story page or per Planning page), not to the provider. The buffer holds the changed facts,
  supports undo and redo (a spread over many facts is one step) and warns before the page is left. **Publish Data** (`PlanPublisher`) writes the
  changes model by model through the provider (and into the audit log) and empties the buffer; Discard drops it.
* **Everything on the page shows the buffer.** Charts, KPIs and tables query with the unpublished changes applied; the planning grid marks changed cells.
* **Planning table (`PlanGrid`).** Rows and columns are any dimensions, each optionally on a hierarchy; the Date dimension has the built-in hierarchy
  `TIME` (year, quarter, month) with expand and collapse in the column headers. Attribute columns come from the row dimension's master data.
* **Editing rules (`PlanEditor`).** A cell is editable when the table is editable, the model has planning enabled, exactly one version and one measure are in
  scope, the version is not locked and the measure is not a count or an exception-aggregated measure. A value typed into a leaf cell writes that fact; into an
  aggregated cell (parent node, year, quarter) it is **spread** over the facts below (`Spreader`: proportional for SUM, equal parts when the current sum is
  zero, every fact takes the value for AVG/MIN/MAX). An empty cell creates a fact only when every dimension has one leaf member. The Add row action creates
  zero facts for every month.
* **Data action trigger widget.** A button with parameter inputs (members of chosen dimensions become the data filter parameter). A data action runs on
  published data, so unpublished changes are published first after a confirmation; the page reloads afterwards.
* **Planning page.** Model, version and measure pickers around the same planning table widget; version work (private copy, publish a version, revert, lock,
  data actions) asks to publish the buffer first.

* **Selection, Copy, Paste.** Click a cell, then shift+click (or drag) to select a block; the planning toolbar then enables Distribute Values, Copy and
  Paste. Ctrl/Cmd+C copies a block of two or more cells as tab separated text (plain numbers, the format spreadsheets exchange); Ctrl/Cmd+V pastes
  tab separated text with its top left corner on the selected cell, from this grid or from a spreadsheet (`1,234.5`, `1.234,5` and `(200)` are read as numbers,
  empty cells are left alone). One pasted value fills the whole selection. Every pasted cell follows the typing rules (leaf write, spread, refusal) and the paste is
  one undo step; cells that cannot be planned are skipped and counted. The toolbar's Copy and Paste buttons do the same through the browser clipboard, falling back to
  the last copy of the session.
* **Distribute Values (`DistributeDialog`, `Distributor`).** Splits a value over the selected plannable cells: equally, in proportion to their current values, or in
  proportion to the same cells in another version (for example last year's actuals as the seasonal pattern); optionally only cells that are empty or zero. The
  shares are rounded to the measure's decimals and add up to the value exactly (the remainder goes to the heaviest cell). A block that mixes a total and the numbers
  below it is applied in reading order, so select cells of one level.

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
* Modeller: no undo/redo, grid view, calculated measures (the Calculations view is a placeholder). Dimension types preset attributes only; no time dimension, no level-based or ragged hierarchy rules, one hierarchy per dimension in a widget.
* Planning: no formula bar yet; no select by header; keyboard copy and paste need the browser's clipboard events (the toolbar buttons are the fallback); Version Management and Version History are toolbar buttons and the Data Audit dialog, not SAC's dialogs; the unpublished buffer is per browser page (not shared, not saved).
* Not included: Predictive Scenarios, Compass, Just Ask, prompt insight widget, scripting (Analytics Designer), server side aggregation.
