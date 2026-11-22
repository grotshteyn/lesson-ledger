-- Preserve billing-month student rate and mode; resolve payer identity/address as of invoice issue date.
-- Guarded idempotent patch of deployed preview RPC, to avoid diverging financial logic.
do $e4$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='get_invoice_preview';
  if v_definition is null then raise exception 'get_invoice_preview missing'; end if;
  if position('v_payer public.student_versions%rowtype;' in v_definition)>0 then return; end if;
  if position('v_student.payer_name' in v_definition)=0 then raise exception 'Unexpected preview definition'; end if;
  v_definition:=replace(v_definition,
    'v_student public.student_versions%rowtype;',
    'v_student public.student_versions%rowtype;'||chr(10)||'  v_payer public.student_versions%rowtype;');
  v_definition:=replace(v_definition,
    'select * into v_settings from public.ledger_settings_at(v_ledger,v_issued_on);',
    'select * into v_payer from public.student_details_at(p_student_id,v_issued_on);'||chr(10)||
    '  if v_payer.id is null then v_payer := v_student; end if;'||chr(10)||
    '  select * into v_settings from public.ledger_settings_at(v_ledger,v_issued_on);');
  v_definition:=replace(v_definition,'v_student.payer_name','v_payer.payer_name');
  v_definition:=replace(v_definition,'v_student.payer_address','v_payer.payer_address');
  v_definition:=replace(v_definition,'v_student.payer_email','v_payer.payer_email');
  if position('v_payer public.student_versions%rowtype;' in v_definition)=0
    or position('select * into v_payer from public.student_details_at' in v_definition)=0
    then raise exception 'Preview patch anchor not found'; end if;
  execute v_definition;
end
$e4$;
