# E2 Students: migration and test order

This feature branch is not yet merged. The SQL files are applied in the following dependency order, not alphabetically. Each migration was applied to the prelaunch disposable Supabase project `zcszskoegwgcjgqsfmfx`.

1. `supabase/e2_students_foundation.sql`
2. `supabase/e2_create_student.sql` (original invoker implementation)
3. `supabase/e2_student_changes.sql`
4. `supabase/e2_harden_student_writes.sql` (switches write RPCs to security definer; revokes direct insert)
5. `supabase/e2_precise_event_order.sql`
6. `supabase/e2_ranked_student_search.sql`
7. `supabase/e2_search_typo_distance.sql` (final definition includes future-start students and typo handling)
8. `supabase/e2_reject_blank_student_changes.sql`
9. `supabase/e2_monthly_pause_end_guard.sql`

The live database also received an earlier, temporary `e2_create_student_invoker_grants` migration while the write RPC was an invoker. It is superseded by step 4; it does not need to be replayed.

All SQL tests wrap fixtures in `BEGIN`/`ROLLBACK` and should be run with a privileged SQL editor account. In particular, `tests/e2-students-regression.sql` creates fixtures before switching to the authenticated role.

Run:
- `tests/e2-students-regression.sql`
- `tests/e2-create-student.sql`
- `tests/e2-student-changes.sql`
- `tests/e2-monthly-boundaries.sql`
- `tests/e2-security-search-remove.sql`

Frontend CI checks `node --check app.js`, `node --test tests/e2-frontend.test.mjs`, and a Playwright smoke test using a mocked Supabase client. A green browser smoke does not substitute for manual authenticated testing against the deployed Supabase instance.

**Security:** The three E2 write RPCs intentionally use `SECURITY DEFINER` with `search_path=''`, an authenticated `auth.uid()` check and an explicit ownership check against `public.ledgers`. Browser roles cannot insert directly into student tables. Supabase's advisor may warn about these three authenticated security-definer RPCs by design; review each whenever modifying authorization.

**E3/E4 dependencies:** The removal RPC checks `public.lessons` if that table exists. Future E3 migrations must keep the `student_id` link. Historical uninvoiced lesson repricing through void/new records and invoice immutability are implemented in E3/E4, not in E2.
