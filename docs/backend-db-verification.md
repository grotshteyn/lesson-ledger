# E3 database-backed verification runbook (22 Nov 2026)

Status: **BLOCKED on an authorized disposable Supabase database and its cost approval.** No SQL migrations or write tests were run on production. This branch only changes source and regression fixtures.

## Inspected, read-only
Connected project: `lesson-ledger` (`zcszskoegwgcjgqsfmfx`), ACTIVE_HEALTHY. It is the production project and **must not be used for test fixtures**.

Queries executed using Supabase SQL read-only:
```sql
select conname,pg_get_constraintdef(oid) definition
from pg_constraint where conrelid='public.lessons'::regclass order by conname;

select p.proname,pg_get_function_identity_arguments(p.oid) args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
('log_lesson_v2','replace_lesson_v2','change_student_with_repricing',
 'student_details_at','log_lesson','replace_lesson') order by p.proname;

select pg_get_functiondef(p.oid) definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='change_student_with_repricing';
```

Results:
- `log_lesson_v2` and `replace_lesson_v2` **absent** from live project.
- `lesson_paid_rate` requires `rate > 0` for `per_lesson`; proposed migration relaxes to `>= 0`.
- `lessons_rate_check` already enforces nonnegative rates; `lessons_minutes_check` enforces 5–240.
- No 365-day CHECK appears in the live `lessons` constraint list. The proposed v2 function has no 365-day date guard. This is **source/schema inspection**, not a passing future-date runtime test.
- `change_student_with_repricing(p_student_id uuid,p_effective_from date,p_changes jsonb,p_reprice boolean,p_idempotency_key uuid)` exists. Its `p_reprice=false` path calls `change_student` and does not replace logged lessons. `p_reprice=true` intentionally replaces uninvoiced lessons, so the Students UI must pass false when preserving history.
- The original proposed replacement v2 function returned replay success for the same key and old lesson even if the new date/status/minutes/rate differed. This branch adds a payload comparison and a regression assertion.
- The proposed log v2 function checks date, status and explicitly supplied minutes/rate on replay. If minutes/rate are omitted, replay cannot detect changes to defaults that occurred after the original write. **Residual risk**: require explicit client snapshots for strict replay equality or persist an operation fingerprint.

One read-only inspection query using `pg_tables.forcerowsecurity` failed because that column does not exist; use `pg_class.relforcerowsecurity` instead. This was a query error, not a security test failure.

## Environment required
1. **User approval for hourly Supabase development-branch compute charges**, or a user-provided disposable Supabase project. Never use the production project for test writes.
2. An isolated database provisioned from the current schema and migrations, with no copied production personal data.
3. A working PostgreSQL client or Supabase SQL execution facility against **that isolated database**.
4. Ability to run transactional SQL as a database administrator for auth.users fixture setup, plus authenticated role simulation inside transactions.

Supabase branching may apply recorded migrations only; the production project contains E3 routines not fully represented in recorded migration history. Verify the branch baseline before applying the v2 SQL. Do not assume a branch automatically reproduces every untracked object.

## Reproducible execution on disposable database

From repository root, with `psql` installed and `TEST_DATABASE_URL` pointing only to the disposable database:

```bash
test -n "$TEST_DATABASE_URL" || { echo "Missing TEST_DATABASE_URL"; exit 1; }
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/20261122_e3_compatible_lesson_rpcs.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/e3-backend-contract.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/tenant-isolation.sql
```

Before migration, inspect the exact functions and schema on the isolated DB. The migration changes the `lesson_paid_rate` constraint and creates v2 RPCs; never apply it without confirming the target database. The SQL tests use `BEGIN` and `ROLLBACK`, but their role and auth fixture assumptions still need verification.

After running, collect exit status, stdout/stderr, migration version, schema diff and whether the transaction rolled back. Run RLS tests as two distinct authenticated identities. Explicitly test invoiced-record edits/removal after creating a representative invoice fixture; current SQL fixture does **not** cover this case.

## Regression coverage
- A future held lesson **400 days** ahead, price 0.
- Repeated same-key same-payload create returns `replayed=true`.
- Repeated same-key different date or status raises a precise error.
- Repeated same-key replacement with changed date raises a precise error.
- Duplicate returns a confirmation-required state; explicit confirmation saves.
- Replacement leaves old lesson immutable and records a void/replacement link.
- Cross-tenant create, read and void are rejected.

**Not run**: migration, SQL tests, full Node suite, browser E2E, invoiced-record fixture, migration rollback, or security advisors against a disposable project. These are acceptance blockers, not passes.

## Client RPC contracts
- `log_lesson_v2(p_student_id,p_lesson_date,p_status,p_minutes,p_rate,p_confirm_duplicate,p_idempotency_key,p_confirm_inactive,p_channel)`
- `replace_lesson_v2(p_old_lesson_id,p_lesson_date,p_status,p_minutes,p_rate,p_confirm_duplicate,p_idempotency_key,p_confirm_inactive)`
- Allowed status: `held` or `cancelled_billable`; price 0 is allowed, negative prices rejected.
- Both return JSON states `saved`, `duplicate`, `inactive`; invoiced edits must error.
- `change_student_with_repricing(p_student_id,p_effective_from,p_changes,p_reprice,p_idempotency_key)`: for E3 historical-price preservation, `p_reprice=false`.
- `student_details_at(p_student_id,p_at)` is set-returning; check actual Supabase client response shape.

## Release gate
Do not switch production clients to v2 until a controlled migration and disposable-DB regression suite pass, and an authorized production rollout is approved. Do not merge to main on this report alone.

## Cost and configuration check (read-only, 22 Nov 2026)

The connected Lesson Ledger organization's Supabase branch quote returned **USD 0.01344 per hour**, or approximately **USD 9.68 for 720 hours**. At 2, 4, and 8 billable hours, compute is approximately USD 0.03, 0.05, and 0.11 respectively. This is compute only, not a capped total. Supabase's published branching documentation says branches also incur their own disk, egress, storage and other usage, charged against organization allowances, and **branch compute is not covered by the normal compute credits or Spend Cap**. See https://supabase.com/docs/guides/platform/manage-your-usage/branching and https://supabase.com/docs/guides/deployment/branching.

The project currently has **zero existing Supabase branches**. A separate existing Supabase project named `pybudget-3-dev` is INACTIVE and belongs to another application; do not repurpose it without owner authorization. Free local Postgres/Docker or Supabase CLI testing could avoid cloud branch compute, but no `docker`, `psql`, `postgres`, or `supabase` executable is installed in the current runner. Node is available. A developer machine with Docker + Supabase CLI remains a potential no-additional-cloud-cost option, not a verified ready-to-run environment.

Proposed, **not created**: ephemeral development branch `lesson-ledger-e3-backend-regression` from `lesson-ledger`, default Micro compute, same EU region/settings as parent, no production data or storage copied, test fixtures only, remove promptly after acceptance. Estimate **2–4 hours**, allow up to 8 hours if migration baseline reconciliation is required. A branch built from migration history may lack E3 database objects because the parent has E3 routines not represented by its 15 recorded E1/E2 migrations; baseline reconciliation is mandatory before applying tests. No cost confirmation, branch creation, migration or fixture execution was performed.

Read-only security advisors returned 7 warnings for externally callable `SECURITY DEFINER` RPCs (`change_student`, `change_student_with_repricing`, `create_student`, `log_lesson`, `replace_lesson`, `set_student_status`, `void_lesson`) and 1 warning that leaked-password protection is disabled. The definer warnings require per-function authorization review, not indiscriminate removal of required RPC access. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

**User authorization remains limited to read-only cost/configuration inspection. Creation and charges require separate explicit approval.**

## Authorized live development regression execution (22 Nov 2026)

**Authorization change:** Project owner explicitly confirmed the connected `lesson-ledger` environment contains synthetic test data only and authorized E3 migration and transactional regression tests in this existing environment. No new Supabase branch was created and no additional branch compute charge was incurred.

**Pre-change identity and baseline:** `list_projects` confirmed project `zcszskoegwgcjgqsfmfx`, name `lesson-ledger`, region `eu-central-1`, healthy PostgreSQL 17. `list_migrations` returned 15 recorded E1/E2 migrations, no E3 migration. Captured legacy `log_lesson`, `replace_lesson`, `void_lesson` definitions, all 16 lessons constraints, 12 RLS policies, and RLS flags for 8 public tables in `docs/baselines/lesson-ledger-pre-e3-schema.json`. This is a schema baseline, not a full data backup.

**Migration applied via Supabase `apply_migration`:**
- Name: `e3_compatible_lesson_rpcs_v2_verified`
- SQL: exact `supabase/20261122_e3_compatible_lesson_rpcs.sql` from `agent/backend-db-verification` including PR #31 replay guard.
- Result: `{"success":true}`.
- Read-only post-check: both `log_lesson_v2` and `replace_lesson_v2` exist; `authenticated` has EXECUTE; `anon` does not; `lesson_paid_rate` is `rate >= 0`; `lessons_rate_check` remains `rate >= 0`. All three legacy lesson RPCs remain present and authenticated-callable.

**SQL regression execution via Supabase `execute_sql` on the authorized existing project:**
1. Exact contents of `tests/e3-backend-contract.sql` from this branch, including 400-day future lesson, same-key replay, changed-date and changed-status rejection, duplicate confirmation, zero rate, replacement history and cross-tenant isolation. **Result: SQL executed without error**, connector returned the script's `set_config` result; no failing exception. Fixture transaction ends in ROLLBACK.
2. Exact contents of `tests/tenant-isolation.sql`. **Result: SQL executed without error**; transaction ends in ROLLBACK.
3. Additional inline transaction for synthetic invoiced lesson: create synthetic user/ledger/student/lesson, mark `invoice_id` with a synthetic UUID using admin role, assert `replace_lesson_v2` rejects it with `Invoiced lesson is locked` and `void_lesson` rejects invoice-linked removal. **Result: SQL executed without error**, transaction ends in ROLLBACK. The current schema has no invoices table or invoice_id foreign key; the fixture uses the existing nullable invoice_id field. No invoice issuance workflow was tested.
4. Verification query for fixture cleanup returned **0** matching synthetic test users and **0** matching test lesson idempotency keys.
5. Multi-statement execution sanity check: `begin; select 1; do $$ begin raise exception 'EXPECTED_SENTINEL_MULTI_STATEMENT'; end $$; rollback;` produced the **expected exception**, confirming statements following a SELECT execute. This intentionally failing diagnostic is not an application test failure.

**Security advisory check after migration:** `get_advisors(type='security')` reported 9 authenticated-callable SECURITY DEFINER function warnings (previously 7, plus the two intended v2 RPCs) and 1 leaked-password-protection warning. Warnings require deliberate auth/ownership review; no auth configuration was changed. https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

**Outstanding:** E4 invoice issuance integration not available; exact invoice FK workflow cannot be tested. Test runner output is limited to SQL success/error and the last SELECT result, not per-assertion TAP output. Node/browser acceptance is integrator-owned and still not executed here. Integration branch does not yet contain PR #31; integrator must reconcile it through issue #33. Documentation `docs/backend-e3-contract.md` on integration incorrectly describes a 365-day v2 horizon; the installed v2 has no such guard and 400-day test executed successfully. No merge to main, production data reset, or unrelated infrastructure change.
