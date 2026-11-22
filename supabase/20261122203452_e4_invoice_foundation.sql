
create table public.invoice_counters (
 ledger_id uuid not null references public.ledgers(id),
 invoice_year integer not null check(invoice_year between 2000 and 9999),
 last_number integer not null default 0 check(last_number between 0 and 9999),
 primary key(ledger_id,invoice_year)
);
create table public.invoices (
 id uuid primary key default gen_random_uuid(),
 ledger_id uuid not null references public.ledgers(id),
 student_id uuid not null,
 invoice_year integer not null check(invoice_year between 2000 and 9999),
 invoice_sequence integer not null check(invoice_sequence between 1 and 9999),
 invoice_number text not null,
 kind text not null check(kind in ('standard','cancellation')),
 original_invoice_id uuid references public.invoices(id),
 billing_month date not null check(extract(day from billing_month)=1),
 issued_on date not null,
 due_on date not null,
 currency text not null default 'EUR' check(currency='EUR'),
 vat_mode text not null check(vat_mode in ('small_business','exempt_teaching','regular_19')),
 net_amount numeric(14,2) not null,
 vat_amount numeric(14,2) not null,
 gross_amount numeric(14,2) not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 idempotency_key uuid not null,
 created_at timestamptz not null default now(),
 constraint invoice_student_ledger_fk foreign key(student_id,ledger_id) references public.students(id,ledger_id),
 constraint invoice_kind_original check ((kind='standard' and original_invoice_id is null) or (kind='cancellation' and original_invoice_id is not null)),
 constraint invoice_amount_sum check(net_amount+vat_amount=gross_amount),
 unique(ledger_id,invoice_year,invoice_sequence),
 unique(ledger_id,invoice_number),
 unique(ledger_id,idempotency_key),
 unique(original_invoice_id),
 unique(id,ledger_id)
);
create table public.invoice_lines (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null,
 ledger_id uuid not null,
 line_number integer not null check(line_number>0),
 description text not null,
 lesson_date date,
 billing_month date,
 quantity numeric(12,2) not null default 1,
 unit_gross numeric(14,2) not null,
 gross_amount numeric(14,2) not null,
 net_amount numeric(14,2) not null,
 vat_amount numeric(14,2) not null,
 lesson_id uuid references public.lessons(id),
 foreign key(invoice_id,ledger_id) references public.invoices(id,ledger_id),
 unique(invoice_id,line_number)
);
create table public.invoice_lessons (
 invoice_id uuid not null,
 ledger_id uuid not null,
 lesson_id uuid not null references public.lessons(id),
 primary key(invoice_id,lesson_id),
 foreign key(invoice_id,ledger_id) references public.invoices(id,ledger_id)
);
create index invoices_by_student_month on public.invoices(ledger_id,student_id,billing_month);
create index invoice_lessons_by_lesson on public.invoice_lessons(lesson_id);
create unique index invoice_flat_month_unique on public.invoice_lines(invoice_id,billing_month) where billing_month is not null and lesson_id is null;
alter table public.invoice_counters enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_lessons enable row level security;
create policy invoice_read on public.invoices for select to authenticated using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy invoice_line_read on public.invoice_lines for select to authenticated using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy invoice_lesson_read on public.invoice_lessons for select to authenticated using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
revoke all on public.invoice_counters from anon,authenticated;
revoke all on public.invoices,public.invoice_lines,public.invoice_lessons from anon;
grant select on public.invoices,public.invoice_lines,public.invoice_lessons to authenticated;
