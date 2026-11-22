alter table public.student_versions add column if not exists no_show_billable boolean not null default true;
-- Transactional E3 operations. SECURITY DEFINER is limited by explicit auth.uid ownership checks.
create or replace function public.log_lesson(
 p_student_id uuid, p_lesson_date date, p_status text default 'held',
 p_minutes integer default null, p_rate numeric default null,
 p_cancelled_by text default null, p_cancelled_in_time boolean default null,
 p_charge_override text default null, p_confirm_duplicate boolean default false,
 p_idempotency_key uuid default null, p_channel text default 'web',
 p_confirm_inactive boolean default false
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ledger uuid; v_version public.student_versions%rowtype; v_id uuid;
 v_existing uuid; v_status text; v_rate numeric; v_minutes integer;
 v_bill text; v_no_show boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
 if p_lesson_date is null or p_lesson_date > current_date + 365 then raise exception 'Invalid lesson date'; end if;
 if p_status='held' and p_lesson_date>current_date then raise exception 'Held lessons cannot be future-dated'; end if;
 if p_status is null or p_status not in ('held','cancelled','no_show') then raise exception 'Invalid status'; end if;
 if p_channel is null or p_channel not in ('web','mcp') then raise exception 'Invalid channel'; end if;
 select s.ledger_id into v_ledger from public.students s
 join public.ledgers l on l.id=s.ledger_id and l.owner_id=auth.uid()
 where s.id=p_student_id;
 if v_ledger is null then raise exception 'Student not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_student_id::text||p_lesson_date::text,0));
 select id into v_id from public.lessons where ledger_id=v_ledger and idempotency_key=p_idempotency_key;
 if v_id is not null then return jsonb_build_object('state','saved','id',v_id,'replayed',true); end if;
 select * into v_version from public.student_details_at(p_student_id,p_lesson_date);
 if v_version.id is null then raise exception 'No student settings for date'; end if;
 select public.student_status_at(p_student_id,p_lesson_date) into v_status;
 if v_status <> 'active' and not p_confirm_inactive then
  return jsonb_build_object('state','inactive','student_status',v_status);
 end if;
 select x.id into v_existing from public.lessons x where x.student_id=p_student_id
 and x.lesson_date=p_lesson_date and not exists
 (select 1 from public.lesson_voids z where z.lesson_id=x.id)
 order by x.created_at desc limit 1;
 if v_existing is not null and not p_confirm_duplicate then
  return jsonb_build_object('state','duplicate','existing_id',v_existing);
 end if;
 v_bill:=v_version.billing_mode;
 v_minutes:=coalesce(p_minutes,v_version.minutes);
 if v_minutes not between 5 and 240 then raise exception 'Length must be 5 to 240 minutes'; end if;
 v_rate:=case when v_bill='monthly_flat' then 0 else coalesce(p_rate,v_version.rate) end;
 if v_bill='per_lesson' and (v_rate is null or v_rate<=0) then raise exception 'Positive price required'; end if;
 if v_bill='monthly_flat' and (p_rate is not null or p_charge_override is not null) then raise exception 'Monthly flat has no per-lesson charge'; end if;
 if p_charge_override is not null and p_charge_override not in ('charged','not_charged') then raise exception 'Invalid override'; end if;
 if p_status='cancelled' then
  if p_cancelled_by not in ('student','teacher') then raise exception 'Who cancelled is required'; end if;
  if p_cancelled_by='student' and p_cancelled_in_time is null then raise exception 'Cancellation timing required'; end if;
 elsif p_cancelled_by is not null or p_cancelled_in_time is not null then
  raise exception 'Cancellation answers only allowed for cancellation';
 end if;
 v_no_show:=p_status='no_show';
 v_status:=case when p_status='held' then 'held'
 when (v_no_show and v_version.no_show_billable) or (p_cancelled_by='student' and not p_cancelled_in_time) then 'cancelled_billable'
 else 'cancelled_free' end;
 insert into public.lessons (ledger_id,student_id,lesson_date,minutes,rate,billing_mode,status,no_show,charge_override,cancelled_by,cancelled_in_time,channel,idempotency_key)
 values(v_ledger,p_student_id,p_lesson_date,v_minutes,v_rate,v_bill,v_status,v_no_show,p_charge_override,p_cancelled_by,p_cancelled_in_time,p_channel,p_idempotency_key)
 returning id into v_id;
 return jsonb_build_object('state','saved','id',v_id,'replayed',false);
end $$;
revoke all on function public.log_lesson(uuid,date,text,integer,numeric,text,boolean,text,boolean,uuid,text,boolean) from public,anon;
grant execute on function public.log_lesson(uuid,date,text,integer,numeric,text,boolean,text,boolean,uuid,text,boolean) to authenticated;

create or replace function public.void_lesson(
 p_lesson_id uuid, p_reason text, p_idempotency_key uuid, p_channel text default 'web'
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_lesson public.lessons%rowtype; v_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
 if p_reason is null or p_reason not in ('undo','remove','edit','reprice') then raise exception 'Invalid reason'; end if;
 if p_channel is null or p_channel not in ('web','mcp') then raise exception 'Invalid channel'; end if;
 select x.* into v_lesson from public.lessons x join public.ledgers l on l.id=x.ledger_id and l.owner_id=auth.uid()
 where x.id=p_lesson_id for update of x;
 if v_lesson.id is null then raise exception 'Lesson not found'; end if;
 select id into v_id from public.lesson_voids where ledger_id=v_lesson.ledger_id and idempotency_key=p_idempotency_key;
 if v_id is not null then return v_id; end if;
 if v_lesson.invoice_id is not null then raise exception 'Invoiced lesson is locked'; end if;
 if exists (select 1 from public.lesson_voids where lesson_id=p_lesson_id) then raise exception 'Already voided'; end if;
 insert into public.lesson_voids(ledger_id,lesson_id,reason,idempotency_key,channel)
 values(v_lesson.ledger_id,p_lesson_id,p_reason,p_idempotency_key,p_channel) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.void_lesson(uuid,text,uuid,text) from public,anon;
grant execute on function public.void_lesson(uuid,text,uuid,text) to authenticated;

-- Atomic edit: a failed replacement rolls back the void as well.
create or replace function public.replace_lesson(
 p_old_lesson_id uuid, p_lesson_date date, p_status text,
 p_minutes integer, p_rate numeric,
 p_cancelled_by text, p_cancelled_in_time boolean,
 p_charge_override text, p_confirm_duplicate boolean,
 p_idempotency_key uuid, p_confirm_inactive boolean default false
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_old public.lessons%rowtype; v_result jsonb; v_void_id uuid; v_new_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
 select x.* into v_old from public.lessons x
 join public.ledgers l on l.id=x.ledger_id and l.owner_id=auth.uid()
 where x.id=p_old_lesson_id for update of x;
 if v_old.id is null then raise exception 'Lesson not found'; end if;
 select x.id into v_new_id from public.lessons x
 where x.ledger_id=v_old.ledger_id and x.idempotency_key=p_idempotency_key;
 if v_new_id is not null then
  if exists(select 1 from public.lesson_voids z where z.lesson_id=p_old_lesson_id and z.replacement_id=v_new_id)
  then return jsonb_build_object('state','saved','id',v_new_id,'replayed',true); end if;
  raise exception 'Idempotency key reused';
 end if;
 if v_old.invoice_id is not null then raise exception 'Lesson was invoiced in the meantime'; end if;
 if exists(select 1 from public.lesson_voids where lesson_id=v_old.id) then raise exception 'Lesson already voided'; end if;
 if not p_confirm_duplicate then
  select x.id into v_new_id from public.lessons x
  where x.student_id=v_old.student_id and x.lesson_date=p_lesson_date
  and x.id<>v_old.id
  and not exists(select 1 from public.lesson_voids z where z.lesson_id=x.id)
  order by x.created_at desc limit 1;
  if v_new_id is not null then return jsonb_build_object('state','duplicate','existing_id',v_new_id); end if;
 end if;
 -- Void before logging so the old record is excluded from duplicate checks.
 insert into public.lesson_voids(ledger_id,lesson_id,reason,idempotency_key,channel)
 values(v_old.ledger_id,v_old.id,'edit',gen_random_uuid(),'web') returning id into v_void_id;
 v_result:=public.log_lesson(v_old.student_id,p_lesson_date,p_status,p_minutes,p_rate,
 p_cancelled_by,p_cancelled_in_time,p_charge_override,p_confirm_duplicate,p_idempotency_key,'web',p_confirm_inactive);
 if v_result->>'state'<>'saved' then raise exception 'Lesson cannot be replaced: %',v_result; end if;
 v_new_id:=(v_result->>'id')::uuid;
 update public.lesson_voids set replacement_id=v_new_id where id=v_void_id;
 update public.lessons set replaces_lesson_id=v_old.id where id=v_new_id;
 return v_result;
end $$;
revoke all on function public.replace_lesson(uuid,date,text,integer,numeric,text,boolean,text,boolean,uuid,boolean) from public,anon;
grant execute on function public.replace_lesson(uuid,date,text,integer,numeric,text,boolean,text,boolean,uuid,boolean) to authenticated;
