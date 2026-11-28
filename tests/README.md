# Backend regression tests

Run only against an isolated test database with the Lesson Ledger schema and at least one synthetic ledger. Never use a customer database. The lifecycle fixture requires privileged SQL execution and temporarily inserts billing settings on the selected ledger; it rolls back its changes.

Run: `TEST_DATABASE_URL=... bash tests/run_backend_regression.sh`.

The allocation test is read-only. The lifecycle test covers supplemental invoices, cancellation and flat fee reissuance. Its live execution has not yet been verified. Assertions must be enabled; the runner enables them and stops on the first SQL error.

CI: configure the repository secret TEST_DATABASE_URL for a dedicated test database. The workflow is manually triggered initially to avoid untrusted PR code accessing database credentials. Do not point this secret at production. Parallel transaction tests, RLS, pause and mixed-contract scenarios, performance and remaining issue #161 cases are outstanding.
