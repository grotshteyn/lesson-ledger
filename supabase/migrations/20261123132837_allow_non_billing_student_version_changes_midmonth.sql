-- Applied to the production lesson-ledger Supabase project on 2026-11-23.
-- Monthly billing amount/mode changes must begin on day 1.
-- Payer, subject and other non-billing version updates may take effect midmonth.
create or replace function public.enforce_monthly_student_version_date()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
 v_previous public.student_versions%rowtype;
 v_old_amount numeric;
 v_new_amount numeric;
begin
 select * into v_previous from public.student_versions v
 where v.student_id=new.student_id and v.effective_from<=new.effective_from
 order by v.effective_from desc,v.created_at desc,v.id desc limit 1;
 if v_previous.id is not null
    and (new.billing_mode='monthly_flat' or v_previous.billing_mode='monthly_flat')
    and extract(day from new.effective_from)<>1 then
   v_old_amount:=case when v_previous.billing_mode='monthly_flat' then v_previous.monthly_fee else v_previous.rate end;
   v_new_amount:=case when new.billing_mode='monthly_flat' then new.monthly_fee else new.rate end;
   if new.billing_mode is distinct from v_previous.billing_mode
      or v_new_amount is distinct from v_old_amount then
     raise exception 'Monthly billing changes must start on the first day of a month';
   end if;
 end if;
 return new;
end $function$;
