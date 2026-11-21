-- E2 WP1: student identity, dated details, lifecycle history.
-- Apply to a dedicated test database before production.
create table public.students (
 id uuid primary key default gen_random_uuid(),
 ledger_id uuid not null references public.ledgers(id),
 created_at timestamptz not null default now(),
 unique (id, ledger_id)
);
create index students_ledger_idx on public.students(ledger_id);

create table public.student_versions (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null,
 ledger_id uuid not null,
 effective_from date not null,
 created_at timestamptz not null default now(),
 student_name text not null check (length(btrim(student_name)) > 0),
 nickname text,
 subject text not null check (length(btrim(subject)) > 0),
 minutes integer not null check (minutes > 0),
 lessons_per_week numeric(5,2) not null default 1 check (lessons_per_week > 0),
 billing_mode text not null check (billing_mode in ('per_lesson','monthly_flat')),
 rate numeric(12,2),
 monthly_fee numeric(12,2),
 payer_name text not null check (length(btrim(payer_name)) > 0),
 payer_address jsonb,
 payer_email text,
 location text check (location in ('my_place','student_home','online')),
 cancellation_rule text not null default '24h' check (cancellation_rule='24h'),
 constraint student_versions_parent_fk foreign key(student_id,ledger_id)
   references public.students(id,ledger_id),
 constraint student_versions_price_chk check (
   (billing_mode='per_lesson' and rate>0 and monthly_fee is null)
   or (billing_mode='monthly_flat' and monthly_fee>0 and rate is null)),
 constraint student_versions_email_chk check (
   payer_email is null or payer_email='' or payer_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
);
create index student_versions_asof_idx
 on public.student_versions(student_id,effective_from desc,created_at desc,id desc);

create table public.student_status_events (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null,
 ledger_id uuid not null,
 effective_from date not null,
 created_at timestamptz not null default now(),
 event_type text not null check(event_type in ('pause','restart','end','remove')),
 pause_until date,
 constraint student_status_parent_fk foreign key(student_id,ledger_id)
   references public.students(id,ledger_id),
 constraint student_status_pause_chk check (
   (event_type='pause' and (pause_until is null or pause_until>effective_from))
   or (event_type<>'pause' and pause_until is null))
);
create index student_status_asof_idx
 on public.student_status_events(student_id,effective_from desc,created_at desc,id desc);

alter table public.students enable row level security;
alter table public.student_versions enable row level security;
alter table public.student_status_events enable row level security;

create policy students_read on public.students for select to authenticated
 using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy students_add on public.students for insert to authenticated
 with check (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy student_versions_read on public.student_versions for select to authenticated
 using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy student_versions_add on public.student_versions for insert to authenticated
 with check (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy student_status_read on public.student_status_events for select to authenticated
 using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy student_status_add on public.student_status_events for insert to authenticated
 with check (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));

-- Do not grant UPDATE or DELETE to browser roles.
revoke update,delete on public.students,public.student_versions,public.student_status_events from anon,authenticated;
grant select,insert on public.students,public.student_versions,public.student_status_events to authenticated;

-- Invoker rights preserve table RLS; no client-side historical calculations.
create function public.student_details_at(p_student_id uuid,p_at date default current_date)
returns setof public.student_versions language sql stable security invoker
set search_path = '' as $$
 select v.* from public.student_versions v
 where v.student_id=p_student_id and v.effective_from<=p_at
 order by v.effective_from desc,v.created_at desc,v.id desc limit 1
$$;
create function public.student_status_at(p_student_id uuid,p_at date default current_date)
returns text language sql stable security invoker
set search_path = '' as $$
 with latest as (
  select e.* from public.student_status_events e
  where e.student_id=p_student_id and e.effective_from<=p_at
  order by e.effective_from desc,e.created_at desc,e.id desc limit 1
 )
 select case when not exists (select 1 from public.students s where s.id=p_student_id) then null
 else coalesce((select case
   when event_type='pause' and pause_until is not null and p_at>=pause_until then 'active'
   when event_type='pause' then 'paused'
   when event_type='restart' then 'active'
   when event_type='end' then 'ended'
   when event_type='remove' then 'removed'
 end from latest),'active') end
$;
revoke all on function public.student_details_at(uuid,date),public.student_status_at(uuid,date) from public,anon;
grant execute on function public.student_details_at(uuid,date),public.student_status_at(uuid,date) to authenticated;

-- Initial monthly-flat students may start on any date; only subsequent monthly
-- changes and flat-fee pauses must be first-of-month, validated by write RPC.
-- Note: creation must use one transactional RPC before ST-1 ships.
-- Status-event conflict validation and monthly pause boundaries must be
-- enforced by the write RPC, not by trusting the browser.
