-- E3 foundation. Apply in a staging database before production.
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id),
  student_id uuid not null,
  lesson_date date not null,
  minutes integer not null check (minutes between 5 and 240),
  rate numeric(12,2) not null check (rate >= 0),
  billing_mode text not null check (billing_mode in ('per_lesson','monthly_flat')),
  status text not null check (status in ('held','cancelled_billable','cancelled_free')),
  no_show boolean not null default false,
  charge_override text check (charge_override in ('charged','not_charged')),
  cancelled_by text check (cancelled_by in ('student','teacher')),
  cancelled_in_time boolean,
  channel text not null default 'web' check (channel in ('web','mcp')),
  idempotency_key uuid not null,
  replaces_lesson_id uuid references public.lessons(id),
  invoice_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint lesson_student_owner foreign key (student_id,ledger_id)
    references public.students(id,ledger_id),
  constraint lesson_no_show_status check (not no_show or status <> 'held'),
  constraint lesson_flat_charge check (billing_mode <> 'monthly_flat' or (rate=0 and charge_override is null)),
  constraint lesson_paid_rate check (billing_mode <> 'per_lesson' or rate>0),
  constraint lesson_held_cancel check (status <> 'held' or (not no_show and cancelled_by is null and cancelled_in_time is null)),
  unique (ledger_id,idempotency_key)
);
create index lessons_student_date_idx on public.lessons (student_id,lesson_date desc);
create index lessons_unbilled_idx on public.lessons (ledger_id,lesson_date) where invoice_id is null;

create table public.lesson_voids (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id),
  lesson_id uuid not null unique references public.lessons(id),
  reason text not null check (reason in ('undo','remove','edit','reprice')),
  replacement_id uuid references public.lessons(id),
  channel text not null default 'web' check (channel in ('web','mcp')),
  idempotency_key uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (ledger_id,idempotency_key)
);
create index lesson_voids_ledger_idx on public.lesson_voids(ledger_id);

alter table public.lessons enable row level security;
alter table public.lesson_voids enable row level security;

create policy lessons_read on public.lessons for select to authenticated
using (exists (select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy lessons_insert on public.lessons for insert to authenticated
with check (exists (select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy voids_read on public.lesson_voids for select to authenticated
using (exists (select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy voids_insert on public.lesson_voids for insert to authenticated
with check (
 exists (select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid()))
 and exists (select 1 from public.lessons x where x.id=lesson_id and x.ledger_id=lesson_voids.ledger_id and x.invoice_id is null)
);

-- E3 records are append-only. All writes should be made through the transactional
-- RPCs added in the next migration, rather than directly from the browser.
revoke update, delete on public.lessons, public.lesson_voids from anon, authenticated;
revoke insert on public.lessons, public.lesson_voids from anon, authenticated;
grant select on public.lessons, public.lesson_voids to authenticated;

-- E4 adds an invoice foreign key and invoice-locking transaction.
-- No lesson logging RPC is exposed by this foundation migration alone.
