-- E3: an E2 backdated price change and its affected lesson corrections commit together.
create table if not exists public.lesson_reprice_batches (
 id uuid primary key default gen_random_uuid(),
 ledger_id uuid not null references public.ledgers(id),
 student_id uuid not null,
 idempotency_key uuid not null,
 version_id uuid not null,
 replaced_count integer not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(ledger_id,idempotency_key),
 foreign key(student_id,ledger_id) references public.students(id,ledger_id)
);
alter table public.lesson_reprice_batches enable row level security;
drop policy if exists lesson_reprice_batches_read on public.lesson_reprice_batches;
create policy lesson_reprice_batches_read on public.lesson_reprice_batches for select to authenticated
 using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
revoke all on public.lesson_reprice_batches from anon,authenticated;
grant select on public.lesson_reprice_batches to authenticated;

create or replace function public.change_student_with_repricing(
 p_student_id uuid,p_effective_from date,p_changes jsonb,
 p_reprice boolean,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_ledger uuid; v_batch public.lesson_reprice_batches%rowtype;
 v_version_id uuid; v_old public.lessons%rowtype;
 v_settings public.student_versions%rowtype; v_new_id uuid;
 v_rate numeric; v_mode text; v_count integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
 select s.ledger_id into v_ledger from public.students s
 join public.ledgers l on l.id=s.ledger_id and l.owner_id=auth.uid()
 where s.id=p_student_id for update of s;
 if v_ledger is null then raise exception 'Student not found'; end if;
 select * into v_batch from public.lesson_reprice_batches
 where ledger_id=v_ledger and idempotency_key=p_idempotency_key;
 if v_batch.id is not null then
  if v_batch.student_id<>p_student_id then raise exception 'Idempotency key reused'; end if;
  return jsonb_build_object('state','saved','version_id',v_batch.version_id,'replaced_count',v_batch.replaced_count,'replayed',true);
 end if;
 if p_reprice and not (p_changes ? 'price' or p_changes ? 'billing_mode') then
  raise exception 'Repricing requires a price or billing-mode change';
 end if;
 -- E2 version write and E3 replacements share the same PostgreSQL transaction.
 v_version_id:=public.change_student(p_student_id,p_effective_from,p_changes);
 if p_reprice then
  for v_old in
   select x.* from public.lessons x
   where x.student_id=p_student_id and x.lesson_date>=p_effective_from
   and not exists(select 1 from public.lesson_voids z where z.lesson_id=x.id)
   and x.invoice_id is null
   order by x.lesson_date,x.id
   for update of x
  loop
   select * into v_settings from public.student_details_at(p_student_id,v_old.lesson_date);
   if v_settings.id is null then raise exception 'No price settings for lesson date'; end if;
   v_mode:=v_settings.billing_mode;
   v_rate:=case when v_mode='monthly_flat' then 0 else v_settings.rate end;
   if v_mode='per_lesson' and (v_rate is null or v_rate<=0) then raise exception 'Invalid new lesson price'; end if;
   insert into public.lessons(ledger_id,student_id,lesson_date,minutes,rate,billing_mode,status,no_show,
      charge_override,cancelled_by,cancelled_in_time,channel,idempotency_key,replaces_lesson_id)
   values(v_old.ledger_id,v_old.student_id,v_old.lesson_date,v_old.minutes,v_rate,v_mode,
      v_old.status,v_old.no_show,case when v_mode='monthly_flat' then null else v_old.charge_override end,
      v_old.cancelled_by,v_old.cancelled_in_time,'web',gen_random_uuid(),v_old.id)
   returning id into v_new_id;
   insert into public.lesson_voids(ledger_id,lesson_id,reason,replacement_id,channel,idempotency_key)
   values(v_old.ledger_id,v_old.id,'reprice',v_new_id,'web',gen_random_uuid());
   v_count:=v_count+1;
  end loop;
 end if;
 insert into public.lesson_reprice_batches(ledger_id,student_id,idempotency_key,version_id,replaced_count)
 values(v_ledger,p_student_id,p_idempotency_key,v_version_id,v_count);
 return jsonb_build_object('state','saved','version_id',v_version_id,'replaced_count',v_count,'replayed',false);
end $$;
revoke all on function public.change_student_with_repricing(uuid,date,jsonb,boolean,uuid) from public,anon;
grant execute on function public.change_student_with_repricing(uuid,date,jsonb,boolean,uuid) to authenticated;
