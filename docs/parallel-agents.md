# Parallel-agent coordination: German E1–E3 redesign

**Status:** work allocation only. No agent is launched by creating this document or a branch.

## Single source of truth
- [Design contract](frontend-redesign.md) maps wireframes to user stories.
- Original user stories and the screenshots supplied in the planning conversation are authoritative. If an agent cannot access screenshots, request them; do not pretend to have seen them.
- Existing app is vanilla JS (`app.js`, `style.css`, `index.html`) and Supabase. Avoid speculative framework migrations.
- UI in German. Preserve RLS, idempotency, immutable history, invoiced locks and existing user data.

## Branches and ownership
| Agent | Branch | Owns | Must not change |
| --- | --- | --- | --- |
| Shell | `agent/frontend-shell` | navigation shell, shared CSS/component utilities, German strings, placeholder invoices | DB migrations; student/lesson business rules |
| Students | `agent/students` | E2 student screens and section editing; isolated modules | shared shell, lesson RPCs, DB |
| Lessons | `agent/lessons` | E3 lesson screens, date picker, duplicate UI, isolated modules | DB migrations, shared shell, student business logic |
| Backend | `agent/backend` | Supabase migrations/RPC compatibility, RLS and contract tests | presentation/UI code |
| Integrator | `design/three-tab-german-refactor` | integrate PRs, tests, story traceability, README | direct production deployment without approval |

All four feature branches start from `design/three-tab-german-refactor`. Open draft PRs **into this integration branch**, not main. Never merge independently into main.

## Sequencing
1. Shell + Backend start immediately. Shell defines exports/navigation/DOM integration contract; Backend publishes current and proposed RPC signatures, migration and rollback plan.
2. Students + Lessons can start discovery and isolated UI modules immediately, but must wait for agreed shared interfaces before integrating. Do not edit `app.js` concurrently; use separate modules or explicit file ownership.
3. Integrator merges shell and backend contracts first, then student and lesson modules. Check changed files for overlaps, reconcile conflicts manually, run tests.
4. Open final PR from integration branch into `main` only after acceptance checks pass. Existing draft PR #20 is the integration PR.

## Mandatory handoff in every PR
- Summary and screenshots at 360px and wider screen (when browser access exists)
- Story IDs and corresponding UI behaviors
- Files changed and API/RPC assumptions
- Tests run and results; explicitly list tests not run
- Risks, follow-up issues and migration/rollback instructions where relevant

## Acceptance gates
- Lessons / Students / Invoices tab shell, German copy, settings gear; no Home/To-do.
- Forms and detail pages use consistent cards and fixed actions, no bottom tab on subpages.
- Student active/paused/ended, search, details, price-effective-date and history work.
- Lesson create/edit, fixed student mode, calendar, duplicate confirmation, cancellation and zero rate work against backend.
- Historical rates and invoiced lessons unchanged, cross-user RLS verified.
- Loading, errors, keyboard, safe area and small-screen overflow checked.
- No credentials, service-role keys or destructive production migrations committed.

## Agent prompts

### Agent 1: Shell
You own `agent/frontend-shell` in `grotshteyn/lesson-ledger`. Read `docs/frontend-redesign.md`, this document and the existing frontend. Implement a reusable German three-tab application shell (Stunden, Schüler, Rechnungen), settings gear, E4 placeholder, shared page/form/card/list/segmented-control/action-bar styles and responsive safe-area behavior. Retire Home/To-do from primary navigation. Extract a modular integration contract so other agents do not edit your files. Keep existing Supabase wiring intact; do not change migrations or business rules. Document public exports, event interfaces and story mapping. Run feasible checks and open a draft PR targeting `design/three-tab-german-refactor`. Do not merge.

### Agent 2: Students
You own `agent/students` in `grotshteyn/lesson-ledger`. Read `docs/frontend-redesign.md`, this coordination document, E2 stories and supplied student wireframes. Implement German Students list (search and grouped statuses), New student grouped form, Student Lessons/Details switch, independent Basics/Lessons-and-price/Payer edits, effective dates, history and pause/end. Use isolated modules rather than modifying shared `app.js` or shell files concurrently. Preserve existing Supabase calls and historical data behavior; identify contract gaps instead of inventing RPCs. Integrate to the shell contract once available. Add story-linked tests and open draft PR to `design/three-tab-german-refactor`. Do not merge.

### Agent 3: Lessons
You own `agent/lessons` in `grotshteyn/lesson-ledger`. Read `docs/frontend-redesign.md`, this coordination document, E3 stories and supplied lesson wireframes. Implement German weekly Lessons list, new lesson with searchable bounded student selector, student-fixed mode, edit and history, Monday-first calendar bottom sheet and duplicate comparison bottom sheet. Use isolated modules, not shared `app.js` edits. New lesson date should prefill historical student defaults; editing date preserves stored length/price. Invoiced lessons read-only. Coordinate payloads with Backend agent; do not bypass RPC validation or change DB yourself. Test and open draft PR to `design/three-tab-german-refactor`. Do not merge.

### Agent 4: Backend
You own `agent/backend` in `grotshteyn/lesson-ledger`. Audit Supabase migrations, tables, constraints, RLS, auth, `student_details_at`, `log_lesson`, `replace_lesson`, `void_lesson` and other used RPCs. Compare precisely against E1–E3 revised stories, especially zero-priced lessons, future dates, simplified cancellation, duplicates, inactive student confirmation, historical pricing, invoiced locks and tenant isolation. Publish an explicit client/API contract and safe migration plan. Implement compatible non-destructive migrations and automated tests only where story semantics are verified. Preserve existing user data, idempotency and append-only changes. Do not deploy to production or edit frontend files. Open draft PR to `design/three-tab-german-refactor`. Do not merge.

### Integrator
Review four draft PRs against the design contract and user stories. Merge into the integration branch in controlled order, resolve shared `app.js` wiring once, run UI/backend regression tests, update README and story traceability, and only then request approval for main.
