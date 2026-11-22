-- E4 monthly overview. All candidates are computed using the same preview as issuance.
create or replace function public.list_invoice_overview(p_through_month date)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare v_ledger uuid; v_month date; v_start date; v_rows jsonb:='[]'::jsonb;
 v_candidates jsonb; v_issued jsonb; v_student record; v_preview jsonb;
begin
 if (select auth.uid()) is null then raise exception 'unauthenticated'; end if;
 if p_through_month is null or extract(day from p_through_month)<>1
    or p_through_month>=date_trunc('month',current_date)::date
 then raise exception 'invalid_month'; end if;
 select id into v_ledger from public.ledgers where owner_id=(select auth.uid());
 if v_ledger is null then raise exception 'not_found'; end if;
 -- Limit a single overview call to 24 months to prevent unbounded RPC work.
 v_start:=greatest(p_through_month-interval '23 months',
    (select coalesce(date_trunc('month',min(s.created_at))::date,p_through_month)
     from public.students s where s.ledger_id=v_ledger));
 for v_month in select g::date from generate_series(v_start,p_through_month,'1 month') g
 loop
   v_candidates:='[]'::jsonb;
   for v_student in
     select s.id from public.students s where s.ledger_id=v_ledger
       and s.created_at<(v_month+interval '1 month')
       and not exists(select 1 from public.invoices i
         where i.student_id=s.id and i.ledger_id=v_ledger
         and i.billing_month=v_month and i.kind='standard'
         and not exists(select 1 from public.invoices c
           where c.original_invoice_id=i.id and c.kind='cancellation'))
   loop
     v_preview:=public.get_invoice_preview(v_student.id,v_month);
     if (v_preview->>'gross_amount')::numeric>0 then
       v_candidates:=v_candidates||jsonb_build_array(jsonb_build_object(
         'student_id',v_student.id,'student_name',v_preview->>'student_name',
         'billing_month',v_month,'gross_amount',v_preview->>'gross_amount',
         'status',case when jsonb_array_length(v_preview->'validation_errors')=0
            then 'ready' else 'missing_details' end,
         'validation_errors',v_preview->'validation_errors'));
     end if;
   end loop;
   select coalesce(jsonb_agg(jsonb_build_object(
     'invoice_id',i.id,'student_id',i.student_id,'invoice_number',i.invoice_number,
     'kind',i.kind,'issued_on',i.issued_on,
     'gross_amount',to_char(i.gross_amount,'FM999999999990.00'),
     'status',case when exists(select 1 from public.invoices c
        where c.original_invoice_id=i.id) then 'cancelled' else 'issued' end)
      order by i.issued_on,i.invoice_sequence),'[]'::jsonb)
   into v_issued from public.invoices i
   where i.ledger_id=v_ledger and i.billing_month=v_month;
   if jsonb_array_length(v_candidates)>0 or jsonb_array_length(v_issued)>0 then
     v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
       'billing_month',v_month,'candidates',v_candidates,'issued',v_issued));
   end if;
 end loop;
 return jsonb_build_object('months',v_rows);
end;
$$;
revoke all on function public.list_invoice_overview(date) from public,anon;
grant execute on function public.list_invoice_overview(date) to authenticated;
