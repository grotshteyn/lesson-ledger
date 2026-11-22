-- Read-only E4 overview contract and isolation smoke test.
do $$
declare v_owner uuid; v jsonb;
begin
 select owner_id into v_owner from public.ledgers limit 1;
 if v_owner is null then raise notice 'SKIP: no ledger'; return; end if;
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 v:=public.list_invoice_overview('2026-10-01');
 if jsonb_typeof(v->'months')<>'array' then
  raise exception 'Overview response must have months array';
 end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
  perform public.list_invoice_overview('2026-10-01');
  raise exception 'Cross-tenant overview succeeded';
 exception when raise_exception then
  if sqlerrm<>'not_found' then raise; end if;
 end;
end $$;
