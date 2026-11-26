# Security replay-guard change review (22 November 2026)

This branch contains **source only**. No database changes were executed. It targets `design/three-tab-german-refactor` and is tracked in issue #33.

## Deployment order

1. Reconcile draft backend PR #31 separately. The integration branch already includes the V2 replacement replay guard, so this branch does not duplicate it.
2. On an explicitly approved disposable environment with the E3 V2 migration already applied, review and apply `supabase/20261122_security_idempotency_replay.sql`.
3. Execute `tests/security-idempotency-replay.sql` and the existing `tests/e3-backend-contract.sql` and `tests/tenant-isolation.sql` in that environment.
4. Inspect grants, function signatures, schema diff, and auth/tenant behavior. Deploy to the connected environment only after separate approval.

## Compatibility

- No RPC names, argument types, defaults, return shapes, grants, owners, or search paths are changed.
- `change_student_with_repricing` stores canonical JSONB request details in an additive nullable `lesson_reprice_batches.request_payload` column. Same-key same-payload retries succeed; changed date, changes JSON, or repricing flag fails. Existing batches without a stored request are **fail-closed on replay**. This is a behavior change for historical retries, not a signature change; owner/integrator should review it.
- `log_lesson_v2` continues accepting omitted minutes and rate. Replays resolve omitted values from the current effective student version and compare them to the stored lesson. If defaults changed, replay fails closed instead of silently returning success. Explicit snapshots remain the preferred client contract. No new client parameters required.
- Legacy `replace_lesson` compares persisted replacement date, status family, minutes, rate, cancellation metadata, and charge override before returning a replay. Confirmation flags do not affect the persisted lesson and are not compared. Null minutes/rate use current effective defaults, so changed defaults can cause a conservative replay rejection.
- The legacy `log_lesson` creation endpoint remains unchanged and still has its own replay weakness outside the three approved fixes. A later dedicated review should address it.

## Known limitations

- Historical repricing batches cannot be compared to their original payload because that payload was never stored. Conservative rejection is deliberate.
- Resolving omitted defaults on replay does not distinguish the caller's original intent when a default changes and then returns to its previous value. A durable per-request fingerprint for V2 creates would require additional persistence and migration planning.
- Legacy replacement compares the persisted semantic outcome, not confirmation flags or every input spelling; no request fingerprint exists for historical replacements.
- The security migration and SQL regression suite were **not executed** on the connected Supabase database. SQL syntax and runtime behavior require approved isolated verification. No Auth settings, grants or production infrastructure were modified.
