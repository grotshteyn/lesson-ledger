# E1–E3 browser acceptance continuation, 22 November 2026

Central gate: #33. Draft PR #35 targets `design/three-tab-german-refactor` from isolated branch `integration/browser-acceptance-e1-e3`. This is a source and test evidence report, **not** a browser pass.

## Changes implemented in draft PR #35

1. Students and Lessons translate known Supabase/PostgREST failures (permission, invoiced lock, idempotency conflict, duplicate, inactive, validation, connection) to German. Unknown SQL/backend messages use a safe German fallback rather than leaking raw text.
2. Lessons inactive/duplicate confirmation: fixed disabled Save button preventing the confirmation retry from reaching `log_lesson_v2` or `replace_lesson_v2`.
3. Shell passes a return callback for student-origin Lessons; cancel, successful save and remove return to the originating student detail.
4. Lesson detail and edit history now filter the `lessons.replaces_lesson_id` replacement chain rather than listing unrelated lessons for that student. Database column existence confirmed read-only in the authorized Supabase project.
5. Added native Node tests for German errors and replacement history, and switched Students/Lessons tests to file-module imports compatible with shared localization.

## Actual execution evidence

| Check | Result | Evidence boundary |
|---|---|---|
| Students source cases | 15 passed, 0 failed | V8 harness, fetched branch source and test bodies |
| Shell source cases | 4 passed, 0 failed | V8 harness, fetched branch source and test bodies |
| Lessons source cases | 7 passed, 0 failed | V8 harness, includes two new replacement-chain cases |
| German error mapping cases | 2 passed, 0 failed | V8 harness, fetched module and test bodies |
| **Total** | **28 passed, 0 failed** | V8 only, not native Node |
| Native Node | **NOT RUN** | `git ls-remote https://github.com/grotshteyn/lesson-ledger.git HEAD` failed: `Could not resolve host: github.com`. Node v22.16.0 is installed, but checkout cannot be obtained. |
| Browser screenshots | **NOT RUN** | Chromium is installed but no checked-out/served app and no authenticated browser session; no evidence for 360px, 390px, 768px or desktop widths. |
| Database | **READ ONLY** | Confirmed `lessons.replaces_lesson_id` and v2 RPC signatures; no new SQL write tests by Integrator. Backend agent's earlier rollback-only fixture results are separate evidence on #33. |

**22 vs 24 discrepancy:** earlier integration V8 total 22 = Students 15 + Shell 4 + Lessons 3. After PR #34's two additional Lessons tests were integrated, total became 24 = 15 + 4 + 5. PR #35 adds two Lessons chain tests and two German mapping tests: 28 = 15 + 4 + 7 + 2. These are different source/test revisions, not inconsistent runs of the same revision.

## Twelve approved wireframe states

| PDF page | State | Source review | Browser verdict |
|---|---|---|---|
| 1 | Lessons tab/month/week | Grouping implemented | NOT RUN |
| 2 | Students grouped list/search | Three simultaneous groups implemented | NOT RUN |
| 3 | Student lesson list | Student callback route and return corrected | NOT RUN |
| 4 | Student details | Cards/history/status present | NOT RUN |
| 5 | Add student | Three-section form present | NOT RUN |
| 6 | Effective-dated pricing edit | Versioned RPC without repricing existing lessons | NOT RUN |
| 7 | Invoices placeholder | Centered German empty state | NOT RUN |
| 8 | Global new lesson | Searchable student selector | NOT RUN |
| 9 | Edit lesson/history | Related replacement chain shown in edit form | NOT RUN |
| 10 | Duplicate confirmation | Retry-disabled-state bug corrected | NOT RUN |
| 11 | Student-specific new lesson | Fixed student and return callback | NOT RUN |
| 12 | Date picker | Monday-first calendar/dots in source | NOT RUN |

## Concrete blockers and next evidence

- **Browser runner:** container can run Chromium and Node but cannot resolve github.com to check out the repo; GitHub connector can read/write individual files but does not provide a locally served app bundle. Need a runner with repository checkout and an authenticated test session to collect 12 screenshots at 360px and 1280px, plus keyboard-open and safe-area checks. No browser visual claims can be made before this.
- **V2 E2E:** read-only schema checks do not exercise browser authentication, RLS, duplicate/inactive prompts or actual lesson replacement. Need authenticated browser test account/session; use synthetic-only existing Supabase environment and clean up fixtures. Independent security review remains with Security Reviewer.
- **Source limitation:** replacement history currently queries the 250 newest student lessons before filtering lineage. Very long histories could truncate an older chain. Reviewer to assess pagination/recursive query before final acceptance.
- **German sweep:** Students and Lessons backend error surfaces now mapped, but legacy app.js flows may still show raw backend messages. Full authenticated end-to-end language sweep remains open.

No merge to main, frontend deployment, or new database migrations were performed.
