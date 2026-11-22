# E1–E3 integration status (22 November 2026)

**Status: SOURCE INTEGRATED, ACCEPTANCE BLOCKED.** No merge to main, no production migration, no production data changes.

## Committed on integration branch
- Imported feature code and tests from draft PRs #26 (shell), #27 (Students), #28 (Lessons), #30 (backend).
- `app.js` mounts Students and Lessons into `frontend/shell.js` tabs, routes Students' lesson-create and lesson-open callbacks into Lessons, and hides tabs/header on subpages.
- `index.html` loads both module CSS files; shared CSS adds subpage visibility and bottom scrolling inset.
- Students exposes `create` and `open` callbacks and hides main navigation on subpages.
- Lessons calls `log_lesson_v2` / `replace_lesson_v2` and handles a scalar `student_details_at` RPC result.
- Proposed additive SQL migration includes a necessary nonnegative `lesson_paid_rate` adjustment for zero-euro per-lesson entries.
- README and visual comparison document updated.

## Live schema inspection (READ ONLY)
- `change_student_with_repricing(uuid,date,jsonb,boolean,uuid)` matches Students' named argument payload. With `p_reprice=false`, no historical lessons are replaced; `change_student` inserts effective-dated versions.
- Current `lessons` constraints permit `cancelled_billable` and nonnegative `rate`, but `lesson_paid_rate` still requires per-lesson `rate>0`. Migration corrects this in source only.
- `log_lesson_v2` and `replace_lesson_v2` are not installed in connected production database.
- Source inspection of backend migration: ownership checks use ledger owner, edit checks invoice_id, replacements void prior rows, duplicate search excludes voids, and idempotency keys are checked. **None of these are runtime-tested**.

## Test report
| Check | Executed? | Result |
|---|---|---|
| GitHub branch file imports/updates | Yes | Committed |
| Live RPC signature and constraint queries | Yes, read only | Pricing signature matches; zero-rate constraint mismatch identified |
| Node tests (frontend-shell, students, lessons) | No | NOT RUN: source not available in local runner and GitHub clone failed (DNS resolution) |
| Browser screenshots/E2E | No | NOT RUN: no authenticated browser runner |
| Disposable Supabase migration/RLS/tenant tests | No | NOT RUN: no designated disposable project or migration approval |
| German localization sweep | Partial source review | NOT ACCEPTED: legacy strings and backend errors need translation |
| Wireframe parity | Source review against supplied screenshots | NOT ACCEPTED: no rendered browser screenshots |

## Story coverage (implemented means code exists, not accepted)
| Story | Implemented source | Tested | Remaining |
|---|---|---|---|
| ON-9 | Shared three-tab navigation and settings | No | Responsive/browser acceptance |
| IN-1 | Invoices placeholder | No | Centered layout parity |
| ST-1 / ST-4 | Student creation and section editing | No | Browser form and validation tests |
| ST-3 | Search/status filtering | No | Wireframe shows grouped sections, current filters differ |
| ST-6 / ST-6.5 | Detail tabs, history and lesson list | No | Route-return and invoiced marker verification |
| LE-1 / LE-3 / LE-3.4 | New lesson and date selection | No | V2 RPC deployed in disposable test DB, future date checks |
| LE-4 | Duplicate sheet | No | Idempotent retries and confirmation |
| LE-5 | Cancellation and zero-price | No | Migration + DB and browser tests |
| LE-6 | Edit, void, history, invoiced locks | No | History continuity and invoice protections |
| LE-7 | Lessons tab grouping | No | Month heading/layout parity |

## P0 blockers
1. Proposed E3 RPCs are not installed. **The integrated lesson save/edit cannot function against the current production database.** Do not deploy without approval; test migration in a disposable database.
2. Tenant isolation, invoiced locks, append-only history and idempotent retries are not tested against the new RPCs.
3. End-to-end frontend integration has not been executed in a browser. Routing and data flow require acceptance verification.

## P1/P2 blockers
- German UI localization incomplete (legacy English copy and raw server errors).
- Original wireframes now supplied in conversation, but screenshot-to-browser visual parity is pending. Known deviations documented separately.
- Node tests have not been executed.
- Old legacy screens remain in `app.js`; cleanup and translation coverage needed.

## No deployment
Only GitHub branch commits were made. `main`, production database schema, production data and deployed frontend remain unchanged.


## Acceptance gate #33: integration follow-up (22 November 2026)

**Central issue:** https://github.com/grotshteyn/lesson-ledger/issues/33. This section supersedes stale earlier claims about the v2 RPCs and month heading; the original pre-reconciliation audit is retained above for history.

### Source reconciled into integration branch
- PR #27: simultaneous Aktiv/Pausiert/Beendet groups with search, supported Basics payload allowlist, student name read-only, expanded Students regression suite and handoff. Retained integration-only `onSubpageChange` callback for Shell chrome.
- PR #32: centered German invoice empty state, responsive navigation and error-handling changes, source checks and browser checklist.
- PR #31: verified v2 replacement replay payload guard, expanded SQL regression fixture, backend runbook, corrected >365-day contract and pre-E3 schema baseline. Do not overwrite the deployed v2 definition with the older SQL.
- LE-7: month heading followed by newest-first Monday-based week groups was already integrated in `c94f5d7`. PR #34 timezone-safe week calculation, retry hardening, tests and handoff have now also been reconciled into integration.

### Test evidence, distinguished from source
| Evidence | Actual result | Limits |
|---|---|---|
| Students JavaScript cases | 15 passed / 0 failed in V8 harness using fetched integration source and test bodies | Not native Node runner; no browser |
| Shell JavaScript cases | 4 passed / 0 failed in V8 harness using fetched integration source and test bodies | Includes source assertions; not native Node runner |
| Lessons JavaScript cases | 5 passed / 0 failed in V8 harness using fetched integration source and test bodies | Includes PR #34 test additions |
| Native `node --test` | NOT RUN | GitHub clone DNS failure in runner |
| Database v2 RPC presence | Confirmed read-only via Supabase SQL after authorized migration | Existence is not end-to-end acceptance |
| Backend SQL regression and tenant isolation | Backend agent reports rollback-only fixtures completed without exception, including invoice-lock fixture and fixture cleanup; details in `docs/backend-db-verification.md` and issue #33 | Independently executing full fixtures by Integrator not performed; no E4 invoice issuance flow |
| Authenticated browser, 12 screens at 360px and wide | NOT RUN | Screenshots, keyboard, safe area, navigation and wireframe parity unaccepted |

### Remaining acceptance work
- Lessons LE-6: edit form now renders history on the same screen (integration commit 106c749); source implemented but invoice lock, correct history lineage and visual/browser parity still unaccepted.
- German sweep: legacy/raw error text and all navigation paths; owners Shell/Students/Lessons, Integrator verifies combined build.
- Authenticated browser checks and complete screenshots for 12 wireframes, plus two-user RLS, duplicate/inactive, pricing, history and invoiced end-to-end evidence.
- Reviewer sign-off on #33 and PR #20 before any main merge or frontend deployment. No main merge or frontend deployment authorized.
