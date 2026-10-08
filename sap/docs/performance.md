# Performance: measurements and fixes

Measured on the deployed app (S/4HANA Cloud, my402225) on 8 October 2026 with the Chrome extension: every page was opened from the launchpad
and the `$batch` calls to the service (each is one round trip) were counted from the browser's resource timings.

## Before

| Page | Round trips | Time from the first to the last |
|---|---|---|
| Home | 13, one after the other | 5.9 s |
| Planning | 11, one after the other | 3.2 s |
| Calendar | 3 | 2.5 s |
| Data Actions | 2 (one of them reads the whole run history) | 2.6 s |
| Multi Actions | 2 | 2.1 s |
| Data Analyser | 5 | 2.1 s |
| Datasets | 2 | 0.6 s |
| Stories, Files | 2 and 1 | 0.3 s |

JavaScript loading is not the problem: the library modules a page needs are a few small files (about 200 ms for Planning). The time is the number of
round trips, each 200 to 500 ms, made one after the other.

## Causes

* `readFacts` and `listVersions` read the whole model again (with dimensions, measures and the user's shares) before every call. Home asked for the same
  model 7 times and the same facts twice.
* Shares were read again for every list of objects.
* Independent reads were awaited one after the other (user, models, versions, files, tasks; the facts of the compare version after the facts of the version).
* `listRuns` read the whole run history (every run with its log and steps, up to 10 000 rows) and kept the newest 200.

## Fixes

* **ODataV4Provider** keeps what it reads: the same read made at the same time is one request, and its answer is kept for 5 seconds (models, versions and
  shares 20 seconds). Every write (`_request` with a method other than GET, `_patch`, `_action`) empties the cache before and after it, so a page never
  shows what it has just changed as it was. Callers get copies of the rows.
* `listRuns` asks the server for the newest runs (`$orderby StartedAt desc`, three times the number shown), not for all of them.
* Controllers ask for independent things together: Home (files, tasks, user, and the metrics at the same time), Planning (user and models; the facts of the
  compare version with the facts of the version), Datasets, Files, Modeller.
* Unit tests: `test/node/odata-cache.test.js` (7 tests).

## To measure again

Open each page from the launchpad and count the `$batch` calls as above. The expected result is a few round trips per page, not ten.

## After (measured on the deployed app, 8 October 2026, after the deploy of the changes above)

The same method, each page opened after another page. Models, versions and shares are kept for 20 seconds, so a page opened a few seconds after another one
can use what that one read; the "before" numbers had no such help.

| Page | Before: round trips, time | After: round trips, time |
|---|---|---|
| Home | 13, 5.9 s | 6, 1.4 s |
| Planning | 11, 3.2 s | 5, 1.4 s |
| Calendar | 3, 2.5 s | 1, 0.3 s |
| Data Actions | 2, 2.6 s | 2, 0.6 s |
| Multi Actions | 2, 2.1 s | 2, 0.5 s |
| Data Analyser | 5, 2.1 s | 3, 0.9 s |
| Datasets | 2, 0.6 s | 1, 0.2 s |
| Files | 1, 0.3 s | 1, 0.2 s |
| Stories | 2, 0.3 s | 2, 0.3 s |

The deployed files contain the cache, the destroyed bindings, the limit on the run history and the three UI fixes.

Next saving made after this measurement: `getModel` answers from the cached list of models (one round trip less on Home, Planning and the Data Analyser).
What is left on Home is the model list, the versions and three rounds of fact reads for the two key figures.

## Memory

Checked on 8 October 2026 in the browser preview (sample data): the pages were opened over and over and the number of UI5 controls (`Element.registry`),
the DOM nodes and the JS heap were read after each round.

| | Before | After |
|---|---|---|
| DOM nodes | stable (the pages are kept) | stable |
| JS heap | about 37 to 44 MB, no steady growth | same |
| UI5 controls, Data Analyser | +253 at every visit | +0 |
| UI5 controls, Planning | +0 | +0 |
| UI5 controls, other pages | +0 (Calendar and story: only the first visit creates its controls) | +0 |

Leaks found and fixed:

* **BuilderPanel** (Data Analyser and the story designer's right panel): `setAggregation("_form", ...)` removes the old form but does not destroy it, so each
  rebuild left the whole old form with its popovers alive. The old form is destroyed now.
* **StoryViewer**: the same with its `_layout` (a story with its canvas and cards left behind at each reload). Fixed the same way.
* **PlanGrid**: a `mouseup` listener on `document` was added for every grid and never taken off; a grid is made anew at each reload, and every listener kept its
  grid and its data alive. It is removed in `exit()`.
* **ODataV4Provider**: every read made a list binding that was never destroyed, and the OData model keeps a binding with the rows it loaded (up to 10 000 facts).
  Bindings of reads, patches and actions are destroyed after use. This one cannot be seen with the sample data; check it on the deployed app.

Not a leak, but a cost: `Resizer` observes the whole page and rescans every 1.5 seconds. It is cheap and does not grow.

To check again: open the pages several times and compare the number of UI5 controls (`sap.ui.require("sap/ui/core/Element").registry.size`) and the heap
(`performance.memory.usedJSHeapSize`, in Chrome) after the first round.

## Deep test of the deployed app, 8 October 2026 (second round)

Done on the deployed app with the Chrome extension, after the deploy of the changes above (the deployed files had `getModel` from the list and the destroyed bindings).

Cold pages (the provider's cache emptied before each page; round trips, first to last):

| Page | Round trips | Time |
|---|---|---|
| Home | 5 | 1.1 s |
| Planning | 4 | 1.0 s (the table of SALES_PLAN is on screen after 1.0 s) |
| Data Analyser | 3 | 0.9 s |
| Data Actions | 2 | 0.6 s |
| Multi Actions | 2 | 0.5 s |
| Calendar | 2 | 0.6 s |
| Stories | 2 | 0.3 s |
| Datasets | 1 | 0.3 s |
| Files | 1 | 0.2 s |

Idle: no long task (over 50 ms) in 12 seconds on the Planning page, so the Resizer's observer and timer cost nothing noticeable.

Memory:

| Test | UI5 controls | DOM nodes | JS heap |
|---|---|---|---|
| Four rounds through all nine pages | 5 083 before and after each round | stable | 283 to 317 MB, up and down, no trend (most of it is the launchpad) |
| Planning: 14 reloads across the versions | no growth | stable | no growth |
| Data Analyser: 15 rebuilds of the builder panel | no growth (before the fix: +253 per visit) | stable | no growth |
| Story page: 12 rounds of open, edit, view, close | +122 in the first 6 rounds (first-time creation), +0 in the next 6 | | no growth |

Found in this round: the cache of the provider kept answers that were out of date (22 of 24 entries) with their rows until the next write. On a big model
that would hold many reads of up to 10 000 facts. Out-of-date answers are now dropped at the next read, and at most 40 answers are kept
(`_prune`, 2 tests).

