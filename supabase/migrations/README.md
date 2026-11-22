# E3 database setup

The E3 SQL files depend on the existing E1/E2 schema and should be applied in this order:

1. `e3_lesson_foundation.sql`
2. `e3_lesson_rpc.sql`
3. `e3_student_cancellation_settings.sql`
4. `e3_backdated_repricing.sql`
5. `e3_active_lessons_view.sql`

All five files have already been applied to the development Supabase project. They are tracked here to make setup reproducible. Do not apply the directory in alphabetical order: the RPCs and view depend on the foundation tables.

Run the rollback-only checks in `../tests/e3_smoke.sql`, `../tests/e3_repricing.sql`, and `../tests/e3_cancellation_settings.sql` after applying the migrations. These tests require an existing active student fixture. They use `BEGIN` / `ROLLBACK` and leave no lesson or student-version changes behind.

The `active_lessons` view is the canonical source for E4 invoice preview amounts. It excludes voids and applies charge overrides. It is `security_invoker` to preserve tenant RLS.

The database uses SECURITY DEFINER RPCs with explicit `auth.uid()` owner checks to implement append-only writes. The Supabase security advisor flags these callable definer functions by design; audit owner checks before changing the API surface. Invoice creation and invoice linkage belong to E4.
