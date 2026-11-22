-- E4 issuance regression checks; use a controlled SQL test session.
-- This fixture tests rejection without creating invoices.
do $$
declare
  v_owner uuid;
  v_student uuid;
  v_count bigint;
  v_rejected boolean := false;
begin
  select l.owner_id,s.id into v_owner,v_student
    from public.students s join public.ledgers l on l.id=s.ledger_id
    order by s.created_at limit 1;
  if v_student is null then raise notice 'SKIP: no student'; return; end if;
  select count(*) into v_count from public.invoices;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  begin
    perform public.issue_invoice(v_student,'2026-10-01',gen_random_uuid());
  exception when raise_exception then
    if sqlerrm not like 'invoice_not_ready:%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'Unready invoice was issued'; end if;
  if (select count(*) from public.invoices)<>v_count then
    raise exception 'Invoice write leaked from rejected issuance';
  end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.issue_invoice(v_student,'2026-10-01',gen_random_uuid());
    raise exception 'Cross-tenant invoice issuance succeeded';
  exception when raise_exception then
    if sqlerrm<>'not_found' then raise; end if;
  end;
end $$;
