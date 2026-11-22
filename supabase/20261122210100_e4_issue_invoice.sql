-- E4 single-invoice issuance. A batch caller can invoke this RPC once per
-- student/month and report independent success/failure.
-- This migration requires the E4 foundation and get_invoice_preview.
create or replace function public.issue_invoice(
  p_student_id uuid, p_billing_month date, p_idempotency_key uuid
) returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_ledger uuid;
  v_preview jsonb;
  v_existing public.invoices%rowtype;
  v_invoice uuid;
  v_seq integer;
  v_year integer := extract(year from current_date)::integer;
  v_prefix text;
  v_number text;
  v_line jsonb;
  v_line_no integer := 0;
  v_line_gross numeric(14,2);
  v_line_net numeric(14,2);
  v_line_vat numeric(14,2);
  v_net_remaining numeric(14,2);
  v_gross numeric(14,2);
  v_vat numeric(14,2);
  v_lesson uuid;
begin
  if (select auth.uid()) is null then raise exception 'unauthenticated'; end if;
  if p_student_id is null or p_billing_month is null
    or extract(day from p_billing_month)<>1
    or p_idempotency_key is null then raise exception 'invalid_arguments'; end if;
  select s.ledger_id into v_ledger
    from public.students s join public.ledgers l on l.id=s.ledger_id
    where s.id=p_student_id and l.owner_id=(select auth.uid());
  if v_ledger is null then raise exception 'not_found'; end if;

  -- Serialize issuance and cancellation for the same ledger, and make replay
  -- checks deterministic under concurrent calls.
  perform 1 from public.ledgers where id=v_ledger for update;
  select * into v_existing from public.invoices
    where ledger_id=v_ledger and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.kind='standard' and v_existing.student_id=p_student_id
       and v_existing.billing_month=p_billing_month then
      return jsonb_build_object('status','issued','invoice_id',v_existing.id,
        'invoice_number',v_existing.invoice_number,'replayed',true);
    end if;
    raise exception 'idempotency_conflict';
  end if;

  -- Lock the candidate lessons before generating the final preview.
  perform 1 from public.lessons x
    where x.ledger_id=v_ledger and x.student_id=p_student_id
      and x.lesson_date>=p_billing_month
      and x.lesson_date<(p_billing_month+interval '1 month')::date
    for update;

  v_preview:=public.get_invoice_preview(p_student_id,p_billing_month);
  if jsonb_array_length(v_preview->'validation_errors')>0 then
    raise exception 'invoice_not_ready: %',v_preview->'validation_errors';
  end if;
  v_gross:=(v_preview->>'gross_amount')::numeric(14,2);
  v_net_remaining:=(v_preview->>'net_amount')::numeric(14,2);
  v_vat:=(v_preview->>'vat_amount')::numeric(14,2);

  select coalesce(nullif(btrim(s.invoice_prefix),''),'')
    into v_prefix
    from public.billing_settings_versions s
    where s.ledger_id=v_ledger and s.effective_from<=current_date
    order by s.effective_from desc,s.created_at desc limit 1;

  insert into public.invoice_counters(ledger_id,invoice_year,last_number)
    values(v_ledger,v_year,1)
    on conflict(ledger_id,invoice_year)
    do update set last_number=public.invoice_counters.last_number+1
    returning last_number into v_seq;
  v_number:=v_prefix||v_year::text||'-'||lpad(v_seq::text,4,'0');
  insert into public.invoices(
    ledger_id,student_id,invoice_year,invoice_sequence,invoice_number,
    kind,billing_month,issued_on,due_on,vat_mode,
    net_amount,vat_amount,gross_amount,snapshot,idempotency_key
  ) values(
    v_ledger,p_student_id,v_year,v_seq,v_number,'standard',p_billing_month,
    current_date,(v_preview->>'due_date')::date,v_preview->>'vat_mode',
    v_net_remaining,v_vat,v_gross,
    v_preview||jsonb_build_object('invoice_number',v_number,'kind','standard'),
    p_idempotency_key
  ) returning id into v_invoice;

  for v_line in select value from jsonb_array_elements(v_preview->'lines')
  loop
    v_line_no:=v_line_no+1;
    v_line_gross:=(v_line->>'gross_amount')::numeric(14,2);
    if v_line_no=jsonb_array_length(v_preview->'lines') then
      v_line_net:=v_net_remaining;
    elsif v_preview->>'vat_mode'='regular_19' then
      v_line_net:=round(v_line_gross/1.19,2);
    else
      v_line_net:=v_line_gross;
    end if;
    v_line_vat:=v_line_gross-v_line_net;
    v_net_remaining:=v_net_remaining-v_line_net;
    v_lesson:=nullif(v_line->>'lesson_id','')::uuid;
    insert into public.invoice_lines(
      invoice_id,ledger_id,line_number,description,lesson_date,billing_month,
      quantity,unit_gross,gross_amount,net_amount,vat_amount,lesson_id
    ) values(
      v_invoice,v_ledger,v_line_no,v_line->>'description',
      nullif(v_line->>'lesson_date','')::date,
      nullif(v_line->>'billing_month','')::date,
      1,v_line_gross,v_line_gross,v_line_net,v_line_vat,v_lesson
    );
    if v_lesson is not null then
      update public.lessons set invoice_id=v_invoice
        where id=v_lesson and ledger_id=v_ledger and
          (invoice_id is null or exists(select 1 from public.invoices c
            where c.kind='cancellation' and c.original_invoice_id=public.lessons.invoice_id));
      if not found then raise exception 'lesson_already_billed'; end if;
      insert into public.invoice_lessons(invoice_id,ledger_id,lesson_id)
        values(v_invoice,v_ledger,v_lesson);
    end if;
  end loop;
  return jsonb_build_object('status','issued','invoice_id',v_invoice,
    'invoice_number',v_number,'replayed',false);
end;
$$;
revoke all on function public.issue_invoice(uuid,date,uuid) from public,anon;
grant execute on function public.issue_invoice(uuid,date,uuid) to authenticated;
