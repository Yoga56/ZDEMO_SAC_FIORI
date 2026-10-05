import html
fig_no = [0]
def fig(img, caption):
    fig_no[0] += 1
    return f'<figure><img src="img/{img}"><figcaption>Figure {fig_no[0]}. {html.escape(caption)}</figcaption></figure>'

css = """
@page { size: A4; margin: 18mm 16mm; }
body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1d2d3e; font-size: 10.5pt; line-height: 1.45; }
h1 { font-size: 20pt; color: #0a4d8c; border-bottom: 2px solid #0a6ed1; padding-bottom: 4px; margin-top: 26px; page-break-before: always; }
h1.first { page-break-before: avoid; }
h2 { font-size: 13.5pt; color: #0a4d8c; margin-top: 20px; }
h3 { font-size: 11.5pt; margin-bottom: 4px; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 9.5pt; page-break-inside: auto; }
th, td { border: 1px solid #c9d3de; padding: 4px 7px; text-align: left; vertical-align: top; }
th { background: #e8f0f8; }
tr { page-break-inside: avoid; }
code, pre { font-family: Menlo, Consolas, monospace; font-size: 8.8pt; background: #f2f5f8; border-radius: 3px; }
code { padding: 1px 4px; }
pre { padding: 8px 10px; overflow: hidden; white-space: pre-wrap; border: 1px solid #dde4ec; }
figure { margin: 12px 0 16px; page-break-inside: avoid; text-align: center; }
figure img { width: 100%; border: 1px solid #c9d3de; border-radius: 4px; }
figcaption { font-size: 8.8pt; color: #5a6b7d; margin-top: 4px; }
.cover { height: 235mm; display: flex; flex-direction: column; justify-content: center; }
.cover h1 { border: none; font-size: 30pt; page-break-before: avoid; margin: 0 0 8px; }
.cover .sub { font-size: 14pt; color: #4a5d70; margin-bottom: 28px; }
.ok { color: #107e3e; font-weight: 600; } .warn { color: #b25a00; font-weight: 600; } .bad { color: #b00020; font-weight: 600; }
.note { background: #fff7e6; border-left: 4px solid #e9a100; padding: 6px 10px; margin: 8px 0; }
.toc li { margin: 2px 0; }
"""

def table(head, rows):
    h = "<table><tr>" + "".join(f"<th>{c}</th>" for c in head) + "</tr>"
    for r in rows:
        h += "<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>"
    return h + "</table>"

P = []
P.append(f"""<div class="cover"><h1>Analytics and Planning on Fiori</h1>
<div class="sub">SAP Analytics Cloud style stories, analysis and planning, built as an ABAP RAP backend with a UI5 front end</div>
<table style="width:auto;font-size:10.5pt"><tr><th>Document</th><td>Current state and features</td></tr>
<tr><th>Date</th><td>6 October 2026</td></tr>
<tr><th>Repository</th><td>github.com/Yoga56/ZDEMO_SAC_FIORI, branch main</td></tr>
<tr><th>Package</th><td>ZSAC_FIORI (ABAP), apps zsac.lib and zsac.fiori (UI5 1.136)</td></tr>
<tr><th>Status</th><td>Running on the sample data (mock provider) and on a real S/4HANA Cloud system (OData V4), see chapter 8</td></tr></table>
<p style="margin-top:30px;color:#5a6b7d">Screenshots in this document come from the sample data (mock provider) running locally, unless a caption says otherwise.</p></div>""")

P.append("""<h1>Contents</h1><ol class="toc">
<li>Purpose and scope</li><li>Architecture</li><li>The application: pages and features</li><li>Planning in detail</li><li>Data actions and multi actions</li>
<li>Data sources: CDS views (live and import)</li><li>Analysis helpers: variance explainer and comments</li><li>Backend (ABAP RAP)</li><li>Installation, configuration and operation</li>
<li>Verification status</li><li>Known limits and open items</li><li>Appendix: repository layout, tests, glossary</li></ol>""")

P.append("""<h1 class="first" style="page-break-before:always">1. Purpose and scope</h1>
<p>The application brings the working model of SAP Analytics Cloud (SAC) to a Fiori environment on SAP S/4HANA Cloud: stories (dashboards), the data analyser,
models (datasets), planning with versions, data actions and multi actions, a calendar, and a file catalogue. Everything a user builds, models, stories, data actions, multi actions and
files, is data stored in the backend and edited in the app, so new content needs no code change.</p>
<p>Two design aims run through the whole code base: <b>modular and reusable</b> (the UI5 library <code>zsac.lib</code> can be used by any other Fiori app, widgets and data providers are
plug-ins) and <b>usable without a backend</b> (a mock provider with sample data), so every feature can be tried and tested locally.</p>
<h2>What is in this release</h2>""")
P.append(table(["Area","Content"],[
 ["Home, Files","Landing page with metrics and recent items, file catalogue with folders, favourites, sharing flags, search"],
 ["Stories","Designer and viewer: pages, grid canvas, widgets (charts, KPI, table, input control, text, planning table, triggers, variance explainer), story filters"],
 ["Data Analyser","Free analysis of a model: rows, columns, filters, chart or table"],
 ["Datasets, Modeller","SAC style modeller: measures, dimensions (types, attributes, hierarchies, Date hierarchy), preferences, related objects, CSV import and export, CDS source"],
 ["Planning","Editable planning table with hierarchies, spreading, copy and paste, formulas, distribute values, unpublished buffer with undo and redo, publish, versions, version history, comments on cells"],
 ["Data Actions","List, designer with step flow, parameters, 5 step types, validation, trace (dry run), run history"],
 ["Multi Actions","Designer, parameters mapped onto data actions, 9 step types, validation, run dialog"],
 ["CDS data sources","A model reads a CDS view live, or imports its rows into versions"],
 ["Variance explainer","Why did a measure change between two versions or sets of months, by every dimension"],
 ["Calendar","Planning tasks with assignee, due date and status"]]))
P.append("""<p><b>Out of this release:</b> Predictive Scenarios, Compass, Just Ask, scripting (Analytics Designer), server side aggregation of the sample data, a real connection to PaPM.</p>""")

P.append("""<h1>2. Architecture</h1>
<pre>  Browser (UI5 1.136)
  +--------------------------------------------------------------+
  | zsac.fiori  shell, routes and pages (Home, Files, Stories,   |
  |             Analyser, Datasets, Modeller, Planning, Data     |
  |             Actions, Multi Actions, Calendar)                |
  | zsac.lib    core engines, widgets, designer, planning,       |
  |             providers (Mock, ODataV4), LiveSource            |
  +------------------------------+-------------------------------+
                                 | DataProvider contract
            +--------------------+---------------------+
            |                                          |
     MockProvider                               ODataV4Provider
     (sample data, browser storage)             OData V4 to ZUI_SAC_O4
                                                (RAP on S/4HANA Cloud)

     LiveSource: OData V4 to any CDS view service (read live or import)</pre>""")
P.append(table(["Layer","Contents"],[
 ["core","DataProvider (contract), ProviderRegistry, QueryEngine (aggregation, exception aggregation, hierarchies, Date hierarchy), HierarchyEngine, ModelSchema, FilterEngine, StorySchema, WidgetRegistry, VarianceEngine, Format"],
 ["provider","MockProvider, ODataV4Provider, LiveSource (CDS), FakeODataService (stand-in used by the sample and the tests)"],
 ["planning","PlanBuffer, PlanEditor, Spreader, Distributor, FormulaEngine, PlanGrid, PlanToolbar, PlanPublisher, VersionEngine/Manager/History, DataActionSchema/Engine/Run, MultiActionSchema, StepRunners, ImportEngine, Forecaster, comments"],
 ["widget","SvgChart, KpiTile, PivotTable, WidgetCard, chart builders, the widget registrations (chart.*, kpi, table, filter, text, planning.table, dataaction.trigger, multiaction.trigger, variance)"],
 ["designer","StoryCanvas, StoryViewer, BuilderPanel, FilterEditor"],
 ["app (zsac.fiori)","Component (chooses the provider), pages and controllers, Modeller helpers (master data dialog, CDS source dialog, CSV tools)"]]))
P.append("""<h2>Key design decisions</h2><ul>
<li><b>Provider contract.</b> Pages and widgets only talk to <code>DataProvider</code>. Providers return raw facts; aggregation is the shared <code>QueryEngine</code>, so mock and backend behave identically.</li>
<li><b>Generic fact table.</b> Plan data is one table (version, period, measure, up to five dimension slots, value), so any model fits one RAP schema.</li>
<li><b>Data actions and multi actions run in the browser.</b> The engine works in memory and writes only the difference when every step succeeded.</li>
<li><b>Metadata is data.</b> Stories, models, actions and files are rows (with JSON for the parts that depend on type), edited by the same UI that shows them.</li></ul>""")

P.append("<h1>3. The application: pages and features</h1>")
P.append("<h2>3.1 Home and Files</h2><p>Home shows key metrics, recently changed objects and open tasks. Files lists all objects with folders, favourites, a search, and filters for stories, datasets and actions. Objects are opened, duplicated, moved or deleted from here.</p>")
P.append(fig("01-home.png","Home: metrics, recently changed objects, tasks due"))
P.append(fig("02-files.png","Files: folders, stories, datasets, actions"))
P.append("<h2>3.2 Stories</h2><p>A story is a set of pages on a grid. Widgets come from a registry; each has a builder panel (model, measure, dimensions, filters, options). Story filters (input controls) apply to all widgets; a widget can override them. Stories can be viewed, edited, duplicated and published.</p>")
P.append(table(["Widget","Purpose"],[
 ["chart.bar, line, donut, funnel, sankey, gauge","SVG charts with legends, hierarchy levels and hover values"],
 ["kpi","Value with a comparison against a version, coloured by whether higher or lower is better; a <b>Why?</b> link opens the variance explainer"],
 ["table","Cross-tab with hierarchies, totals, measure format (scale, decimals)"],
 ["filter","Input control for a dimension"],
 ["text","Explanatory text"],
 ["planning.table","Editable planning table (chapter 4)"],
 ["dataaction.trigger, multiaction.trigger","Buttons that run an action and ask for its parameters"],
 ["variance","Headline and top contributors for the difference between two versions, with a link into the explorer"]]))
P.append(fig("03-story-overview.png","Story viewer: KPI tiles, charts, input control"))
P.append(fig("04-story-detail.png","Story page with tables and the variance explainer widget"))
P.append("<h2>3.3 Data Analyser</h2><p>Pick a model, put dimensions on rows and columns, filter, and switch between table and chart. The same query engine as the stories is used, including hierarchies and the Date hierarchy (year, quarter, month).</p>")
P.append(fig("07-analyser.png","Data Analyser"))
P.append("<h2>3.4 Datasets and Modeller</h2><p>Datasets lists the models with their data. The Modeller follows the SAC layout: model structure on the left (measures, dimensions), details on the right.</p>")
P.append(table(["Topic","What is possible"],[
 ["Measures","Aggregation (sum, average, minimum, maximum, count), exception aggregation by dimensions, data type, unit type, scale, decimals"],
 ["Dimensions","Types (Generic, Organization, Account) with preset attributes, members with attributes and texts, one or more hierarchies per dimension, built-in Version, Date (with year > quarter > month) and Measure"],
 ["Preferences","Planning capabilities, data locking, data audit"],
 ["Data management","Preview, CSV import and export of facts, summary per version"],
 ["Related objects","Stories, data actions, multi actions and tasks that use the model"],
 ["CDS source","Live or import connection to a CDS view (chapter 6)"]]))
P.append(fig("15-datasets.png","Datasets"))
P.append(fig("09-modeller.png","Modeller: model structure and details"))

P.append("<h1>4. Planning in detail</h1><p>The planning table (<code>planning.table</code>) is an editable cross-tab. Edits go to an unpublished buffer, are shown immediately in every widget of the page, and reach the backend only on <b>Publish Data</b>.</p>")
P.append(table(["Feature","Behaviour"],[
 ["Editing","Type into a cell. A leaf cell writes that fact; a parent node, quarter or year spreads the value over the facts below it (proportional for sums, equal parts when the sum is zero)"],
 ["Selection","Click, drag, or click a header to select a row, a column or the table; leaf cells only when an axis holds several levels"],
 ["Copy and paste","Ctrl+C and Ctrl+V with the clipboard, plus toolbar buttons as fallback; paste spreads a block starting at the selected cell"],
 ["Formula bar (fx)","Enter a number or an expression for the selected cells: <code>1200</code>, <code>*1.1</code>, <code>+500</code>, <code>-10%</code>, <code>=ACT*1.05</code>; no eval, a small parser"],
 ["Distribute values","Dialog to spread a total over the selection equally, by a reference version or proportionally"],
 ["Undo and redo","Labelled steps; Version History lists the steps and undoes up to a step"],
 ["Publish and discard","Publishes the buffer model by model; a locked version cannot be written; version work asks to publish first"],
 ["Versions","Version Management dialog: public and private versions, create private copy, publish, revert, lock, unlock, delete"],
 ["Version History","Unpublished steps of the session and, where the data source has one, the published change log (Data Audit)"],
 ["Comments","Select one cell and press the comment button: list, add and delete comments; commented cells show a corner marker and the text as a tooltip"]]))
P.append(fig("06-planning-story.png","Planning story: editable table with a commented cell (corner marker)"))

P.append("<h1>5. Data actions and multi actions</h1>")
P.append("<h2>5.1 Data actions</h2><p>A data action is a flow of steps on one model, edited in a designer: the step flow on the left, the editor of the selected object on the right. The designer supports adding, duplicating, moving and deleting steps, undo and redo, Validate, Trace, Run and Save.</p>")
P.append(table(["Concept","Detail"],[
 ["Parameters","Member parameters (a dimension, one or several members, defaults) and number parameters. In steps they are written <code>@Name</code>; the run dialog and the trigger widget ask for them. The list shows where each is used"],
 ["Copy","Rules per dimension (from, to; dates shift by whole years or quarters), aggregate-to, overwrite or append, copy factor"],
 ["Allocation","Spread over target members equally, in proportion to existing values, or like a reference version; clear the source"],
 ["Scale","Multiply the selected values by a factor"],
 ["Fact Deletion","Delete the filtered facts (warning without a filter)"],
 ["Embedded Data Action","Run another action of the same model with its own parameter values; loops are rejected"],
 ["Validate","Errors and warnings per step: names, parameters, unknown dimensions or versions, locked targets, missing allocation fields, unused parameters; errors block Save"],
 ["Trace","Dry run: per step created, updated and deleted counts and sample old and new values; nothing is written"],
 ["Run history","Job Monitor: status, changed, duration, user, parameters, steps"]]))
P.append(fig("10-data-actions.png","Data Actions: list with last run"))
P.append(fig("11-data-action-designer.png","Data action designer: step flow and step editor"))
P.append(fig("12-trace.png","Trace: what every step would change"))
P.append(fig("14-run-history.png","Run History (Job Monitor)"))
P.append("<h2>5.2 Multi actions</h2><p>A multi action runs steps in order; the first failing step stops the run and what earlier steps wrote stays written. Parameters of the multi action are asked for once and mapped onto the parameters of each data action step, onto fixed values, or left at the default of the data action.</p>")
P.append(table(["Step type","What it does"],[
 ["Data Action","Run a data action with mapped parameters"],
 ["Publish Version","Publish a version over another (ids or parameters)"],
 ["Version Management","Create a private version, revert a private version, delete an unlocked version"],
 ["Data Locking","Lock or unlock a version"],
 ["Data Import","Load a CSV (pasted or from a file) into a version with a column mapping, long or wide format, checked row by row, stop or skip on errors, replace or add"],
 ["Predictive","Statistical forecast per member combination: linear trend, moving average, exponential smoothing, same month last year; reports a back-test error"],
 ["API","HTTP call with parameters in the URL, headers and body, expected status, timeout; no cookies are sent"],
 ["PaPM Integration","Calls a PaPM function through a provider hook; the sample data source only simulates it"],
 ["Comment Management","Copy the comments of a version to another version, or delete them"],
 ["Import from Source","Copy rows of the CDS view behind an import model into a version for chosen months"]]))
P.append("<p>Steps have a name, a description and an active switch. Validate checks existence, types, versions and locks and marks problem steps in the flow.</p>")
P.append(fig("13-multi-action-designer.png","Multi action designer with Validate result"))

P.append("<h1>6. Data sources: CDS views (live and import)</h1><p>A model can be connected to a CDS view, standard or custom, exposed as an OData V4 service. The same mapping serves two modes.</p>")
P.append(table(["","Live","Import"],[
 ["Where the data is","In the CDS view, read when a story, table or analysis asks","Copied into versions of a planning model"],
 ["Planning, versions, actions","No: read only, one locked version","Yes, on the copy"],
 ["Currency of the data","Always current","As of the last import"],
 ["Access control","CDS access control of the user who looks","CDS access control of the user who imports"]]))
P.append("""<h2>Mapping</h2><ul><li>Service URL (relative to the server, for example <code>/sap/opu/odata4/sap/zui_sac_gl/srvd_a2x/sap/zui_sac_gl/0001/</code>) and entity set; the dialog reads <code>$metadata</code> and lists the fields.</li>
<li>Period field with its format: <code>202603</code>, <code>2026-03</code> or a date (summed by month).</li>
<li>A field per dimension (with an optional text field) and per measure; a <b>currency field</b> because the service cannot add up an amount without it.</li>
<li>Test reads a few values; <i>Also read the members and the period range</i> fills the dimensions from the source.</li></ul>
<h2>How it works</h2><p>Live reads become <code>$apply=filter(…)/groupby((period, dimensions, currency),aggregate(field with sum as ZSAC_measure))</code>, so the service aggregates and only the result travels.
If the service cannot aggregate it answers 501, 405 or a 400 that says so; the app then reads the rows as they are and aggregates them itself (up to MaxRows, 100 000 by default).
Errors of the service are shown with their details and, for the currency case, a hint on what to set.</p>
<h2>How to expose a CDS view</h2><p>Wrap the standard or custom view in your own aggregating view entity (renaming fields, building the period, grouping), add a service definition and an OData V4 service binding, publish it. On ABAP Cloud only released views may be used. Details and an example for <code>I_JournalEntryItem</code>: <code>sap/docs/cds-sources.md</code>.</p>""")
P.append(fig("08-cds-source-dialog.png","CDS source dialog (sample service): mapping and Test"))
P.append("""<div class="note"><b>Tested against a real service.</b> The G/L view <code>ZI_SAC_GL_PERIOD</code> (service <code>ZUI_SAC_GL</code>, 1 092 rows, four company codes, two currencies, 182 accounts)
was connected as a live model <code>GL_LIVE</code> and as an import model <code>GL_PLAN</code>. Findings from that test (alias clash, currency in the grouping) are fixed.</div>""")

P.append("<h1>7. Analysis helpers: variance explainer and comments</h1><h2>7.1 Variance explainer (“why did it change?”)</h2>")
P.append("""<p>Explains the difference of a measure between two versions or two sets of months, by the members of every dimension. It opens from the <b>Why?</b> link of a KPI tile with a comparison, or from the variance widget.</p>
<ul><li><b>Headline</b> with the two values, the change and the sentence that names the biggest driver and, inside it, the next one (up to three levels, only while one member clearly leads), and what moves the other way.</li>
<li><b>Dimensions ranked</b> by how clearly one member holds the movement; shares are shares of all movement of the dimension, so they stay meaningful when changes cancel out.</li>
<li><b>Bars</b> per member with favourable and unfavourable colours (lower-is-better measures flip them); click a bar to drill into that member, chips remove a step.</li>
<li><b>Fair comparison</b>: when one version covers fewer months (actuals to September, budget to December) only the months both have are compared, with a note and a switch.</li>
<li>A total that nets to zero still explains the parts that differ. Only measures that add up (sum, no exception aggregation) can be explained.</li></ul>""")
P.append(fig("05-variance-explainer.png","Variance explainer: headline, drivers, bars, drill chips"))
P.append("<h2>7.2 Comments on plan cells</h2><p>A comment belongs to the coordinates of a cell (version, period, measure, member of each fixed dimension). The comment button of the planning toolbar opens the list, new comments get the user and time. Comment Management steps copy or delete the comments of a version. Stored in <code>ZSAC_COMMENT</code> (entity <code>CellComment</code>); the sample provider keeps them in browser storage.</p>")

P.append("<h1>8. Backend (ABAP RAP)</h1><p>Sources are generated from one description (<code>sap/tools/sac_spec.py</code>) by <code>gen_rap.py</code> and <code>abapgit_meta.py</code> into the abapGit folder <code>sap/src</code>; handlers and engines are written by hand.</p>")
P.append(table(["Object","Contents"],[
 ["Tables","ZSAC_FILE, STORY, WIDGET, MODEL, DIM, MEASURE, VERSION, FACT, DATAACT, DASTEP, MULTIACT, MASTEP, RUN, COMMENT, CALTASK"],
 ["Business objects","ZR_SAC_* managed (no draft, strict(2)), compositions Story-Widget, Model-Dimension/Measure, DataAction-Step, MultiAction-Step; ZC_SAC_* projections; external numbering, keys mandatory on create"],
 ["Actions","Version: CreatePrivate (static), Publish, Revert. Fact: WriteFacts, DeleteFacts (bulk)"],
 ["Classes","ZCL_SAC_FACT_WRITER, ZCL_SAC_VERSION_ENGINE, ZCL_SAC_SEED (sample data), behavior pools ZBP_R_SAC_*"],
 ["Service","ZUI_SAC_O4 (OData V4 UI) with the binding created in ADT; UI5 app deployed as ZSAC_FIORI, launchpad descriptor in zsac_fiori_ui5r.uiad.json (ignored by abapGit)"],
 ["Rules","Locked versions cannot be written; publish needs an unlocked target; the model structure is checked on save (a model with its dimensions in one request)"]]))
P.append("""<h2>Lessons from the first activation</h2><ul><li>Annotations in a view entity element list take no comma; abstract entity elements end with a semicolon.</li>
<li>Column names LABEL and PAGES are reserved: DIM_LABEL, MEASURE_LABEL, PAGES_JSON.</li><li>A dependent entity cannot have a field named like the etag master field: <code>ChildChangedAt</code>.</li>
<li>A property must not be named like its entity type: FILE_KIND, WIDGET_KIND.</li><li>Roots are written with their children in one request (deep insert) because the server validates a model when it is saved.</li></ul>""")

P.append("<h1>9. Installation, configuration and operation</h1><h2>9.1 Without a backend</h2>")
P.append("<pre>cd sap/app/sacfiori\nnpm install\nnpm run start-mock      # sample data, nothing else needed\nnpm test                # in sap/app/saclib: unit tests of the engines and providers</pre>")
P.append("<h2>9.2 With the backend</h2><ol><li><b>ADT</b>: link the repository to package ZSAC_FIORI and pull (abapGit). Activate all. Where abapGit is not available, create the objects by other means.</li>"
"<li>Run the seed class <code>ZCL_SAC_SEED</code> (F9) in the client you use.</li>"
"<li>Create the service binding <code>ZUI_SAC_O4</code> (OData V4 - UI) on the service definition and publish it. The service path is in <code>manifest.json</code>.</li>"
"<li>The user needs the business role with the IAM apps of the services (custom services on S/4HANA Cloud public edition are otherwise answered with 403).</li>"
"<li><b>BAS</b>: clone the repository, then <code>npm install</code> and one of the start scripts below; open <code>index.html?provider=odata</code>.</li></ol>")
P.append(table(["Script","Backend destination"],[
 ["npm start","my402244 (ui5.yaml)"],
 ["npm run start-402225","S4_402225_DEV (ui5-402225.yaml)"],
 ["npm run start-local, start-mock","None (local proxy or sample data)"],
 ["npm run deploy, deploy-402225","Deploys the app to the ABAP system of the destination (ui5-deploy*.yaml)"]]))
P.append("""<h2>9.3 CDS source on another system</h2><p>Use a relative service URL so the proxy and the destination add host and login. The app and the CDS data can live on different destinations only for testing (second backend entry in <code>ui5.yaml</code>); a deployed app reads the system it is deployed on.</p>
<h2>9.4 Data provider</h2><p>The provider is chosen by the URL parameter <code>?provider=odata</code> or <code>mock</code>, else by <code>sap.ui5/config/provider</code> of the manifest (mock). The header shows the active provider.</p>""")

P.append("<h1>10. Verification status</h1><h2>10.1 Automated tests</h2><p><b>77 unit tests</b> run with <code>node --test</code> (engines, providers, schemas, planning, CDS source, variance, steps); all pass at the time of writing.</p><h2>10.2 Sample data (browser)</h2><p>All pages and dialogs shown in this document were exercised in the browser on the sample data.</p>")
P.append("<h2>10.3 Real system (S/4HANA Cloud, OData V4 through Business Application Studio)</h2>")
P.append(table(["Feature","Result"],[
 ["Backend reads: models, versions, stories, actions, files, runs","<span class='ok'>works</span>"],
 ["Live CDS model on the G/L view: query, story with 2 pages, filters","<span class='ok'>works</span>"],
 ["Save a model with dimensions and measure (deep insert), versions, Files entry","<span class='ok'>works</span>"],
 ["Import from the CDS view, 1 092 values","<span class='ok'>works</span> (11 s)"],
 ["Lock and unlock a version (PATCH), data kept","<span class='ok'>works</span>"],
 ["Data action with parameters, dry run and run (329 facts)","<span class='ok'>works</span>, result checked"],
 ["Multi action steps: Data Action, Data Locking, Predictive, Comment Management, Import from Source, Data Import","<span class='ok'>works</span> (8 steps in 85 s)"],
 ["Multi action steps: API (401 from the target, reported), PaPM (not connected, reported)","<span class='warn'>as designed</span>"],
 ["Cell comments: save, list, copy, delete","<span class='ok'>works</span>"],
 ["Planning edit in the buffer and publish","<span class='ok'>works</span>"],
 ["Variance explainer on versions of the imported model","<span class='ok'>works</span> after a fix"],
 ["Create private version (server action)","<span class='bad'>fails</span> until two ABAP lines are changed by hand, see chapter 11"],
 ["Publish, revert and delete of a private version","<span class='warn'>not tested</span> (needs the fix above)"]]))
P.append("<p>Not tested on the real system: typing into the planning grid in the browser, trigger widgets, file upload, the Calendar.</p>")

P.append("<h1>11. Known limits and open items</h1><h2>Open items</h2><ul>")
P.append("<li><b>ABAP fix on the real system.</b> <code>my402225</code> has no abapGit pull. In <code>ZCL_SAC_FACT_WRITER</code>, method <code>apply</code>, replace both <code>CREATE SET FIELDS WITH creates</code> by <code>CREATE FIELDS ( ModelId VersionId Period Measure Dim1 Dim2 Dim3 Dim4 Dim5 Value ) WITH creates</code>; in <code>ZBP_R_SAC_VERSION</code>, method <code>createprivate</code>, replace <code>CREATE SET FIELDS WITH VALUE #(</code> by <code>CREATE FIELDS ( ModelId VersionId VersionName Category Locked OwnerId SourceVersion Status ) WITH VALUE #(</code>. The repository already has the fix (commit bfdb5d4).</li>")
P.append("<li>The ABAP seed class registers no file entry for its story; the seeded story does not show in Files.</li><li>Authorization is open to every user of the service (no owner or sharing rules, no DCL).</li></ul><h2>Limits</h2><ul>")
for t in ["Data actions run in one browser: large models read all facts of the model, there is no server job.","The step flow of data and multi actions is linear (no branches or loops); Advanced Formulas, Currency Conversion and cross-model copy are not included.",
"Predictive is a plain statistical forecast (four methods, one back-test figure for the whole step), not SAP Smart Predict.","The API step runs in the browser: CORS applies, no cookies or stored credentials; headers are stored with the step and must not hold secrets.",
"PaPM is only simulated by the sample data source; a real connection means overriding <code>runPapm</code> in a provider.","Locking is per version, not per slice of data.",
"CDS: members are read once when the dialog is confirmed; amounts of different currencies in one cell add up unless the currency is a dimension; the sum of all G/L accounts is zero because entries balance; hierarchies, texts and attributes are defined in the Modeller, not read from the view.",
"Comments belong to cell coordinates (no replies or resolve state) and exist for the planning table only.","Modeller: no calculated measures (Calculations view is a placeholder), one hierarchy per dimension in a widget, no undo in the Modeller.",
"Not included: Predictive Scenarios, Compass, Just Ask, prompt insight widget, scripting, server side aggregation of the sample data."]:
    P.append(f"<li>{t}</li>")
P.append("</ul>")

P.append("""<h1>12. Appendix</h1><h2>Repository layout</h2><pre>.abapgit.xml                abapGit configuration (folder /sap/src/, ignores binding, UIAD, BSP)
README.md                   overview, features, deployment steps
sap/src/                    ABAP sources, package ZSAC_FIORI (generated and hand written)
sap/app/saclib/             UI5 library zsac.lib (src/zsac/lib, test/node)
sap/app/sacfiori/           UI5 app zsac.fiori (webapp, ui5*.yaml, uiad json)
sap/tools/                  sac_spec.py, gen_rap.py, abapgit_meta.py, make_mock_data.py
sap/docs/                   specifications and this document</pre>
<h2>Further documents</h2><ul><li><code>sap/docs/technical-specification.md</code>: details of every engine and the backend</li><li><code>sap/docs/cds-sources.md</code>: exposing and connecting CDS views</li>
<li><code>sap/docs/widget-authoring.md</code>, <code>provider-authoring.md</code>: how to add a widget or a data source</li><li><code>sap/docs/SAC_Overview_and_PowerBI_Comparison.md</code>: SAC and Power BI compared</li></ul>
<h2>Glossary</h2>""")
P.append(table(["Term","Meaning"],[
 ["Model, dataset","Dimensions and measures with their data (SAC: model)"],["Version","A set of plan values: actual, budget, forecast, private"],["Story","A dashboard of pages and widgets"],
 ["Data action","Flow of steps that changes plan data, with parameters"],["Multi action","Ordered steps that run data actions, version work, imports and calls"],
 ["CDS view","ABAP Core Data Services view; exposed as an OData V4 service to be used here"],["Live / Import","Read the CDS view on demand / copy its rows into versions"],
 ["Deep insert","One request that creates a business object together with its children"]]))

doc = f"<!doctype html><html><head><meta charset='utf-8'><title>Analytics and Planning on Fiori</title><style>{css}</style></head><body>{''.join(P)}</body></html>"
open("SAC_Fiori_Documentation.html","w",encoding="utf-8").write(doc)
print("html written", len(doc))
