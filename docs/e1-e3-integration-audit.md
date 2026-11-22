# E1–E3 integration audit (2026-11-22)

Status: **BLOCKED / not accepted**. This is an audit, not a claim of integrated frontend or successful browser/DB tests. No main merge or deployment.

## Reviewed inputs
- docs/parallel-agents.md; docs/frontend-redesign.md
- Draft PRs #26 shell, #27 students, #28 lessons, #30 backend, and integration draft #20.
- Branch comparisons: all four are ahead of common base 90c8610, with no overlapping changed filenames.
- Read-only live Supabase pg_proc inspection of lesson-ledger project.

## Contract verification
- Existing `change_student_with_repricing(p_student_id uuid,p_effective_from date,p_changes jsonb,p_reprice boolean,p_idempotency_key uuid)` matches Students' five named parameters.
- Students supplies `p_changes:{...other,price,billing_mode}`, `p_reprice:false`. Existing function delegates to `change_student` and only enters lesson replacement loop if `p_reprice` is true. Thus the requested update preserves historical lesson snapshots, subject to confirming `change_student` validates the individual fields and effective date.
- Existing `log_lesson` and `replace_lesson` use legacy cancellation arguments. Proposed `log_lesson_v2` and `replace_lesson_v2` are absent from connected database at audit time.
- Lessons UI currently calls legacy RPC names with v2-style status and zero rate. **Blocking mismatch**. Switch module to v2 only after migration is applied to an isolated test database and validated.
- V2 contract promises `saved/duplicate/inactive`, UUID idempotency, historical rate snapshots, future dates through +365 days, zero rate, invoiced locks and append-only edits. These are documented but not runtime-verified.

## Integration wiring
- Shell `renderTab` currently mounts legacy `allLessonsPage` and `studentsPage`, and its create action sends Lessons to Students. Neither isolated agent module is mounted.
- Required: mount Students and Lessons under tab content, call `destroy()` on route change, route Students' lesson callbacks to Lessons' `createLesson(studentId)` / `openLesson(lessonId,studentId)`, and hide tab bar on subpages. Preserve settings and invoices placeholder.
- Existing settings labels include English `E-Mail for payers` and `Regular Umsatzsteuer 19%`; German UI gate fails.
- Ensure CSS load order and verify global selectors at mobile and wide widths. No browser evidence yet.

## Test report
| Check | Result |
|---|---|
| Branch diffs and changed-file overlap | PASS: no overlapping paths |
| Pricing RPC signature | PASS: five parameters match |
| Pricing history non-repricing code path | PASS by SQL source inspection for p_reprice=false; runtime not tested |
| V2 lesson RPC availability | FAIL: absent in connected database |
| Agent unit tests | NOT RUN in this integration session; PR authors report isolated syntax/assertion checks |
| Browser E2E, 360px/wide, keyboard, safe-area | NOT RUN |
| Disposable DB migration, cross-tenant RLS, invoice locks, duplicate/idempotency | NOT RUN |
| Full German copy | FAIL: English settings strings identified |

## Missing automated tests
- Browser route transitions and subpage tab hiding, fixed-student creation and return navigation.
- Effective-date price changes with prior lessons and future lesson defaults; no historical mutation.
- Zero-price, future held, cancelled_billable, duplicate/inactive confirmation, edit-date preserving price/minutes, invoice read-only and void.
- Authenticated cross-tenant reads and writes; view security_invoker/RLS, idempotent retries.
- Responsive visual regression at 360px and wide screen; keyboard, safe area, long names, offline and error recovery.

## Story coverage (implementation status, not acceptance)
ON-9 / IN-1: shell isolated implementation; integration pending.
ST-1, ST-3, ST-4, ST-6, ST-6.5: Students isolated implementation; integration and DB/browser verification pending.
LE-1, LE-3, LE-3.4, LE-4, LE-5, LE-6, LE-7: Lessons isolated implementation; v2 backend and browser verification pending.

## Required next steps
1. Preserve all feature draft PRs and integration PR #20 as drafts.
2. Reconcile the shared shell routing and mount lifecycle on the integration branch only.
3. Verify student change fields and effective-date validation against actual `change_student` SQL.
4. Test additive backend migration on disposable database; switch Lessons to v2 contract; never deploy automatically.
5. Run Node tests and authenticated browser/Supabase integration tests; fix failures.
6. Request original wireframe images and complete side-by-side comparison.
7. Update README and PR #20 only after the implementation and tests are demonstrably complete.

No claim of release readiness is made.
