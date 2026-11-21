-- E2: effective-dated changes and lifecycle commands.
create function public.change_student(p_student_id uuid,p_effective_from date,p_changes jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
 old public.student_versions%rowtype;
 v_ledger uuid;
 v_id uuid;
 v_mode text;
 v_price numeric;
 v_name text;
 v_payer text;
 v_subject text;
 v_email text;
 v_minutes integer;
 v_frequency numeric;
 v_address jsonb;
 v_location text;
begin
 select s.ledger_id into v_ledger from public.students s
 join public.ledgers l on l.id=s.ledger_id
 where s.id=p_student_id and l.owner_id=(select auth.uid());
 if v_ledger is null then raise exception 'Student not found'; end if;
 if p_effective_from is null then raise exception 'Effective date required'; end if;
 select * into old from public.student_details_at(p_student_id,p_effective_from);
 if old.id is null then raise exception 'Date precedes student start'; end if;
 if p_changes ? 'student_name' then raise exception 'Student name changes are not supported'; end if;
 v_mode:=coalesce(p_changes->>'billing_mode',old.billing_mode);
 v_price:=case when p_changes ? 'price' then (p_changes->>'price')::numeric
               when v_mode=old.billing_mode then coalesce(old.rate,old.monthly_fee)
               else null end;
 v_name:=old.student_name;
 v_subject:=coalesce(nullif(btrim(p_changes->>'subject'),''),old.subject);
 v_payer:=coalesce(nullif(btrim(p_changes->>'payer_name'),''),old.payer_name);
 v_email:=case when p_changes ? 'payer_email' then nullif(btrim(p_changes->>'payer_email'),'') else old.payer_email end;
 v_minutes:=coalesce((p_changes->>'minutes')::integer,old.minutes);
 v_frequency:=coalesce((p_changes->>'lessons_per_week')::numeric,old.lessons_per_week);
 v_address:=case when p_changes ? 'payer_address' then p_changes->'payer_address' else old.payer_address end;
 v_location:=case when p_changes ? 'location' then nullif(p_changes->>'location','') else old.location end;
 if v_mode not in ('per_lesson','monthly_flat') or v_price is null or v_price<=0
 or v_minutes<=0 or v_frequency<=0 or btrim(v_subject)='' or btrim(v_payer)=''
 then raise exception 'Invalid student details'; end if;
 if v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 then raise exception 'Invalid payer email'; end if;
 if (old.billing_mode='monthly_flat' or v_mode='monthly_flat')
 and extract(day from p_effective_from)<>1
 and (v_mode<>old.billing_mode or v_price is distinct from coalesce(old.rate,old.monthly_fee))
 then raise exception 'Monthly billing changes must start on the first day of a month'; end if;
 insert into public.student_versions(student_id,ledger_id,effective_from,student_name,nickname,subject,
 minutes,lessons_per_week,billing_mode,rate,monthly_fee,payer_name,payer_address,payer_email,location)
 values(p_student_id,v_ledger,p_effective_from,v_name,
 case when p_changes ? 'nickname' then nullif(btrim(p_changes->>'nickname'),'') else old.nickname end,
 v_subject,v_minutes,v_frequency,v_mode,
 case when v_mode='per_lesson' then v_price end,
 case when v_mode='monthly_flat' then v_price end,
 v_payer,v_address,v_email,v_location) returning id into v_id;
 return v_id;
end $$;
create function public.set_student_status(p_student_id uuid,p_event text,p_effective_from date,p_pause_until date default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
 v_ledger uuid;
 v_current text;
 v_billing text;
 v_id uuid;
 v_start date;
begin
 select s.ledger_id into v_ledger from public.students s join public.ledgers l on l.id=s.ledger_id
 where s.id=p_student_id and l.owner_id=(select auth.uid());
 if v_ledger is null then raise exception 'Student not found'; end if;
 if p_effective_from is null then raise exception 'Effective date required'; end if;
 select min(v.effective_from) into v_start from public.student_versions v where v.student_id=p_student_id;
 if p_effective_from<v_start then raise exception 'Date precedes student start'; end if;
 v_current:=public.student_status_at(p_student_id,p_effective_from);
 select v.billing_mode into v_billing from public.student_details_at(p_student_id,p_effective_from) v;
 if p_event not in ('pause','restart','end','remove') or p_event is null then raise exception 'Invalid event'; end if;
 if p_event='pause' and v_current<>'active' then raise exception 'Only active students can be paused'; end if;
 if p_event='restart' and v_current not in ('paused','ended') then raise exception 'Only paused or ended students can restart'; end if;
 if p_event='end' and v_current not in ('active','paused') then raise exception 'Student already ended'; end if;
 if p_event='remove' then
  if p_effective_from<>v_start then raise exception 'Remove must start on first student date'; end if;
  if exists(select 1 from public.student_status_events e where e.student_id=p_student_id)
  then raise exception 'Student already has status history'; end if;
  -- E3 must also check lessons before allowing removal.
 end if;
 if p_event='pause' and p_pause_until is not null and p_pause_until<=p_effective_from
 then raise exception 'Pause end must be after start'; end if;
 if p_event<>'pause' and p_pause_until is not null then raise exception 'Pause end only allowed for pause'; end if;
 if v_billing='monthly_flat' and p_event in ('pause','restart','end')
 and extract(day from p_effective_from)<>1
 then raise exception 'Monthly flat-fee status changes must start on the first of a month'; end if;
 insert into public.student_status_events(student_id,ledger_id,effective_from,event_type,pause_until)
 values(p_student_id,v_ledger,p_effective_from,p_event,p_pause_until) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.change_student(uuid,date,jsonb),public.set_student_status(uuid,text,date,date) from public,anon;
grant execute on function public.change_student(uuid,date,jsonb),public.set_student_status(uuid,text,date,date) to authenticated;
