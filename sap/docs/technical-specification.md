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
| planning | `DataActionSchema`, `MultiActionSchema`, `StepRunners`, `ImportEngine`, `Forecaster`, `DataActionEngine`, `DataActionRun`, `VersionEngine`, `PlanBuffer`, `Spreader`, `PlanEditor`, `PlanPublisher`, `PlanGrid`, `PlanToolbar` | planning semantics, the unpublished buffer and the editable cross-tab |
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
| Tables | `ZSAC_FILE`, `_STORY`, `_WIDGET`, `_MODEL`, `_DIM`, `_MEASURE`, `_VERSION`, `_FACT`, `_DATAACT`, `_DASTEP`, `_MULTIACT`, `_MASTEP`, `_RUN`, `_CALTASK` |
| BOs | `ZR_SAC_*` managed (no draft: the freestyle app edits directly), compositions Story-Widget, Model-Dimension/Measure, DataAction-Step, MultiAction-Step; `ActionRun` is the run history; `ZC_SAC_*` projections |
| Actions | Version: `CreatePrivate` (static), `Publish`, `Revert`; Fact: `WriteFacts`, `DeleteFacts` (static, bulk). Data and multi actions have no server action: they run in the client (see Data actions) |
| Engines | `ZCL_SAC_FACT_WRITER` (all fact writes go through the Fact BO), `ZCL_SAC_VERSION_ENGINE` |
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
* **Data action trigger widget.** A button with the inputs of the declared parameters of the action (defaults filled in) and, optionally, extra data filter
  dimensions. A data action runs on published data, so unpublished changes are published first after a confirmation; the page reloads afterwards.
* **Version Management** (`VersionManager`, toolbar button *Versions*). Public and private versions of the model in two lists with category filter, search and a
  "hold data" switch. Per version: Details (values, periods, owner, source), Rename, Lock or Unlock (when the model has Data Locking), Copy as private version, Delete
  (a locked version must be unlocked first; deleting removes its numbers); for private versions Publish to a public version and Revert to source. A blank public
  version is created with a name, an id and a category. Everything that reads published data asks to publish unpublished changes first.
* **Version History** (`VersionHistory`, toolbar button *History*). *This session* lists the unpublished steps with time, what was done ("Typed 1,234 into APAC /
  Cloud ERP / Direct · Q3 2026", "Paste into 6 cells", "Distribute 90000 over 3 cells") and the number of values, with Undo to here and Redo to here;
  *Published* shows the model's Data Audit log where the data source keeps one. Both can be filtered by version.
* **Planning page.** Model, version and measure pickers around the same planning table widget; version work (private copy, publish a version, revert, lock,
  data actions) asks to publish the buffer first.

* **Selection, Copy, Paste.** Click a cell, then shift+click (or drag) to select a block; click a row label to select the row, a column header to select its column(s) (a spanning header selects all its columns, the top-left corner selects the table; shift+click extends); the planning toolbar then enables Distribute Values, Copy and
  Paste. Ctrl/Cmd+C copies a block of two or more cells as tab separated text (plain numbers, the format spreadsheets exchange); Ctrl/Cmd+V pastes
  tab separated text with its top left corner on the selected cell, from this grid or from a spreadsheet (`1,234.5`, `1.234,5` and `(200)` are read as numbers,
  empty cells are left alone). One pasted value fills the whole selection. Every pasted cell follows the typing rules (leaf write, spread, refusal) and the paste is
  one undo step; cells that cannot be planned are skipped and counted. The toolbar's Copy and Paste buttons do the same through the browser clipboard, falling back to
  the last copy of the session.
* **Distribute Values (`DistributeDialog`, `Distributor`).** Splits a value over the selected plannable cells: equally, in proportion to their current values, or in
  proportion to the same cells in another version (for example last year's actuals as the seasonal pattern); optionally only cells that are empty or zero. The
  shares are rounded to the measure's decimals and add up to the value exactly (the remainder goes to the heaviest cell). A block that mixes a total and the numbers
  below it is applied in reading order, so select cells of one level.

* **Header selection.** A row, a column or the whole table picked by its header acts on the numbers, not on the totals in between: along an axis that holds
  several cells the aggregated ones (parent nodes, years, quarters) are left out of Distribute Values, the formula bar and Copy-independent actions (Copy still takes
  everything shown). Selecting a single aggregated row or column keeps it, so a year or a region total can be set by selecting it.
* **Formula bar** (`FormulaEngine`, toolbar button *fx*). Shows the label and plain value of the selected cell; Enter applies the entry to every plannable selected cell
  as one undoable step (history entry "Formula =ACT*1.05 on 3 cells"). Entries: a number (`1200`), arithmetic with `+ - * / ^` and parentheses
  (`=120000*1.05`), a leading operator on the cell's own value (`*1.1`, `+500`, `-10%`), `current` for the cell's value, and a **version id** for the same cell in
  that version (`=ACT*1.05`, `=ACT+10%`). A percentage after + or - is relative to the left side (`+10%` is x1.1), after * a fraction. The same entries typed straight into
  a cell work too (a number as before; text starting with `=` or an operator and not just a signed number is calculated). No `eval`: a small parser, with errors
  reported as messages. A reference needs a table with a single version and the version must exist; references to members or other measures are not supported.

### Planning semantics (JS and ABAP twins)

* Data actions: see the next section.
* Version: private = copy of a source; publish replaces the target version; revert copies the source again.

### Multi actions

`MultiActionSchema` (shape, validation, parameter mapping) is shared by every provider; `DataProvider.runMultiAction` runs it client side through `executeDataAction` and `publishVersion`.
A multi action has its own **parameters** (`{Id, Prompt, Type: MEMBER|NUMBER, ModelId, DimId, Multi, Default}`, the model is needed because a multi action spans models) which the
run dialog asks for once. A **Data Action step** has a `ParamMap` `{dataActionParam: value | "@multiParam"}`; a parameter left out uses the default of the data action, so one
multi action parameter (for example the version) can feed several steps. A **Publish Version step** takes source and target version as ids or `@multiParam`.
A **Version Management step** has an operation: CREATE_PRIVATE (copy of `SourceVersion` named `VersionName`), REVERT (a private `Version`) or DELETE (an unlocked `Version`).
A **Data Locking step** has the operation LOCK or UNLOCK on a `Version`; the lock is the `Locked` flag of the version, which stops planners and data actions writing to it
(a warning shows when Data Locking is not switched on in the model). Versions of these steps are ids or `@multiParam`.
Steps have name, description and an active switch (inactive steps are skipped). Steps run in order, the first failing step stops the run and earlier steps stay written.
Validate checks the name, parameters (id, model, dimension, number default), that data actions exist and their parameters are mapped to parameters of the same type and
dimension, that versions exist, the publish target is not locked and differs from the source; unused parameters are warnings and a parameter used nowhere shows in the list.

* **Data Import** (`ImportEngine`): a CSV (header line; one value per line, or one column per measure; comma, semicolon or tab; pasted or loaded from a file and stored in the step) and a mapping of every column to
  Version, Period, Measure, Value or a dimension (guessed from the column names). What the file lacks is fixed in the step: the version and the measure (ids or parameters).
  A column mapped to `MEASURE:<id>` makes the file wide (empty cells give no value; it cannot be combined with a Value column). Every row is checked (member exists, period `YYYY-MM` inside the model, version exists and is not locked, value is a number); rows of the same cell add up. `OnError` FAIL (default) stops the
  step and imports nothing, SKIP imports the valid rows and reports the first rejected line. Mode UPDATE replaces the value of a cell, ADD adds to it.
* **Predictive** (`Forecaster`): a statistical forecast, not Smart Predict. For every combination of members of the source version and measure it takes the monthly history
  (`HistoryFrom`..`HistoryTo`) and writes `ForecastFrom`..`ForecastTo` into the target version. Methods: LINEAR (least squares line), MOVING_AVERAGE (`Window` months, flat), EXP_SMOOTHING (`Alpha`, flat),
  SEASONAL_NAIVE (same month a year earlier, needs 12 months). Missing months are left out of the fit; a series with too little history is skipped and counted. The log also reports a back-test: the last quarter of the history (1 to 3 months) is forecast from the months before it
  and compared with what happened, as the summed absolute error over the summed actuals of all series. Periods, versions and measure can be parameters.
* **API**: `Method`, `Url`, `Headers`, `Body`, expected status (`2xx` or `200,201`) and timeout. `@Name` in the URL, headers and body is replaced by the value of the parameter (several members are
  joined with a comma). The call is made by `DataProvider.callApi` with `fetch`: no cookies or credentials, so the endpoint must allow the origin (CORS); the log shows method, URL without query
  string and status. Headers are stored with the step, so they must not hold secrets.
* **PaPM Integration**: `Environment`, `FunctionId`, `Parameters` (values may be `@Name`) are handed to `DataProvider.runPapm`. The base class refuses ("not connected"); `MockProvider`
  simulates a successful run. A real connection is implemented by overriding `runPapm` in a provider (for example through a BTP destination).
* **Comment Management**: COPY the comments of one version to another (added to the existing ones) or DELETE all comments of a version, through `copyComments` / `deleteComments`
  (generic over `listComments`, `saveComment`, `deleteComment`; a source without `capabilities.comments` refuses the step).
* **Cell comments** (planning table): a comment is `{Id, ModelId, VersionId, Period, Measure, Dims: {DIM: member}, Text, Author, At}` and belongs to the coordinates of a cell (`PlanGrid.cellCoords`:
  version and measure must be fixed by the table, the period is the member the cell shows, a year or quarter included). The toolbar button *Comment* (one selected cell) opens `CommentDialog`
  (list, add, delete); commented cells get a corner marker and the text as tooltip. A layout that moves a dimension to the filter changes the coordinates, so comments show only on cells with the same coordinates.
  Backend: `ZSAC_COMMENT` (entity `CellComment`, author and time are the creation user and time); `MockProvider` keeps them in the collection `comments`.
* **Multi action trigger widget** (`multiaction.trigger`): a button that opens the run dialog of a multi action (parameters, then the steps); the multi action lists the stories that use it under Settings, Used In.

Runs appear in the Run History (Job Monitor) of the Data Actions page. Backend: `ZSAC_MULTIACT.PARAMETERS` and `ZSAC_MASTEP` with name, description, active and `CONFIG` (JSON).

### Data actions

`DataActionSchema` (shape, defaults, validation) and `DataActionEngine` (pure) are shared by every provider. **Execution is client side**: `DataProvider.executeDataAction`
reads the facts of the model, runs the steps in memory and writes only the difference (`writeFacts`/`deleteFacts`) when every step succeeded, so a failing step
or a locked version leaves the data as it was. `previewDataAction` is the same run without the write (Trace). `runMultiAction` runs its steps through the same path.
Every real run is recorded (`_putRun`, entity `ActionRun`) and shown in the Run History tab.

* **Action** = `{Id, ModelId, Name, Description, Parameters[], Steps[]}`. **Parameter** = `{Id, Prompt, Type: MEMBER|NUMBER, DimId, Multi, Default}`. A value written
  `@Id` in a filter, copy rule, factor, target version, allocation member or embedded `ParamMap` is replaced by the value entered at run time (an empty member
  parameter means no restriction). The run dialog and the trigger widget prompt for the parameters.
* **Steps** (all have Name, Description, Active; inactive steps are skipped; every step has a filter of the facts it works on):
  COPY (rules per dimension `{Dim, From, To}`; dates shift by whole years or quarters; AggregateTo sums onto one member; WriteMode OVERWRITE or APPEND; Factor),
  SCALE (Factor), DELETE (the filtered facts), ALLOCATE (spread over TargetMembers of TargetDim in TgtVersion by Driver EQUAL, PROPORTIONAL to existing values or
  REFERENCE version; nodes are expanded to leaves; ClearSource), EMBED (runs another action of the model with a ParamMap; at most 5 levels, loops are rejected).
* **Validate** reports errors (name, parameters, unknown dimensions or versions, locked target, missing allocation fields, embedded loop ...) and warnings
  (unused parameter, delete without filter); Save is blocked by errors. **Trace** shows per step created/updated/deleted counts and sample old/new values.
* **Backend**: `ZSAC_DATAACT.PARAMETERS` (JSON) and `ZSAC_DASTEP` with name, description, active and `CONFIG` (JSON of everything specific to the step type),
  so a new step option needs no new column; `ZSAC_RUN` keeps the history. There is no ABAP twin of the engine.

## Known gaps

* ABAP: not activated on a system. Likely first findings: the generated CDS/BDEF syntax, `strict ( 2 )` details,
  `EML` field names for the aliased `Value`, the deep delete in `ZCL_SAC_FACT_WRITER`.
* `ODataV4Provider` is not run against a live service. Items to verify: delete-then-create of roots (ETags), child creation by
  association paths, action names with the generated namespace `com.sap.gateway.srvd.zui_sac_o4.v0001.`.
* Authorization is open to every user (`get_global_authorizations` is empty, no DCL). Add owner and sharing rules per customer.
* The deployed app ships the library inside itself (`--include-dependency zsac.lib`); the library can also be deployed on its own.
* Modeller: no undo/redo, grid view, calculated measures (the Calculations view is a placeholder). Dimension types preset attributes only; no time dimension, no level-based or ragged hierarchy rules, one hierarchy per dimension in a widget.
* Planning: formulas cannot refer to members, other measures or other cells; keyboard copy and paste need the browser's clipboard events (the toolbar buttons are the fallback); the version panels are dialogs, not SAC's side panel, and "hold data" means the version has facts, not that a table uses it; the unpublished buffer is per browser page (not shared, not saved).
* Multi actions: the Predictive step is a plain statistical forecast (four methods, a back-test figure for the whole step, no per-series accuracy, no training); the API step runs in the browser (CORS, no stored credentials, no response mapping); the PaPM step is only simulated by the sample data source; comments are per cell coordinates (no replies, no resolve state, no comments on charts or tables other than the planning table); the CSV of an import is stored inside the step (no file store, no big files); locking is per version, not per slice of data (no lock regions, owners or states); `ODataV4Provider.saveVersion` now changes the version with a PATCH (a delete and create would fire the `DeleteFacts` determination of the Version BO), which is unverified against a live service; a data action writes straight to its version, so there is no "publish after execution" option per step; a multi action is used from a story through the trigger widget only (no schedule, no calendar task).
* Data actions: no Advanced Formulas, no Currency Conversion, no cross-model copy; the run is client side (one browser, no server job, large models read all facts of the model); the step flow is linear (no branches or loops).
* Not included: Predictive Scenarios, Compass, Just Ask, prompt insight widget, scripting (Analytics Designer), server side aggregation.
