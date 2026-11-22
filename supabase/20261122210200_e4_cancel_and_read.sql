-- E4 immutable invoice reader and cancellation.
create or replace function public.get_invoice(p_invoice_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare v public.invoices%rowtype; v_lines jsonb; v_cancel uuid;
begin
 if (select auth.uid()) is null then raise exception 'unauthenticated'; end if;
 select i.* into v from public.invoices i join public.ledgers l on l.id=i.ledger_id
 where i.id=p_invoice_id and l.owner_id=(select auth.uid());
 if not found then raise exception 'not_found'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'line_number',il.line_number,'description',il.description,
  'lesson_date',il.lesson_date,'billing_month',il.billing_month,
  'gross_amount',to_char(il.gross_amount,'FM999999999990.00'),
  'net_amount',to_char(il.net_amount,'FM999999999990.00'),
  'vat_amount',to_char(il.vat_amount,'FM999999999990.00'),
  'lesson_id',il.lesson_id) order by il.line_number),'[]'::jsonb)
 into v_lines from public.invoice_lines il where il.invoice_id=v.id;
 select id into v_cancel from public.invoices
 where original_invoice_id=v.id and kind='cancellation';
 return jsonb_build_object('invoice_id',v.id,'invoice_number',v.invoice_number,
  'kind',v.kind,'original_invoice_id',v.original_invoice_id,
  'student_id',v.student_id,'billing_month',v.billing_month,
  'issued_on',v.issued_on,'due_on',v.due_on,
  'net_amount',to_char(v.net_amount,'FM999999999990.00'),
  'vat_amount',to_char(v.vat_amount,'FM999999999990.00'),
  'gross_amount',to_char(v.gross_amount,'FM999999999990.00'),
  'vat_mode',v.vat_mode,'snapshot',v.snapshot,'lines',v_lines,
  'status',case when v_cancel is not null then 'cancelled' else 'issued' end,
  'cancellation_invoice_id',v_cancel,'pdf_status','on_demand');
end;
$$;
revoke all on function public.get_invoice(uuid) from public,anon;
grant execute on function public.get_invoice(uuid) to authenticated;

create or replace function public.cancel_invoice(
 p_invoice_id uuid,p_idempotency_key uuid
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v public.invoices%rowtype; v_replay public.invoices%rowtype;
 v_id uuid; v_seq integer; v_number text; v_prefix text; v_year integer:=extract(year from current_date)::integer;
begin
 if (select auth.uid()) is null then raise exception 'unauthenticated'; end if;
 if p_invoice_id is null or p_idempotency_key is null then raise exception 'invalid_arguments'; end if;
 select i.* into v from public.invoices i join public.ledgers l on l.id=i.ledger_id
 where i.id=p_invoice_id and l.owner_id=(select auth.uid());
 if not found then raise exception 'not_found'; end if;
 if v.kind<>'standard' then raise exception 'not_cancellable'; end if;
 perform 1 from public.ledgers where id=v.ledger_id for update;
 select * into v_replay from public.invoices
 where ledger_id=v.ledger_id and idempotency_key=p_idempotency_key;
 if found then
   if v_replay.kind='cancellation' and v_replay.original_invoice_id=v.id then
     return jsonb_build_object('status','cancelled','invoice_id',v_replay.id,
       'invoice_number',v_replay.invoice_number,'replayed',true);
   end if;
   raise exception 'idempotency_conflict';
 end if;
 if exists(select 1 from public.invoices where original_invoice_id=v.id) then
   raise exception 'already_cancelled';
 end if;
 select coalesce(nullif(btrim(s.invoice_prefix),''),'') into v_prefix
 from public.billing_settings_versions s
 where s.ledger_id=v.ledger_id and s.effective_from<=current_date
 order by s.effective_from desc,s.created_at desc limit 1;
 insert into public.invoice_counters(ledger_id,invoice_year,last_number)
 values(v.ledger_id,v_year,1)
 on conflict(ledger_id,invoice_year)
 do update set last_number=public.invoice_counters.last_number+1
 returning last_number into v_seq;
 v_number:=(case when position('YYYY' in v_prefix)>0
    then replace(v_prefix,'YYYY',v_year::text)
    else v_prefix||v_year::text end)||'-'||lpad(v_seq::text,4,'0');
 insert into public.invoices(
 ledger_id,student_id,invoice_year,invoice_sequence,invoice_number,kind,
 original_invoice_id,billing_month,issued_on,due_on,vat_mode,
 net_amount,vat_amount,gross_amount,snapshot,idempotency_key)
 values(v.ledger_id,v.student_id,v_year,v_seq,v_number,'cancellation',
 v.id,v.billing_month,current_date,current_date,v.vat_mode,
 -v.net_amount,-v.vat_amount,-v.gross_amount,
 v.snapshot||jsonb_build_object('kind','cancellation','invoice_number',v_number,
   'original_invoice_id',v.id,'original_invoice_number',v.invoice_number,
   'invoice_date',current_date,'due_date',current_date,
   'net_amount',to_char(-v.net_amount,'FM999999999990.00'),
   'vat_amount',to_char(-v.vat_amount,'FM999999999990.00'),
   'gross_amount',to_char(-v.gross_amount,'FM999999999990.00'),
   'lines',(select coalesce(jsonb_agg(
     x.value||jsonb_build_object(
       'description','Storno: '||(x.value->>'description'),
       'gross_amount',to_char(-(x.value->>'gross_amount')::numeric,'FM999999999990.00'))
     order by x.ordinality),'[]'::jsonb)
     from jsonb_array_elements(v.snapshot->'lines') with ordinality as x(value,ordinality))),
 p_idempotency_key) returning id into v_id;
 insert into public.invoice_lines(
 invoice_id,ledger_id,line_number,description,lesson_date,billing_month,
 quantity,unit_gross,gross_amount,net_amount,vat_amount,lesson_id)
 select v_id,ledger_id,line_number,'Storno: '||description,lesson_date,billing_month,
 -quantity,unit_gross,-gross_amount,-net_amount,-vat_amount,lesson_id
 from public.invoice_lines where invoice_id=v.id;
 update public.lessons set invoice_id=null where invoice_id=v.id and ledger_id=v.ledger_id;
 return jsonb_build_object('status','cancelled','invoice_id',v_id,
 'invoice_number',v_number,'replayed',false);
end;
$$;
revoke all on function public.cancel_invoice(uuid,uuid) from public,anon;
grant execute on function public.cancel_invoice(uuid,uuid) to authenticated;
