# Frontend redesign: three-tab German application (22 November 2026)

Status: design and integration audit. **Not yet an implemented frontend rebuild.** This document is the traceable contract for the work; the main branch is unchanged.

## Authority and scope

The 22 Nov 2026 Lesson Ledger user stories and the supplied wireframes govern E1–E3. Screenshots are low-fidelity references, not production annotations. Dashed explanatory boxes must not render in the app. UI text is German, sourced from translation keys (E1 design rule); English may be added in NF-6. Preserve E4–E12 boundaries.

## Navigation and layout decisions

| Decision | Story | Implementation contract |
| --- | --- | --- |
| Remove home and To-do dashboard | ON-9, LE-7 | On setup completion and sign-in open Lessons. Three bottom tabs: Stunden, Schüler, Rechnungen. Separate routes/components, no home route in primary navigation. |
| Shared tab shell | ON-9 | White header with left title and right settings gear; gray scrolling content; three equal bottom tabs; active label prominent. Safe-area aware. |
| Primary list actions | ON-9, LE-1, ST-3 | Black rounded floating action above tab bar, + Stunde erfassen or + Schüler hinzufügen. Content has bottom inset so final row is never hidden. |
| Dedicated screens | ST-6, LE-1, LE-6 | Student page and edit/create forms have no main tab bar. Read-only screens use bottom Fertig; edit forms Abbrechen / Speichern. |
| Student list | ST-3 | Search by name/nickname; grouped Aktiv, Pausiert, Beendet; white grouped rows; price right aligned; inactive entries remain searchable. |
| Student page | ST-6 | Header with name and concise subject/rate summary; Stunden / Details segmented switch; details cards Grundlagen, Stunden und Preis, Zahlungspflichtige Person; each card edited independently. History below. |
| Student form | ST-1, ST-4 | Three white cards on gray background; reuse same fields for create and section edit; price/length changes use effective date. |
| Lessons tab | LE-7 | Current month grouped by week newest first; rows date, student, amount and cancellation label. |
| Student lessons | ST-6.5 | Group by month, newest first; date, duration/status, amount; invoiced marker when available. |
| Lesson form | LE-1, LE-3, LE-5 | Student selector scrolls independently; none selected initially; date shortcuts Heute, Gestern, Datum wählen; status Gehalten / Spät abgesagt oder nicht erschienen; length and rate. From student page, student is fixed. |
| Edit lesson | LE-6 | Reuse lesson fields, show history and Entfernen; invoiced records read-only. Changing date in edit must not refill stored price/length. |
| Date picker | LE-3 | Bottom sheet, Monday-first month grid, today outlined, selected day filled, existing lesson dates marked with dot; selection closes sheet. |
| Duplicate warning | LE-4 | Bottom sheet comparing existing and proposed lessons; default Abbrechen, explicit Zweite speichern; server confirms duplicate. |
| Invoices placeholder | ON-9, IN-1 | German empty state until E4; do not ship unfinished invoice issuance UI. |

## Shared visual tokens (initial recommendations, verify at 360 px)

- Background: #f4f4f3; cards/header: #fff; text: #242424; secondary: #606060; borders: #d5d5d3.
- Page horizontal padding: 20 px; card padding: 16 px; card radius: 12 px; field radius: 10 px.
- One shared input/segmented-control style, 44 px minimum interactive target.
- Sticky action bars and floating actions must account for env(safe-area-inset-bottom).
- Long names, emails and cancellation labels wrap; right-aligned prices must not overlap.

## Backend integration audit and blockers

Observed in main branch `app.js` (22 Nov 2026):

1. Auth currently offers password login, signup and recovery. ON-1 requires passwordless email link and OTP only. Preserve account identity and existing records; do not silently delete or migrate authentication identities.
2. `load()` currently calls `home()`. ON-9 requires the Lessons tab and an Invoices placeholder.
3. Existing `logLessonSheet` uses status values `held`, `cancelled`, `no_show`, `cancelled_by`, `cancelled_in_time`, `charge_override`. LE-5 requires only `held` and `cancelled_billable`, with 0 price for waivers. Existing RPC contracts must be inspected and migrated before changing payloads.
4. Current client rejects future held lessons and nonpositive rates. LE-3.4 and LE-5 require future held lessons and rate >= 0. Check DB constraints and RPCs too.
5. Current edit uses `replace_lesson` and removal uses `void_lesson`; preserve append-only semantics and invoiced-record locks (LE-6), checking transactions and RLS.
6. Existing duplicate confirmation uses browser `confirm()`. Replace visually with a bottom sheet while retaining server-side duplicate protection and idempotency.
7. Current student and lesson views have separate intermediate pages and overlays; consolidate their UI without changing ownership checks, historical prices, or RPC isolation.
8. README currently describes E1-only and a home dashboard, while the frontend includes later functionality. Update it after implementation, not before.

## Implementation sequence and verification

1. Inventory Supabase migrations, SQL functions, table constraints and current production data contracts; document existing RPC signatures. Test tenant isolation.
2. Add shared shell, German translation keys, route state and screen/action layouts; retain old flows behind a reversible branch until feature parity.
3. Rebuild Students list, details, create and section-edit views against existing read/write operations.
4. Rebuild Lessons list, create/edit, date picker and duplicate confirmation. Migrate server RPCs for revised cancellation and zero-price rules in lockstep with frontend; add transactional/idempotency tests.
5. Add Invoices placeholder; update settings entry points and authentication only after verifying existing user account migration safety.
6. Test at 360 px, keyboard open, long content, no-data, loading/error, offline-save failure, duplicate/inactive student, historical rate, invoiced lesson and cross-ledger access.
7. Update README and link every implemented screen and business rule to its story ID.

## Deliberate boundaries

No speculative E4 invoice issuance, E6 notes, E8 MCP interface, or E11 Google login. Never put service-role credentials in the browser. Do not alter issued invoices or historical lesson rates. Preserve Supabase RLS, idempotency and append-only corrections.
