create or replace function public.set_student_status(p_student_id uuid,p_event text,p_effective_from date,p_pause_until date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_ledger uuid;
 v_current text;
 v_billing text;
 v_id uuid;
 v_start date;
 v_has_lessons boolean;
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
  if to_regclass('public.lessons') is not null then
   execute 'select exists(select 1 from public.lessons where student_id=$1)' into v_has_lessons using p_student_id;
   if v_has_lessons then raise exception 'Student has lessons; end instead of remove'; end if;
  end if;
 end if;
 if p_event='pause' and v_billing='monthly_flat' and p_pause_until is not null
 and extract(day from p_pause_until)<>1 then raise exception 'Monthly flat-fee auto restart must be the first of a month'; end if;
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
