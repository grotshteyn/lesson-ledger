# E4 backend API contract (draft v0.1)

Coordination: https://github.com/grotshteyn/lesson-ledger/issues/55

This file is a **proposal**, not a statement that the RPCs are deployed. Frontend should mock these response shapes until the backend implementation and contract tests land.

## Baselines
- Git feature work starts from `main`.
- Live Supabase is the deployed schema baseline.
- Migration `20261122203452_e4_invoice_foundation` is already applied in production. Do not reapply it. Import the original deployed SQL into Git before further migrations.
- Currency is EUR. All monetary JSON fields are **decimal strings**, e.g. `"125.00"`, never binary floating point.

## Read: `list_invoice_overview(p_through_month date)`
Input month is a first-of-month date. Only completed months through the requested month appear as candidates. Return an object:
```json
{
  "months": [
    {
      "billing_month": "2026-10-01",
      "candidates": [
        {
          "student_id": "uuid",
          "student_name": "Example",
          "status": "ready",
          "gross_amount": "120.00",
          "validation_errors": []
        }
      ],
      "issued": []
    }
  ]
}
```
Candidate status: `ready` or `missing_details`. Issued invoices are separate from calculated candidates. The backend decides whether a candidate is eligible.

## Read: `get_invoice_preview(p_student_id uuid, p_billing_month date)`
```json
{
  "student_id": "uuid",
  "billing_month": "2026-10-01",
  "invoice_date": "2026-11-22",
  "due_date": "2026-12-06",
  "teacher": {},
  "payer": {},
  "vat_mode": "regular_19",
  "lines": [
    {"lesson_id":"uuid","description":"Lesson 2026-10-03","gross_amount":"60.00"}
  ],
  "excluded_lessons": [],
  "net_amount": "50.42",
  "vat_amount": "9.58",
  "gross_amount": "60.00",
  "validation_errors": [],
  "warnings": []
}
```
Amounts and payer/teacher data are server-calculated. Excluded, zero-price lessons are shown privately, not as positive invoice lines. Their processed/unbilled state is still an explicit open decision.

## Write: `issue_invoices(p_selections jsonb, p_idempotency_key uuid)`
`p_selections` is an array of `{"student_id":"uuid","billing_month":"2026-10-01"}`.
Backend revalidates all data and invoice eligibility at issuance time. It assigns per-ledger, per-year gapless numbers in transactions and locks billed lessons. An example response:
```json
{
  "results": [
    {"student_id":"uuid","billing_month":"2026-10-01","status":"issued","invoice_id":"uuid","invoice_number":"2026-0001"},
    {"student_id":"uuid","billing_month":"2026-10-01","status":"failed","error_code":"missing_details"}
  ]
}
```
A partial success is possible; UI must display each result. Retried requests must not issue duplicates. PDF generation follows the DB commit and is retryable.

## Read: `get_invoice(p_invoice_id uuid)`
Return the immutable invoice snapshot, lines, status (`issued` or `cancelled` for original), and PDF availability (`pending` or `ready`). No client-side recalculation.

## Write: `cancel_invoice(p_invoice_id uuid, p_idempotency_key uuid)`
Create a numbered cancellation invoice with negative amounts, retain the original, and release its lesson locks. Reissuing uses the ordinary draft/issue path. A second cancellation must not create another document.

## Error codes (proposed)
`unauthenticated`, `not_found`, `invalid_month`, `missing_details`, `no_billable_items`, `already_billed`, `stale_preview`, `idempotency_conflict`, `invoice_cancelled`, `internal_error`.

## Integration requirements
- RLS and ledger ownership on every read/write.
- Issued snapshots and invoice lines cannot be edited through the Data API.
- Existing E3 lesson edit/void RPCs must reject invoiced lessons until cancellation.
- VAT 19% calculated once on invoice gross total, with legally appropriate exemption text for non-regular modes.
- Monthly flat fees use the first-of-month effective version, no prorating, no fee for fully paused months, and can be invoiced without lessons.
- No PDF link is exposed before the object is present in private Storage.
- Contracts and examples will be revised together with the frontend owner before marking stable.
