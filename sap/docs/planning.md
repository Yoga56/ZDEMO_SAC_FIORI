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

Limit: the checks run in the client library (`DataProvider._assertUnlocked`), which is where every app write goes through. The ABAP actions `WriteFacts`, `DeleteFacts` and `Publish` do not check regions yet; a second client that bypasses the library would not be stopped. Moving `LockEngine` to a class called from those actions (and a validation on `ZR_SAC_FACT`) is the next step for production use.

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

## Gaps that remain
Calculated rows and columns with formulas over measures, data entry mode with mass data entry, cell validation rules, an allocation process designer, edit prompts and the page-level story filters of SAC's planning tables, and exporting the table to a spreadsheet.
