# ZDEMO_SAC_FIORI: SAC-style analytics and planning on Fiori

A modular, customizable take on SAP Analytics Cloud for SAP Fiori: **stories (dashboards)** and **planning objects**
(models, versions, data actions, multi actions, calendar) are created and changed by the user in the app, not in code.
UI5 front end, ABAP RAP back end (ABAP Cloud, S/4HANA Cloud Public Edition or BTP ABAP environment), written to the
same pattern as [Estate Command](https://github.com/Yoga56/Estate-Command) (`sap/` folder).

The app follows the SAC navigation (Home, Files, Stories, Data Analyser, Datasets, Planning, Data Actions, Multi Actions,
Calendar) and the Q3 2026 release highlights: Sankey, funnel and gauge charts, search and replace in filter values,
data filter parameters for data actions. Predictive Scenarios, Compass and Just Ask are not in this release (the
widget registry and provider contract are the extension points).

## What a user can create

| Object | Where | What it is stored as |
|---|---|---|
| Story (dashboard) | Stories | pages and widgets (type, grid position, binding, properties) as data |
| Planning model | Modeller | SAC-style editor: measures (data type, aggregation, exception aggregation, units, scale, decimals), dimensions (types Generic, Organization, Account) with attributes, members and parent/child hierarchies, model preferences (planning, data locking, data audit), related objects |
| Data of a model | Datasets, Modeller (Data Management) | preview, CSV import and export |
| Version | **Version Management** panel (Planning page and any story with a planning table) | public (Budget, Forecast, Actual) or private what-if copy; create, rename, lock, copy, publish, revert, delete; **Version History** lists the session's unpublished steps (undo to any step) and the published change log |
| Plan data | Planning page, or a **Planning table** widget in any story | typed into an editable cross-tab (any dimensions on rows and columns, Date hierarchy year > quarter > month, parent nodes spread their value over the numbers below); changes stay **unpublished** (undo, redo) until Publish Data; select cells (or a whole row or column by its header) to **Distribute Values** (equally, proportionally, or like another version), to **copy and paste** to and from spreadsheets, or to apply a value or **formula** from the formula bar (`*1.1`, `+10%`, `=ACT*1.05`) |
| Data action | Data Actions (list, designer, Job Monitor run history); a **Data action trigger** widget runs one from a story and asks for its parameters | designer with step flow, undo/redo, Validate and Trace (dry run); member and number parameters (`@Name`); steps Copy (per-dimension from/to rules, aggregate-to, overwrite or append, factor), Allocation (equal, proportional, reference version), Scale, Fact Deletion, Embedded Data Action |
| Multi action | Multi Actions (list, designer) | designer like the data action designer (step flow, undo/redo, Validate); parameters asked for once at run time and mapped onto the parameters of each data action step; steps Data Action, Publish Version, Version Management (create private version, revert, delete), Data Locking (lock, unlock a version), Data Import (CSV into a version with column mapping), Predictive (statistical forecast), API (HTTP call), PaPM Integration (simulated by the sample data source) and Comment Management (copy, delete comments of a version); inactive steps are skipped |
| Task | Calendar | submit, approve, reject, tied to a model and version |

Analysis (Data Analyser) is one widget configured live by the same builder panel the story designer uses, so any
analysis becomes a story widget with one click.

## Run it (no SAP system needed)

```bash
cd sap/app/sacfiori
npm install
npm run start-mock        # http://localhost:8080/index.html, sample data in the browser (localStorage)
```

`npm test` in `sap/app/saclib` runs the unit tests (query engine, data action and version engines, mock provider, chart builders).
The reset button in the shell restores the sample data.

## Layout

```
.abapgit.xml                 abapGit: sources in /sap/src/
sap/
  src/                       ABAP Cloud sources, package ZSAC_FIORI (RAP BOs, service ZUI_SAC_O4, engines, seed)
  app/saclib/                UI5 library zsac.lib: contracts, engines, providers, widgets, designer, planning grid
  app/sacfiori/              UI5 app zsac.fiori: shell and pages, consumes zsac.lib
  tools/                     sac_spec.py (one description of the backend), gen_rap.py, abapgit_meta.py, make_mock_data.py
  docs/                      technical specification, widget and provider authoring, SAC overview
```

## Modular and reusable

* `zsac.lib` has no app logic. The app only composes it: `ProviderRegistry` picks the data source, `WidgetRegistry` lists
  the widgets, pages call the library controls.
* **Data providers**: one contract (`DataProvider`), `MockProvider` (tested) and `ODataV4Provider` (RAP service, not run
  against a live system in this repository). `?provider=odata` or the manifest setting switches. A new source (S/4 analytical
  query, Datasphere) is a new class registered with `ProviderRegistry.register`.
* **Widgets**: one `WidgetRegistry.register(type, { create, builder, defaults, size })` call adds a widget to the palette,
  the builder panel, the viewer and the analyser. See [docs/widget-authoring.md](sap/docs/widget-authoring.md).
* **Embed a dashboard** in any Fiori app: `new zsac.lib.designer.StoryViewer({ provider, storyId })`.

## Deploy to ABAP (S/4HANA Cloud Public Edition or BTP ABAP)

Same flow as Estate Command.

1. ADT: create package `ZSAC_FIORI`. *abapGit Repositories* view: link this repository to the package, **Pull**.
2. Activate all (Ctrl+Shift+F3). If mass activation complains, in this order: tables, `ZA_SAC_*` abstract entities,
   `ZR_SAC_*` views, `ZC_SAC_*` views, `ZCL_SAC_FACT_WRITER`, `ZCL_SAC_VERSION_ENGINE`,
   behavior definitions `ZR_SAC_*` then `ZC_SAC_*`, `ZBP_R_SAC_*`, `ZUI_SAC_O4`, `ZCL_SAC_SEED`.
3. Create the service binding `ZUI_SAC_O4` (OData V4 - UI) on the service definition and publish it. The binding is ignored by
   abapGit on purpose.
4. Run `ZCL_SAC_SEED` with F9 for the sample models, plan data, story and actions.
5. UI: `cd sap/app/sacfiori && npm run deploy` (builds with the library included in the app, then `fiori deploy`; target
   destination and package are in `ui5-deploy.yaml`). Set `"provider": "odata"` in `manifest.json` (`sap.ui5/config`) or open with `?provider=odata`.
   In BAS use `npm start`; from a laptop `npm run start-local`.
6. `sap/src/zsac_fiori_ui5r.uiad.json` is the Launchpad app descriptor (create the app descriptor item in ADT from it).

The ABAP sources were written without access to a system: activate, fix what the system reports and tell me. The first
things to check are listed in [docs/technical-specification.md](sap/docs/technical-specification.md#known-gaps).

Regenerate backend sources after changing `sap/tools/sac_spec.py`:

```bash
python sap/tools/gen_rap.py && python sap/tools/abapgit_meta.py
```
