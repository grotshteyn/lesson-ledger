create or replace function public.invoice_allocation_month(p_service_month date,p_current_month date,p_has_valid_invoice boolean) returns date language sql immutable strict set search_path='' as $$ select case when p_has_valid_invoice then p_current_month else p_service_month end $$;
revoke all on function public.invoice_allocation_month(date,date,boolean) from public,anon,authenticated;
grant execute on function public.invoice_allocation_month(date,date,boolean) to authenticated;
CREATE OR REPLACE FUNCTION public.get_invoice_preview(p_student_id uuid, p_billing_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ledger uuid;
  v_student public.student_versions%rowtype;
  v_payer public.student_versions%rowtype;
  v_settings public.billing_settings_versions%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_excluded jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_gross numeric(14,2) := 0;
  v_net numeric(14,2);
  v_vat numeric(14,2);
  v_month_end date;
  v_issued_on date := (now() at time zone 'Europe/Berlin')::date;
  v_lesson record;
  v_billable boolean;
  v_has_flat boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'unauthenticated';
  end if;
  if p_student_id is null or p_billing_month is null
     or extract(day from p_billing_month) <> 1 then
    raise exception 'invalid_month';
  end if;
  v_month_end := (p_billing_month + interval '1 month')::date;
  select s.ledger_id into v_ledger
    from public.students s
    join public.ledgers l on l.id=s.ledger_id
    where s.id=p_student_id and l.owner_id=(select auth.uid());
  if v_ledger is null then raise exception 'not_found'; end if;

  select * into v_student from public.student_details_at(p_student_id,p_billing_month);
  -- A student beginning mid-month has no first-of-month version. Use the
  -- first effective version in that month without backdating earlier months.
  if v_student.id is null then
    select sv.* into v_student from public.student_versions sv
      where sv.student_id=p_student_id
        and sv.effective_from>=p_billing_month
        and sv.effective_from<v_month_end
      order by sv.effective_from,sv.created_at,sv.id limit 1;
  end if;
  -- Legacy lessons may predate the first student_versions record. For per-lesson invoices, use current student identity only; lesson rates are immutable snapshots. Never backdate a monthly flat fee.
  if v_student.id is null and exists (select 1 from public.lessons x where x.student_id=p_student_id and x.lesson_date>=p_billing_month and x.lesson_date<v_month_end and x.billing_mode='per_lesson') then
    select * into v_student from public.student_details_at(p_student_id,v_issued_on);
    if v_student.billing_mode='monthly_flat' then v_student.billing_mode:='per_lesson'; end if;
  end if;
  select * into v_payer from public.student_details_at(p_student_id,v_issued_on);
  if v_payer.id is null then v_payer := v_student; end if;
  select * into v_settings from public.ledger_settings_at(v_ledger,v_issued_on);
  if v_student.id is null then
    v_errors := v_errors || '["student_details_missing"]'::jsonb;
  end if;
  if v_settings.id is null then
    v_errors := v_errors || '["teacher_settings_missing"]'::jsonb;
  else
    if nullif(btrim(v_settings.tax_number),'') is null then
      v_errors := v_errors || '["teacher_tax_number_missing"]'::jsonb;
    end if;
    if nullif(btrim(v_settings.iban),'') is null then
      v_errors := v_errors || '["teacher_iban_missing"]'::jsonb;
    end if;
    if v_settings.vat_mode not in ('small_business','exempt_teaching','regular_19') then
      v_errors := v_errors || '["teacher_vat_mode_missing"]'::jsonb;
    end if;
  end if;
  if v_student.id is not null then
    if nullif(btrim(v_payer.payer_name),'') is null then
      v_errors := v_errors || '["payer_name_missing"]'::jsonb;
    end if;
    if v_payer.payer_address is null
       or nullif(btrim(v_payer.payer_address->>'street'),'') is null
       or nullif(btrim(v_payer.payer_address->>'postcode'),'') is null
       or nullif(btrim(v_payer.payer_address->>'city'),'') is null then
      v_errors := v_errors || '["payer_address_missing"]'::jsonb;
    end if;
  end if;

  if v_student.id is not null and v_student.billing_mode='monthly_flat' then
    -- The monthly fee is billed for the whole month; a fully paused month is excluded.
    -- A cancelled original does not prevent ordinary re-invoicing.
    v_has_flat := not exists (
      select 1 from public.invoice_lines il
      join public.invoices i on i.id=il.invoice_id
      where i.ledger_id=v_ledger and i.student_id=p_student_id
        and i.kind='standard'
        and il.billing_month=p_billing_month and il.lesson_id is null
        and not exists (select 1 from public.invoices c
                        where c.original_invoice_id=i.id and c.kind='cancellation')
    ) and exists (
      select 1 from generate_series(p_billing_month,v_month_end-1,'1 day'::interval) d
      where public.student_status_at(p_student_id,d::date)='active'
    );
    if v_has_flat and coalesce(v_student.monthly_fee,0)>0 then
      v_gross := round(v_student.monthly_fee,2);
      v_lines := jsonb_build_array(jsonb_build_object(
        'lesson_id',null,'billing_month',p_billing_month,
        'description','Monatspauschale ' || to_char(p_billing_month,'MM.YYYY'),
        'gross_amount',to_char(v_gross,'FM999999999990.00')));
    end if;
  end if;

  for v_lesson in
    select x.id,x.lesson_date,x.minutes,x.rate,x.billing_mode,x.status,
           x.invoice_id, x.student_id
      from public.lessons x
      where x.ledger_id=v_ledger and x.student_id=p_student_id
        and x.lesson_date<v_month_end
        and x.lesson_date<=v_issued_on
        and public.invoice_allocation_month(date_trunc('month',x.lesson_date)::date,date_trunc('month',v_issued_on)::date, x.billing_mode='per_lesson' and exists(select 1 from public.invoices i where i.ledger_id=v_ledger and i.student_id=p_student_id and i.billing_month=date_trunc('month',x.lesson_date)::date and i.kind='standard' and not exists(select 1 from public.invoices c where c.original_invoice_id=i.id and c.kind='cancellation')))=p_billing_month
        and not exists(select 1 from public.lesson_voids z where z.lesson_id=x.id)
        and (x.invoice_id is null or exists(
          select 1 from public.invoices c
          where c.kind='cancellation' and c.original_invoice_id=x.invoice_id))
      order by x.lesson_date,x.created_at,x.id
  loop
    v_billable := v_lesson.billing_mode='per_lesson'
      and v_lesson.status in ('held','cancelled_billable')
      and v_lesson.rate>0;
    if v_billable then
      v_gross := v_gross + round(v_lesson.rate,2);
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'lesson_id',v_lesson.id,
        'lesson_date',v_lesson.lesson_date,
        'description',case when v_lesson.status='cancelled_billable'
           then 'Kurzfristig abgesagte Unterrichtsstunde '
           else 'Unterrichtsstunde ' end || to_char(v_lesson.lesson_date,'DD.MM.YYYY'),
        'gross_amount',to_char(round(v_lesson.rate,2),'FM999999999990.00')));
    else
      v_excluded := v_excluded || jsonb_build_array(jsonb_build_object(
        'lesson_id',v_lesson.id,'lesson_date',v_lesson.lesson_date,
        'reason',case when v_lesson.rate=0 then 'zero_price'
          when v_lesson.billing_mode='monthly_flat' then 'monthly_flat'
          else 'not_billable' end));
    end if;
  end loop;
  if jsonb_array_length(v_lines)=0 then
    v_errors := v_errors || '["no_billable_items"]'::jsonb;
  end if;
  if p_billing_month>date_trunc('month',v_issued_on)::date then
    v_errors := v_errors || '["month_not_finished"]'::jsonb;
  end if;
  if v_settings.vat_mode='regular_19' then
    v_net := round(v_gross / 1.19,2);
    v_vat := v_gross-v_net;
  else
    v_net := v_gross;
    v_vat := 0;
  end if;
  return jsonb_build_object(
    'student_id',p_student_id,'billing_month',p_billing_month,
    'invoice_date',v_issued_on,
    'due_date',v_issued_on+coalesce(v_settings.payment_days,14),
    'student_name',v_student.student_name,
    'teacher',case when v_settings.id is null then null else jsonb_build_object(
      'name',v_settings.teacher_name,'address',v_settings.teacher_address,
      'email',v_settings.teacher_email,'tax_number',v_settings.tax_number,
      'iban',v_settings.iban,'bank_name',v_settings.bank_name,
      'phone',v_settings.phone) end,
    'payer',case when v_student.id is null then null else jsonb_build_object(
      'name',v_payer.payer_name,'address',v_payer.payer_address,
      'email',v_payer.payer_email) end,
    'vat_mode',v_settings.vat_mode,'lines',v_lines,
    'excluded_lessons',v_excluded,
    'net_amount',to_char(v_net,'FM999999999990.00'),
    'vat_amount',to_char(v_vat,'FM999999999990.00'),
    'gross_amount',to_char(v_gross,'FM999999999990.00'),
    'validation_errors',v_errors,'warnings',case when p_billing_month=date_trunc('month',v_issued_on)::date then '["month_not_finished"]'::jsonb else '[]'::jsonb end);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_invoice_overview(p_through_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_ledger uuid; v_month date; v_start date; v_rows jsonb:='[]'::jsonb;
 v_candidates jsonb; v_issued jsonb; v_student record; v_preview jsonb;
begin
 if (select auth.uid()) is null then raise exception 'unauthenticated'; end if;
 if p_through_month is null or extract(day from p_through_month)<>1
    or p_through_month>date_trunc('month',(now() at time zone 'Europe/Berlin')::date)::date
 then raise exception 'invalid_month'; end if;
 select id into v_ledger from public.ledgers where owner_id=(select auth.uid());
 if v_ledger is null then raise exception 'not_found'; end if;
 -- Include older service and contract months; no silent history cutoff.
 v_start:=(least(p_through_month,(date_trunc('month',(now() at time zone 'Europe/Berlin')::date)-interval '1 month')::date)-interval '23 months')::date;
 select least(v_start,coalesce(min(d),v_start)) into v_start from (select date_trunc('month',lesson_date)::date d from public.lessons where ledger_id=v_ledger and invoice_id is null union all select date_trunc('month',effective_from)::date from public.student_versions where ledger_id=v_ledger and billing_mode='monthly_flat' union all select billing_month from public.invoices where ledger_id=v_ledger) dates;
 for v_month in select g::date from generate_series(v_start,p_through_month,'1 month') g
 loop
   v_candidates:='[]'::jsonb;
   for v_student in
     select s.id from public.students s where s.ledger_id=v_ledger

   loop
     v_preview:=public.get_invoice_preview(v_student.id,v_month);
     if (v_preview->>'gross_amount')::numeric>0 then
       v_candidates:=v_candidates||jsonb_build_array(jsonb_build_object(
         'student_id',v_student.id,'student_name',v_preview->>'student_name',
         'billing_month',v_month,'gross_amount',v_preview->>'gross_amount',
         'status',case when jsonb_array_length(v_preview->'validation_errors')=0 then 'ready' when jsonb_array_length(v_preview->'validation_errors')=0
            then 'ready' else 'missing_details' end,
         'validation_errors',v_preview->'validation_errors'));
     end if;
   end loop;
   select coalesce(jsonb_agg(jsonb_build_object(
     'invoice_id',i.id,'student_id',i.student_id,'invoice_number',i.invoice_number,
     'kind',i.kind,'original_invoice_id',i.original_invoice_id,'issued_on',i.issued_on,
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
$function$
;
CREATE OR REPLACE FUNCTION public.issue_invoice(p_student_id uuid, p_billing_month date, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ledger uuid;
  v_preview jsonb;
  v_existing public.invoices%rowtype;
  v_invoice uuid;
  v_seq integer;
  v_year integer := extract(year from (now() at time zone 'Europe/Berlin')::date)::integer;
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
      and x.lesson_date<=(now() at time zone 'Europe/Berlin')::date
    order by x.id for update;

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
    where s.ledger_id=v_ledger and s.effective_from<=(now() at time zone 'Europe/Berlin')::date
    order by s.effective_from desc,s.created_at desc limit 1;

  insert into public.invoice_counters(ledger_id,invoice_year,last_number)
    values(v_ledger,v_year,1)
    on conflict(ledger_id,invoice_year)
    do update set last_number=public.invoice_counters.last_number+1
    returning last_number into v_seq;
  v_number:=(case when position('YYYY' in v_prefix)>0
    then replace(v_prefix,'YYYY',v_year::text)
    else v_prefix||v_year::text end)||'-'||lpad(v_seq::text,4,'0');
  insert into public.invoices(
    ledger_id,student_id,invoice_year,invoice_sequence,invoice_number,
    kind,billing_month,issued_on,due_on,vat_mode,
    net_amount,vat_amount,gross_amount,snapshot,idempotency_key
  ) values(
    v_ledger,p_student_id,v_year,v_seq,v_number,'standard',p_billing_month,
    (now() at time zone 'Europe/Berlin')::date,(v_preview->>'due_date')::date,v_preview->>'vat_mode',
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
$function$
;
do $$ begin
if public.invoice_allocation_month(date '2026-10-01',date '2026-12-01',false) <> date '2026-10-01' then raise exception 'original month'; end if;
if public.invoice_allocation_month(date '2026-10-01',date '2026-12-01',true) <> date '2026-12-01' then raise exception 'supplement'; end if;
if public.invoice_allocation_month(date '2026-10-01',date '2027-01-01',true) <> date '2027-01-01' then raise exception 'rollover'; end if;
end $$;