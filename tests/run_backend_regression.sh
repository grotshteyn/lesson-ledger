#!/usr/bin/env bash
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to an isolated test database}"
cd "$(dirname "$0")"
for test in invoice_allocation.sql issue_161_invoice_regression.sql; do
  printf '\nRunning %s\n' "$test"
  psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c 'SET plpgsql.check_asserts = on' -f "$test"
done
echo 'All backend regression files passed'
