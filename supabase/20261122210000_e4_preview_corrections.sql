-- E4 preview: read-only, computed from existing E1-E3 data.
-- No issued invoice is created or mutated by this function.
create or replace function public.get_invoice_preview(
  p_student_id uuid,
  p_billing_month date
) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ledger uuid;
  v_student public.student_versions%rowtype;
  v_settings public.billing_settings_versions%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_excluded jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_gross numeric(14,2) := 0;
  v_net numeric(14,2);
  v_vat numeric(14,2);
  v_month_end date;
  v_issued_on date := current_date;
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
    if nullif(btrim(v_student.payer_name),'') is null then
      v_errors := v_errors || '["payer_name_missing"]'::jsonb;
    end if;
    if v_student.payer_address is null
       or nullif(btrim(v_student.payer_address->>'street'),'') is null
       or nullif(btrim(v_student.payer_address->>'postcode'),'') is null
       or nullif(btrim(v_student.payer_address->>'city'),'') is null then
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
        and x.lesson_date>=p_billing_month and x.lesson_date<v_month_end
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
  if p_billing_month>=date_trunc('month',v_issued_on)::date then
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
      'name',v_student.payer_name,'address',v_student.payer_address,
      'email',v_student.payer_email) end,
    'vat_mode',v_settings.vat_mode,'lines',v_lines,
    'excluded_lessons',v_excluded,
    'net_amount',to_char(v_net,'FM999999999990.00'),
    'vat_amount',to_char(v_vat,'FM999999999990.00'),
    'gross_amount',to_char(v_gross,'FM999999999990.00'),
    'validation_errors',v_errors,'warnings','[]'::jsonb);
end;
$$;
revoke all on function public.get_invoice_preview(uuid,date) from public,anon;
grant execute on function public.get_invoice_preview(uuid,date) to authenticated;
