# E4 backend integration contract (implemented, 2026-11-22)

Backend branch: `feature/e4-invoicing-backend`, draft PR #56. Shared issues #54 and #55.
This document describes the **current deployed RPCs**, not the earlier token-based proposal.
**Do not enable live invoice actions until authenticated frontend E2E, cancellation success, and PDF generation tests pass.**

## RPCs (Supabase `supabase.rpc`)

- `list_invoice_overview({p_through_month:"2026-10-01"})`: returns `{months:[{billing_month,candidates:[{student_id,student_name,billing_month,gross_amount,status,validation_errors}],issued:[{invoice_id,student_id,invoice_number,kind,issued_on,gross_amount,status}]}]}`. Searches at most 24 months. Candidate status `ready` or `missing_details`.
- `get_invoice_preview({p_student_id:"uuid",p_billing_month:"2026-10-01"})`: returns invoice date, due date, teacher, payer, student name, VAT mode, `lines`, `excluded_lessons`, decimal-string totals and `validation_errors`.
- `issue_invoices({p_selections:[{student_id:"uuid",billing_month:"2026-10-01"}],p_idempotency_key:"uuid"})`: batch of 1–30, each independently attempted; returns `{results:[{student_id,billing_month,status:"issued",invoice_id,invoice_number,replayed:false}|{student_id,billing_month,status:"failed",error_code:"..."}]}`. Generate one UUID for each confirmation and reuse it on retry. Some items may succeed while others fail.
- `issue_invoice({p_student_id:"uuid",p_billing_month:"2026-10-01",p_idempotency_key:"uuid"})`: optional single-item call; returns `{status:"issued",invoice_id,invoice_number,replayed:boolean}`; errors are Postgres exceptions.
- `get_invoice({p_invoice_id:"uuid"})`: immutable `snapshot`, `lines`, totals, status, cancellation ID, and `pdf_status:"on_demand"` (this field does **not** dynamically track Storage).
- `cancel_invoice({p_invoice_id:"uuid",p_idempotency_key:"uuid"})`: creates a numbered negative invoice, returns `{status:"cancelled",invoice_id,invoice_number,replayed:boolean}`; original invoice is retained, lesson locks released. The caller must fetch the new invoice and reissue corrections separately. This path needs full success-path E2E.

All billing months are **first-of-month** ISO dates, all monetary JSON values are decimal strings, and invoice date is today's date. Server is the source of truth. No preview/confirmation tokens.

## PDF

Call the authenticated Supabase Edge Function `invoice-pdf` with `POST` JSON `{"invoice_id":"uuid"}` and the user's access token in `Authorization: Bearer <token>`. The function verifies the user, reads invoice/lines via their RLS identity, generates the PDF from the immutable snapshot and stores it in private `invoice-pdfs` Storage. It returns `{status:"ready",url:"short-lived signed URL"}`. Repeat calls reuse the existing PDF. PDF creation happens **after** the invoice DB commit and may be retried independently.

No emails are sent automatically. Do not construct Storage paths or use service-role credentials in the browser.

## Integration decisions

- Dynamic previews, no saved drafts.
- Monthly flat fee: one full fee for a month with at least one active day, none for fully paused months, even when there are no lessons.
- Per-lesson invoices include positive billable lessons; excluded lessons are teacher-only.
- A single student/month can be issued again only after cancellation.
- Batch reports per-item outcomes. Frontend must not show an invoice as issued before RPC success.
- No automated replacement: cancel, edit lessons/settings via E3, then issue a new invoice.
- Missing payer address, teacher IBAN/tax/VAT mode and empty billable items block issuance.
- `get_invoice` reports `on_demand`; use Edge Function response as the authoritative availability check.
- Error codes in `validation_errors` are stable-ish but still need frontend contract review; failed batch `error_code` currently carries truncated database exception text, not a normalized enum.

## Release gates (NOT all met)

- [x] SQL preview/overview smoke tests including tenant isolation
- [x] Rejected issuance and rejected batch tests
- [x] Single issuance and replay tested previously in a rolled-back SQL fixture
- [x] Edge Function deployed and private bucket provisioned
- [ ] Authenticated PDF generation and download verified using a real issued test invoice
- [ ] Cancellation and reissue verified end to end
- [ ] Frontend wireframe flows integrated and tested
- [ ] Financial edge cases, numbering concurrency and migration-history reconciliation
- [ ] Security advisor review and release signoff
