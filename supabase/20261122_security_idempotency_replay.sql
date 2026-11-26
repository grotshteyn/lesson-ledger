-- Source-only security correction. Apply only after separate database deployment approval.
-- Preserve RPC signatures, EXECUTE grants, tenant ownership and SECURITY DEFINER search_path.
-- Existing repricing batches have NULL request_payload: fail closed on replay rather than guess.
alter table public.lesson_reprice_batches add column if not exists request_payload jsonb;

CREATE OR REPLACE FUNCTION public.change_student_with_repricing(p_student_id uuid, p_effective_from date, p_changes jsonb, p_reprice boolean, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ledger uuid; v_batch public.lesson_reprice_batches%rowtype;
 v_version_id uuid; v_old public.lessons%rowtype;
 v_settings public.student_versions%rowtype; v_new_id uuid;
 v_rate numeric; v_mode text; v_count integer:=0;
 v_request jsonb;
begin
 v_request:=jsonb_build_object('effective_from',p_effective_from,'changes',p_changes,'reprice',p_reprice);
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
 select s.ledger_id into v_ledger from public.students s
 join public.ledgers l on l.id=s.ledger_id and l.owner_id=auth.uid()
 where s.id=p_student_id for update of s;
 if v_ledger is null then raise exception 'Student not found'; end if;
 select * into v_batch from public.lesson_reprice_batches
 where ledger_id=v_ledger and idempotency_key=p_idempotency_key;
 if v_batch.id is not null then
  if v_batch.student_id<>p_student_id or v_batch.request_payload is distinct from v_request
  then raise exception 'Idempotency key reused with different student change'; end if;
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
 insert into public.lesson_reprice_batches(ledger_id,student_id,idempotency_key,version_id,replaced_count,request_payload)
 values(v_ledger,p_student_id,p_idempotency_key,v_version_id,v_count,v_request);
 return jsonb_build_object('state','saved','version_id',v_version_id,'replaced_count',v_count,'replayed',false);
end $function$


CREATE OR REPLACE FUNCTION public.log_lesson_v2(p_student_id uuid, p_lesson_date date, p_status text DEFAULT 'held'::text, p_minutes integer DEFAULT NULL::integer, p_rate numeric DEFAULT NULL::numeric, p_confirm_duplicate boolean DEFAULT false, p_idempotency_key uuid DEFAULT NULL::uuid, p_confirm_inactive boolean DEFAULT false, p_channel text DEFAULT 'web'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_ledger uuid; v_version public.student_versions%rowtype;
 v_id uuid; v_existing uuid; v_status text; v_rate numeric;
 v_minutes integer; v_mode text;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
 if p_student_id is null or p_lesson_date is null
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
  -- A retry key must not silently refer to a different lesson or payload.
  if not exists (select 1 from public.lessons x where x.id=v_id
     and x.student_id=p_student_id and x.lesson_date=p_lesson_date
     and x.status=p_status
     and x.minutes=coalesce(p_minutes,(select sv.minutes from public.student_details_at(p_student_id,p_lesson_date) sv))
     and x.rate=coalesce(p_rate,case when x.billing_mode='monthly_flat' then 0
       else (select sv.rate from public.student_details_at(p_student_id,p_lesson_date) sv) end)) then
    raise exception 'Idempotency key reused with different lesson';
  end if;
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
end $function$


CREATE OR REPLACE FUNCTION public.replace_lesson(p_old_lesson_id uuid, p_lesson_date date, p_status text, p_minutes integer, p_rate numeric, p_cancelled_by text, p_cancelled_in_time boolean, p_charge_override text, p_confirm_duplicate boolean, p_idempotency_key uuid, p_confirm_inactive boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  then
   if not exists (
    select 1 from public.lessons x
    where x.id=v_new_id and x.student_id=v_old.student_id
      and x.lesson_date=p_lesson_date
      and x.minutes=coalesce(p_minutes,(select sv.minutes from public.student_details_at(v_old.student_id,p_lesson_date) sv))
      and x.rate=coalesce(p_rate,case when x.billing_mode='monthly_flat' then 0
        else (select sv.rate from public.student_details_at(v_old.student_id,p_lesson_date) sv) end)
      and x.charge_override is not distinct from p_charge_override
      and x.cancelled_by is not distinct from p_cancelled_by
      and x.cancelled_in_time is not distinct from p_cancelled_in_time
      and ((p_status='held' and x.status='held' and x.no_show=false)
        or (p_status='no_show' and x.no_show=true)
        or (p_status='cancelled' and x.no_show=false and x.status in ('cancelled_billable','cancelled_free')))
   ) then raise exception 'Idempotency key reused with different lesson'; end if;
   return jsonb_build_object('state','saved','id',v_new_id,'replayed',true);
  end if;
  raise exception 'Idempotency key reused';
 end if;
 if v_old.invoice_id is not null then raise exception 'Lesson was invoiced in the meantime'; end if;
 if exists(select 1 from public.lesson_voids where lesson_id=v_old.id) then raise exception 'Lesson already voided'; end if;
 if not p_confirm_inactive then
  if not exists(select 1 from public.student_versions v where v.student_id=v_old.student_id and v.effective_from<=p_lesson_date) then
   return jsonb_build_object('state','inactive','student_status','not_started');
  end if;
  if public.student_status_at(v_old.student_id,p_lesson_date) is distinct from 'active' then
   return jsonb_build_object('state','inactive','student_status',coalesce(public.student_status_at(v_old.student_id,p_lesson_date),'unknown'));
  end if;
 end if;
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
end $function$

