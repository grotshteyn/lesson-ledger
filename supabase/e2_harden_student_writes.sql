-- E2: only audited RPCs may append student records.
alter function public.create_student(jsonb) security definer;
alter function public.change_student(uuid,date,jsonb) security definer;
alter function public.set_student_status(uuid,text,date,date) security definer;
revoke insert on public.students,public.student_versions,public.student_status_events from authenticated,anon;
drop policy if exists students_add on public.students;
drop policy if exists student_versions_add on public.student_versions;
drop policy if exists student_status_add on public.student_status_events;
create or replace function public.enforce_monthly_student_version_date()
returns trigger language plpgsql set search_path='' as $$
declare v_previous public.student_versions%rowtype;
begin
 select * into v_previous from public.student_versions v
 where v.student_id=new.student_id and v.effective_from<=new.effective_from
 order by v.effective_from desc,v.created_at desc,v.id desc limit 1;
 if v_previous.id is not null and
 (new.billing_mode='monthly_flat' or v_previous.billing_mode='monthly_flat')
 and extract(day from new.effective_from)<>1 then
 raise exception 'Monthly billing changes must start on the first day of a month';
 end if;
 return new;
end $$;
create trigger enforce_monthly_student_version_date before insert on public.student_versions
for each row execute function public.enforce_monthly_student_version_date();
create or replace function public.prevent_removed_student_restart()
returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.student_status_events e where e.student_id=new.student_id and e.event_type='remove')
 then raise exception 'Removed students cannot be reactivated'; end if;
 return new;
end $$;
create trigger prevent_removed_student_restart before insert on public.student_status_events
for each row execute function public.prevent_removed_student_restart();
