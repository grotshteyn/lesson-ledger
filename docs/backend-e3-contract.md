# Backend E1–E3 handoff for issue #24

## Scope and observed state (22 Nov 2026)

Read-only inspection of the connected Supabase project found RLS enabled on ledgers, billing_settings_versions, students, student_versions, student_status_events, lessons, lesson_voids, and lesson_reprice_batches. Production has E1/E2 migration history but **no recorded E3 migration**. This branch does not deploy SQL or modify live records.

Existing signatures (unchanged):
- `student_details_at(p_student_id uuid, p_at date default current_date) -> setof student_versions`
- `student_status_at(p_student_id uuid, p_at date default current_date) -> text`
- `find_students(p_query text default '', p_status text default 'active', p_at date default current_date)` returns student_id, student_name, nickname, subject, payer_name, billing_mode, rate, monthly_fee, status, match_rank.
- `create_student(p_details jsonb) -> uuid` requires student_name, subject, payer_name, billing_mode, minutes, price and optionally start_date, lessons_per_week, nickname, payer_address, payer_email, location. **Price must be positive**.
- `set_student_status(p_student_id uuid,p_event text,p_effective_from date,p_pause_until date default null) -> uuid`.
- `log_lesson(p_student_id uuid,p_lesson_date date,p_status text,p_minutes integer,p_rate numeric,p_cancelled_by text,p_cancelled_in_time boolean,p_charge_override text,p_confirm_duplicate boolean,p_idempotency_key uuid,p_channel text,p_confirm_inactive boolean) -> jsonb` with defaults for trailing optional arguments.
- `replace_lesson(p_old_lesson_id uuid,p_lesson_date date,p_status text,p_minutes integer,p_rate numeric,p_cancelled_by text,p_cancelled_in_time boolean,p_charge_override text,p_confirm_duplicate boolean,p_idempotency_key uuid,p_confirm_inactive boolean) -> jsonb`.
- `void_lesson(p_lesson_id uuid,p_reason text,p_idempotency_key uuid,p_channel text default 'web') -> uuid`.

Legacy `log_lesson` accepts `held|cancelled|no_show`, rejects future held lessons and per-lesson rate 0, and translates cancellation into stored `held|cancelled_billable|cancelled_free`. Existing client must continue using legacy signatures until integration switches it deliberately.

## Additive E3 contract

The SQL file `supabase/20261122_e3_compatible_lesson_rpcs.sql` introduces:
- `log_lesson_v2(p_student_id uuid,p_lesson_date date,p_status text default 'held',p_minutes integer default null,p_rate numeric default null,p_confirm_duplicate boolean default false,p_idempotency_key uuid default null,p_confirm_inactive boolean default false,p_channel text default 'web') -> jsonb`.
- `replace_lesson_v2(p_old_lesson_id uuid,p_lesson_date date,p_status text,p_minutes integer,p_rate numeric,p_confirm_duplicate boolean,p_idempotency_key uuid,p_confirm_inactive boolean default false) -> jsonb`.

Only `held` and `cancelled_billable` are accepted. A rate of **0** is valid; a negative rate is not. Monthly-flat lessons always snapshot rate 0 and reject a nonzero per-lesson override. The v2 lesson RPCs have no arbitrary 365-day future-date limit. The legacy log_lesson RPC retains its old date restrictions. A transactional v2 regression test successfully saved a held lesson 400 days in the future. No existing record is repriced when a student's defaults change. The edit API requires explicit persisted minutes and rate, so changing date does not silently refill them from student defaults.

Both RPCs require a UUID idempotency key and a signed-in tenant owner. Results: `{state:'saved',id,replayed}`, `{state:'duplicate',existing_id}`, `{state:'inactive',student_status}`. Retry with the same key only for the **same intended operation**. For duplicate/inactive prompts, retry with the same key and confirmation flag set. Use a new UUID for a new user action.

`replace_lesson_v2` preserves append-only history via lesson_voids and replacement links. It rejects invoiced and already voided lessons. `void_lesson` remains the existing removal API, including its invoice lock. SECURITY DEFINER routines verify `auth.uid()` ownership before accessing student/lesson records; execute permission is restricted to authenticated.

## User story traceability

| Story | Coverage |
| --- | --- |
| LE-1 / LE-3 / LE-3.4 | Server-side lesson creation, historical defaults, future held dates, 5–240 minutes |
| LE-4 | Duplicate detection and explicit server confirmation |
| LE-5 | Simplified cancellation, billable status with zero-price waiver |
| LE-6 | Append-only replacement, idempotent retry, invoice and void locks, historical rate snapshot |
| ST-1 / ST-4 | Existing effective-dated student versions; zero student *default* price remains unsupported by create_student |
| ST-6 / ST-6.5 | Existing tenant-scoped student and active_lessons read models |
| E1 tenant isolation | Ownership checks in new RPCs and existing RLS; cross-tenant regression fixture |

## Safe migration / rollback

1. On an isolated **development** database with a matching schema, inspect migration history and review the SQL file. No production schema modifications are authorized by this PR.
2. Apply the additive SQL with the team's normal migration process. Validate signatures and execute grants.
3. Execute `tests/e3-backend-contract.sql` against that disposable database; it uses transactional fixtures and rolls back. Then run existing `tests/tenant-isolation.sql`.
4. Integrate Lessons client only after v2 functions are available. Old clients keep using old RPCs.
5. Rollback before any v2 client rollout: `drop function if exists public.replace_lesson_v2(uuid,date,text,integer,numeric,boolean,uuid,boolean);` then `drop function if exists public.log_lesson_v2(uuid,date,text,integer,numeric,boolean,uuid,boolean,text);`. Do not drop while clients depend on them.

## Outstanding risks and unverified cases

- SQL is **not executed** against any database in this branch. The rollback-only test script is provided but not run. Database-level runtime verification and migration ordering remain integration gates.
- Existing E3 routines are present in the live database but not in recorded migrations; recreate a reproducible baseline before promoting the new SQL.
- Confirm exact E3 wireframe/story details and business semantics with product owner, especially whether zero-price student defaults are intended and any future product-level date horizon if one is later specified.
- Invoiced-lock and historical price cases require an additional disposable-db fixture with invoice schema; existing RPC source confirms the lock but the new test does not simulate invoice issuance.
- `active_lessons` view permissions and RLS behavior should be verified under each authenticated user in a development database.
- UI screenshots are not applicable to this backend-only PR.
