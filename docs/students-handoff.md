# Students E2 agent handoff (issue #22)

## Integration
Branch: `agent/students`. Draft PR targets `design/three-tab-german-refactor`.

Load `students/students.css` after the shared shell stylesheet. From the shell's Schüler route:

```js
import {mountStudents} from './students/students.js';
const unmount = mountStudents({
  root: document.querySelector('#student-route'),
  supabase,
  onLessonCreate: studentId => openLessonForm({studentId, fixedStudent: true}),
  onLessonOpen: (lessonId, studentId) => openLessonDetail(lessonId, studentId)
});
// call unmount() before switching routes
```

This module intentionally does not edit `app.js`, `style.css`, `index.html`, shared navigation or the database. Shell #21 must confirm mount contract and ensure a tab screen provides its own root. Lessons #23 must provide fixed-student creation and detail callbacks. The supplied original wireframe screenshots were not accessible to this agent; visually review against them before acceptance.

## User-story coverage
| Story | Behavior | Verification |
| --- | --- | --- |
| ST-1 | Three-card German create form, validation, duplicate-name confirmation, `create_student` RPC | Code inspection; browser acceptance pending |
| ST-3 | Search via `find_students`, status groups Aktiv/Pausiert/Beendet, price aligned right, name/nickname search passed to server | Pure grouping/normalization checks pass; server query acceptance pending |
| ST-4 | Separate Grundlagen, Stunden und Preis, Zahlungspflichtige Person editors with effective date; versioned writes via existing RPCs | Code inspection; database acceptance pending |
| ST-6 | Student header, Stunden/Details switch, independent edit buttons, status controls, chronological version/status history | Code inspection; browser acceptance pending |
| ST-6.5 | Month-grouped lessons newest first, status/amount/invoiced marker, callbacks to lesson detail and student-fixed creation | Pure chronology check passes; browser acceptance pending |

## Backend/API assumptions
- `find_students({p_query,p_status,p_at})` returns `student_id,student_name,nickname,subject,billing_mode,rate,monthly_fee`.
- `student_details_at({p_student_id,p_at})` returns an array with the current version; `student_status_at` returns status text.
- `create_student({p_details})` returns student ID.
- `change_student({p_student_id,p_effective_from,p_changes})` accepts basic/payer fields, including payer_address.
- `change_student_with_repricing({p_student_id,p_effective_from,p_changes,p_reprice,p_idempotency_key})` accepts billing_mode, price and lesson settings together, with `p_reprice:false`. **Backend #24 should verify this combined payload.** If unsupported, coordinate a compatible atomic RPC rather than making unguarded multiple version writes.
- `set_student_status({p_student_id,p_event,p_effective_from,p_pause_until})` accepts pause/restart/end.
- `student_versions` and `student_status_events` are RLS-filtered, and `active_lessons` exposes `invoice_id` if available.
- Existing RPCs enforce tenant isolation, immutable invoiced lessons and historical rates; the frontend never directly updates those records.

## Checks
- JavaScript syntax parsed successfully with the V8 Function parser.
- Previous handoff reported six focused checks; these have not been independently rerun in this continuation.
- `tests/students.test.mjs` now contains nine Node test cases (five existing and four new). **Node test runner was not executed:** a local clone attempt failed because github.com DNS resolution was unavailable. No passing test claim is made for these changes.
- Not run: authenticated Supabase integration tests, 360px and desktop screenshots, keyboard/safe-area browser testing, network/offline and invoiced-record regression tests. These remain acceptance gates for the integrator.

## Risks and follow-up
- Shell contract awaits #21 confirmation; current adapter is an integration proposal, not a wired tab.
- Price-edit combined payload awaits backend #24 confirmation; do not merge before validation.
- Client-side student search relies on server matching nicknames and inactive statuses.
- Create form retains the existing positive student price rule. Zero-priced **lessons** are the Lessons/Backend agents' responsibility.
- The status and price history are read-only; no data deletion or rollback migration is required for this frontend-only PR.
- The original wireframes must be supplied to the integrator for visual comparison.

## Files
`students/students.js`, `students/students.css`, `tests/students.test.mjs`, `docs/students-handoff.md`.

## Continuation audit (22 Nov 2026)

### Verified from source/contracts
- Reviewed `docs/parallel-agents.md`, `docs/frontend-redesign.md`, issue #22 discussion, Shell #21 handoff and Backend #24 contract (`docs/backend-e3-contract.md`).
- Backend confirms `find_students(text,text,date)`, `student_details_at(uuid,date)`, `student_status_at(uuid,date)`, `create_student(jsonb)`, and `set_student_status(uuid,text,date,date)`. The client uses the documented parameter names for these calls. `find_students` exposes name, nickname, subject, billing mode, rate, monthly fee and status. `create_student` requires price > 0.
- **Unverified/likely blocker:** `change_student` and `change_student_with_repricing` are used for section edits but are absent from the Backend #24 published RPC inventory. Do not accept editing until Backend confirms existence, exact JSON payload semantics, effective-date behavior and invoice protection. Do not substitute direct writes without contract agreement.
- Shell exports `shellMarkup` and `bindShell` with navigation keys `lessons/students/invoices`; integrator must mount this module into shell content, suppress main tabs on student subpages and avoid double floating create buttons.
- Lessons agent must implement `onLessonCreate(studentId)` with fixed student and `onLessonOpen(lessonId,studentId)` with a valid lesson ID; check `active_lessons` column names (especially `id`, `minutes`, `rate`, `invoice_id`) against the deployed view.

### Changes in this continuation
- Added client-side name/nickname filtering after server search and explicit duplicate-name checks across active, paused and ended groups.
- Made list search failures visible in the results region and guarded stale error responses; handled object or array response shape for student details.
- Added four regression test cases for accent/nickname search, inactive duplicate names, unexpected statuses and empty lesson history.

### Acceptance status and gaps
- **Source inspection performed:** German headings, grouped list, search, three-card create form, three independent edit forms, effective-date input, status form and month-grouped lesson history.
- **Not verified against original images:** pixel/layout fidelity, 360px/desktop screenshots, keyboard/safe-area, fixed action bar, wrapping and absence of tab bar on detail screens. Original screenshots are not in the available repository materials.
- **Not executed:** Node test suite (GitHub clone DNS failure), authenticated browser interactions, SQL/RLS/invoice-lock tests, offline/error simulations, production/development RPC calls. Do not interpret static coverage as runtime validation.
- **Outstanding:** validate/edit RPCs; confirm student price-effective-date and version history semantics; test list/search behavior against Supabase, including whether server search returns all intended nickname matches; verify lesson read-model fields, status labels and billed amounts; resolve shell and Lessons callbacks through #21/#23. Zero-priced student defaults need product/backend decision; no change to backend or production data made.
- **No merge/deployment/production write performed.**

## Reviewer follow-up: ST-3 and pricing RPC (22 Nov 2026)

- The **written approved design contract** in `docs/frontend-redesign.md` specifies three simultaneously displayed groups: Aktiv, Pausiert, Beendet. Removed extra status-filter buttons and filter state, retaining search and all three sections (including empty sections). The original image wireframe was not available, so pixel-level comparison remains blocked.
- Added four regression cases: all groups remain after search; no status-filter markup; no unsupported student name update; price update RPC includes `p_reprice:false` and UUID idempotency.
- **Executed:** exact fetched `students/students.js` and all **13** fetched test case bodies in a V8 JavaScript harness using equivalent assertions: **13 passed, 0 failed**. This was **not** `node --test`, and does not constitute a Node test-runner pass. The first harness attempt passed 10/13 and failed 3 because the harness omitted the `source` variable; corrected harness rerun passed 13/13. The previous `git ls-remote` attempt failed DNS resolution of github.com. Native Node suite remains blocked by inability to obtain the repository through the container.
- **Read-only live function-definition verification:** Supabase `public.change_student(p_student_id uuid,p_effective_from date,p_changes jsonb) -> uuid` and `public.change_student_with_repricing(p_student_id uuid,p_effective_from date,p_changes jsonb,p_reprice boolean,p_idempotency_key uuid) -> jsonb` both exist. The latter invokes `change_student` transactionally, and with `p_reprice:false` creates a version without repricing lessons. Current pricing payload `{minutes,lessons_per_week,location,billing_mode,price}` is supported; `price` must be >0. A UUID idempotency key is required and supplied.
- **Confirmed mismatch corrected:** `change_student` rejects any `student_name` key. Basics editor now displays the name as non-editable and sends only `nickname` and `subject`. This remains a **ST-4 feature gap** if student-name editing is a requirement; backend/product coordination needed before restoring it.
- No production data modified. Database queries were read-only metadata introspection. No merge or deployment. Browser screenshot, authenticated mutation/RLS, invoice locks and native Node suite remain unexecuted.

## Basics payload hardening (22 Nov 2026)

- Follow-up commit `da09ad223c8fe6a7f50f6e4538a39533d08af257`: Basics editor already displayed student name as read-only; now uses exported `basicsChanges(values)` as a strict allowlist, returning only trimmed `nickname` and `subject`. No `student_name` or unrelated field can enter the Basics `change_student` payload through the helper. Create-student flow continues accepting student name as required by `create_student`.
- Test commit `e54d33949b8cbec8f53eee7ad773d3fd726233fd`: two additional regression tests exercise the actual allowlist with malicious/extra fields and assert the edit form uses it while showing the name read-only. Total: **15** test cases.
- **Available execution:** all 15 fetched test case bodies evaluated against the fetched branch source using a V8 harness with equivalent assertions: **15 passed, 0 failed**. This is not the native `node --test` runner. Native runner and browser integration remain unexecuted because repository checkout was unavailable in the container (github.com DNS failure in previous attempt).
- Backend unchanged. No merge, deploy, or production data write.
