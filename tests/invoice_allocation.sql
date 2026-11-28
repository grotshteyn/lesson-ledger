-- Pure allocation and Berlin calendar regression; no fixtures required.
DO $$
begin
 assert public.invoice_allocation_month(date '2025-10-01',date '2026-01-01',false)=date '2025-10-01';
 assert public.invoice_allocation_month(date '2025-10-01',date '2026-01-01',true)=date '2026-01-01';
 assert public.invoice_allocation_month(date '2025-12-01',date '2026-02-01',true)=date '2026-02-01';
 assert date_trunc('month',timestamptz '2025-12-31 23:00:00+00' at time zone 'Europe/Berlin')::date=date '2026-01-01';
 assert date_trunc('month',timestamptz '2026-06-30 22:00:00+00' at time zone 'Europe/Berlin')::date=date '2026-07-01';
 assert date_trunc('month',timestamptz '2026-06-30 21:59:59+00' at time zone 'Europe/Berlin')::date=date '2026-06-01';
end $$;
select 'PASS allocation and Berlin boundaries' as result;