-- E4 date-boundary hotfix, deployed 2026-11-23.
-- Saved payer versions are effective on the user's local calendar day.
-- PostgreSQL current_date can still be yesterday just after midnight in Germany.
-- Keep preview, issuance and cancellation dates on the same Europe/Berlin calendar.
-- Does not modify invoice amounts, ownership, or existing records.
do $e4$
declare v_name text; v_definition text;
begin
 foreach v_name in array array['get_invoice_preview','issue_invoice','cancel_invoice'] loop
  select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=v_name;
  if v_definition is null then raise exception 'Missing E4 function %',v_name; end if;
  if position('current_date' in v_definition)=0 then continue; end if;
  v_definition:=replace(v_definition,'current_date',
    '(now() at time zone '||quote_literal('Europe/Berlin')||')::date');
  execute v_definition;
 end loop;
end $e4$;
