-- E3 canonical current lessons and billable amounts for E4 invoice previews.
-- SECURITY INVOKER preserves the caller's tenant RLS.
create or replace view public.active_lessons with (security_invoker=true) as
select x.*,
 case
  when x.billing_mode='monthly_flat' then 0::numeric(12,2)
  when x.charge_override='not_charged' then 0::numeric(12,2)
  when x.charge_override='charged' then x.rate
  when x.status in ('held','cancelled_billable') then x.rate
  else 0::numeric(12,2)
 end as billable_amount
from public.lessons x
where not exists(select 1 from public.lesson_voids z where z.lesson_id=x.id);
revoke all on public.active_lessons from anon;
grant select on public.active_lessons to authenticated;
