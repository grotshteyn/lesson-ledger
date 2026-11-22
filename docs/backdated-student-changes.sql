-- Deployed to Supabase 2026-11-23.
-- In public.change_student(p_student_id uuid,p_effective_from date,p_changes jsonb),
-- replace the old error after student_details_at with the fallback below:
--
-- select * into old from public.student_details_at(p_student_id,p_effective_from);
-- if old.id is null then
--   select * into old from public.student_versions
--    where student_id=p_student_id
--    order by effective_from asc,created_at asc,id asc limit 1;
-- end if;
--
-- This keeps owner validation and all remaining checks in change_student intact.
-- A historical version may now precede the earliest existing version.
-- Previously issued invoices and stored lesson rates are not modified.
-- Monthly-flat price/billing-mode changes still require the first of the month.
--
-- Idempotent patch for environments still using the old function:
do $patch$
declare d text;
begin
 select pg_get_functiondef(p.oid) into d
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='change_student';
 if d is null then raise exception 'change_student missing'; end if;
 if position('Date precedes student start' in d)=0 then return; end if;
 d:=replace(d,
  'if old.id is null then raise exception ''Date precedes student start''; end if;',
  'if old.id is null then
    select * into old from public.student_versions
    where student_id=p_student_id
    order by effective_from asc,created_at asc,id asc limit 1;
   end if;');
 execute d;
end $patch$;
