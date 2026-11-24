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
  v_already_billed boolean := false;
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

  select exists(select 1 from public.invoices i
    where i.ledger_id=v_ledger and i.student_id=p_student_id
      and i.billing_month=p_billing_month and i.kind='standard'
      and not exists(select 1 from public.invoices c
        where c.original_invoice_id=i.id and c.kind='cancellation'))
    into v_already_billed;
  if v_already_billed then
    v_errors := v_errors || '["already_billed"]'::jsonb;
  end if;

  if not v_already_billed and v_student.id is not null and v_student.billing_mode='monthly_flat' then
    -- The monthly fee is billed for the whole month; a fully paused month is excluded.
    -- A cancelled original does not prevent ordinary re-invoicing.
    v_has_flat := not exists (
      select 1 from public.invoice_lines il
      join public.invoices i on i.id=il.invoice_id
      where i.ledger_id=v_ledger and i.student_id=p_student_id
        and i.kind='standard'
        and il.billing_month=p_billing_month
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

  if not v_already_billed then
  for v_lesson in
    select x.id,x.lesson_date,x.minutes,x.rate,x.billing_mode,x.status,
           x.invoice_id, x.student_id
      from public.lessons x
      where x.ledger_id=v_ledger and x.student_id=p_student_id
        and x.lesson_date<v_month_end
        and (x.lesson_date>=p_billing_month or (
          x.billing_mode='per_lesson' and not exists (
            select 1 from generate_series(date_trunc('month',x.lesson_date)::date,p_billing_month-interval '1 month','1 month') m
            where not exists (select 1 from public.invoices i where i.ledger_id=v_ledger and i.student_id=p_student_id and i.billing_month=m::date and i.kind='standard' and not exists(select 1 from public.invoices c where c.original_invoice_id=i.id and c.kind='cancellation'))
          )
        ))
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
  end if;
  if jsonb_array_length(v_lines)=0 and not v_already_billed then
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
 -- Limit a single overview call to 24 months to prevent unbounded RPC work.
 v_start:=(least(p_through_month,(date_trunc('month',(now() at time zone 'Europe/Berlin')::date)-interval '1 month')::date)-interval '23 months')::date;
 for v_month in select g::date from generate_series(v_start,p_through_month,'1 month') g
 loop
   v_candidates:='[]'::jsonb;
   for v_student in
     select s.id from public.students s where s.ledger_id=v_ledger
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
         'status',case when jsonb_array_length(v_preview->'validation_errors')=0 and v_month=date_trunc('month',(now() at time zone 'Europe/Berlin')::date)::date then 'in_progress' when jsonb_array_length(v_preview->'validation_errors')=0
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