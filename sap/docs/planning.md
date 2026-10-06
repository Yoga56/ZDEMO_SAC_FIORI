# Planning page

The Planning page (and the planning table widget in stories) follows SAC's planning table. Code: `zsac.lib/planning` and the page in `sacfiori` (`Planning.controller.js`).

## What was already there
Typing into any cell (a total spreads over the values below it), hierarchies with expand and collapse (Date as year, quarter, month), attribute columns, Undo and Redo, Publish Data and Discard, Copy and Paste (also from a spreadsheet), the formula bar (`fx`: `1200`, `*1.1`, `+500`, `-10%`, `=ACT*1.05`), Distribute Values (equally, proportionally, or like another version), comments on cells, Version Management and Version History, private versions, data actions with data-filter parameters.

## Data locking
A model with **Data Locking** on (Modeller, Model tab) has **lock regions**, edited with the lock button of the planning toolbar.

* A region is a slice of the data: members of any dimension, versions and periods. A year, a quarter or a hierarchy node stands for everything below it.
* State **Open**, **Restricted** (only the region's owners may change it) or **Locked** (nobody). Data outside every region has the model's default state (Open or Locked).
* Where regions overlap the strictest rule wins: one Locked region locks the value, every Restricted region must name the user.
* In the table locked cells are hatched, restricted ones tinted and a total over both is striped; the tooltip names the region. Typing into a locked cell, or into a total with a locked value below it, is refused with the reason.
* Every write is checked: Publish Data, data actions, multi actions, imports and publishing a private version (checked on what changes in the target). Nothing is written when one value is refused. Private versions are not locked. Writing the value a cell already has is not a change.
* Regions are stored with the model (columns `LOCK_DEFAULT` and `LOCK_JSON` of `ZSAC_MODEL`), so whoever may edit the model edits them and the sharing of the model applies.

The same checks run on the server: `ZCL_SAC_DATA_RULES` is called by the actions `WriteFacts`, `DeleteFacts` and `Publish`, so a client that does not use zsac.lib is held to the same rules. The OData provider stores, next to the regions the user edits, a server copy with every slice already resolved to the members it covers (hierarchy nodes, quarters and years are resolved when the model is saved, so change a hierarchy and save the model again to refresh the regions that use it). The ABAP class is written without a system to activate it on: the first things to check are the `xco_cp_json` reading of `LOCK_JSON` and `VALID_JSON` (`{"regions": [...], "srv": [...]}` and `{"rules": [...], "srv": [...]}`) and the types of the fields it reads.

## Table functions
The table button of the toolbar opens **Table Functions** for the table the planner works in. They change the view, never the data.

* **Swap rows and columns**.
* **Hide rows where every value is zero or empty**.
* **Sort rows by** a column, ascending or descending; with a hierarchy the children are sorted under their parent.
* **Scale** (thousands, millions, billions) and **decimals**. What is typed into a scaled table is the scaled number (1.5 in thousands plans 1,500).
* **Variance** to another version: absolute, percent or both, shown as extra columns after each column (needs a table on one version).
* **Thresholds**: rules such as *values below 0 are Bad*, *between 0 and 10 are Critical*, *at least 100 are Good*; the first match colours the cell.

A story's planning table takes the same settings from its builder panel (hide zero rows, swap, scale, decimals, variance to a version, thresholds written as `< 0 : bad; 0..10 : critical; >= 100 : good`). On the Planning page the settings belong to the model and are kept with a bookmark. The **Refresh** button reloads the data.

## Bookmarks
The **Bookmarks** menu of the Planning page saves the current view (model, version, measure, hierarchy, comparison, table functions) under a name (the same name replaces it), applies it with one click, and can make one bookmark the **default** that opens with the page. Bookmarks are the user's own, kept in the browser per user.

## Validation rules
The check button of the toolbar opens **Validation Rules**: a rule has a measure (or all), the slice of data it covers, a minimum and/or a maximum, and a level. An **error** refuses the value (typed, pasted, applied from mass entry, written by an action or published; nothing is written when one value is refused); a **warning** lets it through and tells the planner. Rules are stored with the model (`ZSAC_MODEL-VALID_JSON`) and checked on the server by `ZCL_SAC_DATA_RULES`. Writes into private versions are not checked (they are when the version is published).

## Mass data entry
The **Mass Entry** toggle lets the planner type many values: nothing is spread or recalculated until **Apply**, which writes them as one undoable step (with the same lock and validation checks as typing); the typed cells are outlined. Switching it off applies what is waiting.

## Calculations in the table
Table Functions also holds **calculations**: a column for each table column worked out from the cell's own value (`current`) and the same cell in other versions, for example `Growth % = BUD/ACT-1` (a `%` after the name shows a percentage). A division by zero leaves the cell empty; an unknown version name shows `#NAME`. In a story's planning table they are written in the builder panel as `Growth % = BUD/ACT-1; Gap = BUD-ACT`.

## Export and prompts
The **export** button gives the table as it is shown (scale, sort, variance and calculation columns included) as a CSV file; a cell that a spreadsheet would read as a formula is made text. **Prompts** limits the Planning page (table, total and chart) to chosen members of any dimension, a year, quarter or hierarchy node standing for what is below it; they are kept in bookmarks.

## Calculated measures (Modeller, Calculations tab)
A calculated measure is a formula over measures, for example `PROFIT = REVENUE - COST` or `MARGIN % = PROFIT / REVENUE`. It is worked out for every cell **after** aggregation, so the margin of a total is the margin of the totals. A calculation may use the ones above it. It is read only (it cannot be planned) and can be chosen in any story widget and the analyser; the sample Sales Plan has Profit and Margin %. Stored with the model (`ZSAC_MODEL-CALC_JSON`).

## Data actions and multi actions
* **Currency Conversion** (data action step): converts values from the currency of the members of a dimension (its `CURRENCY` attribute) or from one currency into another with rates written as `USD>EUR=0.92`, `USD>EUR@2026-Q2=0.94`, `USD>EUR@2026-03=0.93` (month beats quarter beats year beats no period; a pair also converts back). It can write into another version or measure. A missing rate stops the action, nothing is written.
* **Copy to another Model** (multi action step): copies a version's values into a version of another model. Dimensions and measures are matched by id; target dimensions the source lacks take a fixed member (`SCENARIO=BASE`); values landing on the same target cell are added up; what the target cannot hold (a measure it does not have, a month outside its periods, an unknown member) is left out and reported in the log.

## Formulas
The formula bar (`fx`) knows `current`, version ids (`=ACT*1.05`), **measure ids** (`=COST*0.6`: the same cell in that measure of the table's version) and **MEASURE@VERSION** (`=COST@ACT`). The table must show one measure for measure names to work. Formulas still cannot refer to single members or to other cells.

* **Advanced Formula** (data action step): `REVENUE - COST`, `REVENUE@ACT * 1.05`, worked out for every combination of members the step's filter covers and written to a target measure (and version); a cell where it cannot be worked out is skipped. It works on single values, so a ratio is not summed over members: for a ratio of totals use a calculated measure.
* **Undo and redo** in the Modeller (every change to measures, dimensions, members, calculations and settings, until the model is saved or closed).

## Gaps that remain
Planning: an allocation designer beyond the data action's allocation step, calculated rows (calculations are columns), cell validation by lookup of master data, the page-level filters of SAC stories as a bar over several tables. Planning formulas cannot refer to single members; a data action runs on single values and not on aggregated cells.
