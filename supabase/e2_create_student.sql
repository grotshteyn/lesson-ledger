-- E2: transactional student creation, owned by authenticated ledger.
create or replace function public.create_student(p_details jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
 v_ledger uuid;
 v_student uuid;
 v_name text := nullif(btrim(p_details->>'student_name'),'');
 v_subject text := nullif(btrim(p_details->>'subject'),'');
 v_payer text := nullif(btrim(p_details->>'payer_name'),'');
 v_mode text := p_details->>'billing_mode';
 v_date date;
 v_minutes integer;
 v_frequency numeric;
 v_price numeric;
 v_email text := nullif(btrim(p_details->>'payer_email'),'');
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 select l.id into v_ledger from public.ledgers l where l.owner_id=(select auth.uid()) limit 1;
 if v_ledger is null then raise exception 'Ledger not found'; end if;
 if v_name is null or v_subject is null or v_payer is null then
   raise exception 'Student name, subject and payer name are required';
 end if;
 if v_mode not in ('per_lesson','monthly_flat') or v_mode is null then
   raise exception 'Invalid billing mode';
 end if;
 begin
  v_date := coalesce((p_details->>'start_date')::date,current_date);
  v_minutes := (p_details->>'minutes')::integer;
  v_frequency := coalesce((p_details->>'lessons_per_week')::numeric,1);
  v_price := (p_details->>'price')::numeric;
 exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
  raise exception 'Invalid date, lesson length, frequency or price';
 end;
 if v_minutes is null or v_minutes<=0 or v_frequency<=0 or v_frequency is null
    or v_price<=0 or v_price is null then
  raise exception 'Lesson length, frequency and price must be positive';
 end if;
 if v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
  raise exception 'Invalid payer email';
 end if;
 insert into public.students(ledger_id) values(v_ledger) returning id into v_student;
 insert into public.student_versions(student_id,ledger_id,effective_from,student_name,nickname,subject,
 minutes,lessons_per_week,billing_mode,rate,monthly_fee,payer_name,payer_address,payer_email,location)
 values(v_student,v_ledger,v_date,v_name,nullif(btrim(p_details->>'nickname'),''),v_subject,
 v_minutes,v_frequency,v_mode,
 case when v_mode='per_lesson' then v_price end,
 case when v_mode='monthly_flat' then v_price end,
 v_payer,p_details->'payer_address',v_email,nullif(p_details->>'location',''));
 return v_student;
end $$;
revoke all on function public.create_student(jsonb) from public,anon;
grant execute on function public.create_student(jsonb) to authenticated;
-- Invoker RPC requires INSERT grants. Frontend must call RPC for atomic creation.
-- Direct authenticated inserts remain possible under RLS until a hardened write API is introduced.
grant insert on public.students,public.student_versions to authenticated;
create index student_versions_parent_ledger_idx on public.student_versions(student_id,ledger_id);
create index student_status_parent_ledger_idx on public.student_status_events(student_id,ledger_id);
