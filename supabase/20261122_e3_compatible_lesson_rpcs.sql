-- E3 additive RPCs. Review and apply on a disposable development database only.
-- Legacy log_lesson/replace_lesson are deliberately unchanged.
-- Existing lesson_paid_rate CHECK forbids zero-priced per-lesson records.
-- E3 permits goodwill (0 EUR) while retaining the nonnegative lessons_rate_check.
alter table public.lessons drop constraint if exists lesson_paid_rate;
alter table public.lessons add constraint lesson_paid_rate
 check (billing_mode <> 'per_lesson' or rate >= 0);
-- All records are append-only except the existing replacement-link metadata.
create or replace function public.log_lesson_v2(
 p_student_id uuid, p_lesson_date date, p_status text default 'held',
 p_minutes integer default null, p_rate numeric default null,
 p_confirm_duplicate boolean default false, p_idempotency_key uuid default null,
 p_confirm_inactive boolean default false, p_channel text default 'web'
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
 v_ledger uuid; v_version public.student_versions%rowtype;
 v_id uuid; v_existing uuid; v_status text; v_rate numeric;
 v_minutes integer; v_mode text;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
 if p_student_id is null or p_lesson_date is null or p_lesson_date > current_date + 365
 then raise exception 'Invalid lesson date or student'; end if;
 if p_status is null or p_status not in ('held','cancelled_billable')
 then raise exception 'Invalid status'; end if;
 if p_channel is null or p_channel not in ('web','mcp')
 then raise exception 'Invalid channel'; end if;
 select s.ledger_id into v_ledger from public.students s
 join public.ledgers l on l.id=s.ledger_id and l.owner_id=(select auth.uid())
 where s.id=p_student_id;
 if v_ledger is null then raise exception 'Student not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_student_id::text||p_lesson_date::text,0));
 select id into v_id from public.lessons
 where ledger_id=v_ledger and idempotency_key=p_idempotency_key;
 if v_id is not null then
  return jsonb_build_object('state','saved','id',v_id,'replayed',true);
 end if;
 select * into v_version from public.student_details_at(p_student_id,p_lesson_date);
 if v_version.id is null then
  select * into v_version from public.student_versions where student_id=p_student_id
  order by effective_from,created_at,id limit 1;
  if v_version.id is null then raise exception 'No student settings available'; end if;
  v_status:='not_started';
 else
  v_status:=public.student_status_at(p_student_id,p_lesson_date);
 end if;
 if v_status is distinct from 'active' and not coalesce(p_confirm_inactive,false) then
  return jsonb_build_object('state','inactive','student_status',coalesce(v_status,'unknown'));
 end if;
 select x.id into v_existing from public.lessons x
 where x.student_id=p_student_id and x.lesson_date=p_lesson_date
 and not exists(select 1 from public.lesson_voids z where z.lesson_id=x.id)
 order by x.created_at desc,x.id desc limit 1;
 if v_existing is not null and not coalesce(p_confirm_duplicate,false) then
  return jsonb_build_object('state','duplicate','existing_id',v_existing);
 end if;
 v_mode:=v_version.billing_mode;
 v_minutes:=coalesce(p_minutes,v_version.minutes);
 if v_minutes not between 5 and 240 then raise exception 'Length must be 5 to 240 minutes'; end if;
 if v_mode not in ('per_lesson','monthly_flat') or v_mode is null
 then raise exception 'Invalid billing mode'; end if;
 if v_mode='monthly_flat' then
  if p_rate is not null and p_rate<>0 then raise exception 'Monthly flat has no per-lesson charge'; end if;
  v_rate:=0;
 else
  v_rate:=coalesce(p_rate,v_version.rate);
  if v_rate is null or v_rate<0 then raise exception 'Price must be nonnegative'; end if;
 end if;
 insert into public.lessons
 (ledger_id,student_id,lesson_date,minutes,rate,billing_mode,status,no_show,
  charge_override,cancelled_by,cancelled_in_time,channel,idempotency_key)
 values(v_ledger,p_student_id,p_lesson_date,v_minutes,v_rate,v_mode,p_status,false,
  null,null,null,p_channel,p_idempotency_key)
 returning id into v_id;
 return jsonb_build_object('state','saved','id',v_id,'replayed',false);
end $$;

create or replace function public.replace_lesson_v2(
 p_old_lesson_id uuid, p_lesson_date date, p_status text,
 p_minutes integer, p_rate numeric, p_confirm_duplicate boolean,
 p_idempotency_key uuid, p_confirm_inactive boolean default false
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
 v_old public.lessons%rowtype; v_result jsonb;
 v_void_id uuid; v_new_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
 select x.* into v_old from public.lessons x
 join public.ledgers l on l.id=x.ledger_id and l.owner_id=(select auth.uid())
 where x.id=p_old_lesson_id for update of x;
 if v_old.id is null then raise exception 'Lesson not found'; end if;
 select x.id into v_new_id from public.lessons x
 where x.ledger_id=v_old.ledger_id and x.idempotency_key=p_idempotency_key;
 if v_new_id is not null then
  if exists(select 1 from public.lesson_voids z
   where z.lesson_id=p_old_lesson_id and z.replacement_id=v_new_id)
  then return jsonb_build_object('state','saved','id',v_new_id,'replayed',true); end if;
  raise exception 'Idempotency key reused';
 end if;
 if v_old.invoice_id is not null then raise exception 'Invoiced lesson is locked'; end if;
 if exists(select 1 from public.lesson_voids where lesson_id=v_old.id)
 then raise exception 'Lesson already voided'; end if;
 if p_lesson_date is null or p_lesson_date>current_date+365 then raise exception 'Invalid lesson date'; end if;
 if not coalesce(p_confirm_inactive,false) and
    (not exists(select 1 from public.student_versions v where v.student_id=v_old.student_id and v.effective_from<=p_lesson_date)
    or public.student_status_at(v_old.student_id,p_lesson_date) is distinct from 'active')
 then return jsonb_build_object('state','inactive','student_status',
   coalesce(public.student_status_at(v_old.student_id,p_lesson_date),'not_started')); end if;
 if not coalesce(p_confirm_duplicate,false) then
  select x.id into v_new_id from public.lessons x
  where x.student_id=v_old.student_id and x.lesson_date=p_lesson_date
   and x.id<>v_old.id
   and not exists(select 1 from public.lesson_voids z where z.lesson_id=x.id)
  order by x.created_at desc,x.id desc limit 1;
  if v_new_id is not null then
   return jsonb_build_object('state','duplicate','existing_id',v_new_id);
  end if;
 end if;
 -- The transaction rolls back the void if logging fails.
 insert into public.lesson_voids(ledger_id,lesson_id,reason,idempotency_key,channel)
 values(v_old.ledger_id,v_old.id,'edit',gen_random_uuid(),'web')
 returning id into v_void_id;
 v_result:=public.log_lesson_v2(v_old.student_id,p_lesson_date,p_status,p_minutes,p_rate,
   p_confirm_duplicate,p_idempotency_key,p_confirm_inactive,'web');
 if v_result->>'state'<>'saved' then raise exception 'Lesson cannot be replaced: %',v_result; end if;
 v_new_id:=(v_result->>'id')::uuid;
 update public.lesson_voids set replacement_id=v_new_id where id=v_void_id;
 update public.lessons set replaces_lesson_id=v_old.id where id=v_new_id;
 return v_result;
end $$;

revoke all on function public.log_lesson_v2(uuid,date,text,integer,numeric,boolean,uuid,boolean,text) from public,anon;
revoke all on function public.replace_lesson_v2(uuid,date,text,integer,numeric,boolean,uuid,boolean) from public,anon;
grant execute on function public.log_lesson_v2(uuid,date,text,integer,numeric,boolean,uuid,boolean,text) to authenticated;
grant execute on function public.replace_lesson_v2(uuid,date,text,integer,numeric,boolean,uuid,boolean) to authenticated;
