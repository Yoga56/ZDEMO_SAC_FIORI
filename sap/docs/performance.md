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
