-- E4 read-only smoke tests. Run only in a controlled database session with
-- permission to set request.jwt.claim.sub. No invoice writes.
do $$
declare
  v_owner uuid;
  v_student uuid;
  v_preview jsonb;
begin
  select l.owner_id, s.id into v_owner, v_student
    from public.students s join public.ledgers l on l.id=s.ledger_id
    order by s.created_at limit 1;
  if v_student is null then
    raise notice 'SKIP: no student fixture';
    return;
  end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  v_preview := public.get_invoice_preview(v_student,'2026-10-01');
  if jsonb_typeof(v_preview->'lines') <> 'array'
     or jsonb_typeof(v_preview->'excluded_lessons') <> 'array'
     or jsonb_typeof(v_preview->'validation_errors') <> 'array'
     or v_preview->>'gross_amount' is null then
    raise exception 'E4 preview response shape mismatch';
  end if;

  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.get_invoice_preview(v_student,'2026-10-01');
    raise exception 'E4 tenant isolation failed';
  exception when raise_exception then
    if sqlerrm <> 'not_found' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  begin
    perform public.get_invoice_preview(v_student,'2026-10-02');
    raise exception 'E4 invalid month was accepted';
  exception when raise_exception then
    if sqlerrm <> 'invalid_month' then raise; end if;
  end;
end $$;
