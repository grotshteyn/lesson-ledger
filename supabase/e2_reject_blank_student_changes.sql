create or replace function public.change_student(p_student_id uuid,p_effective_from date,p_changes jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 old public.student_versions%rowtype;
 v_ledger uuid;
 v_id uuid;
 v_mode text;
 v_price numeric;
 v_name text;
 v_payer text;
 v_subject text;
 v_email text;
 v_minutes integer;
 v_frequency numeric;
 v_address jsonb;
 v_location text;
begin
 select s.ledger_id into v_ledger from public.students s
 join public.ledgers l on l.id=s.ledger_id
 where s.id=p_student_id and l.owner_id=(select auth.uid());
 if v_ledger is null then raise exception 'Student not found'; end if;
 if p_effective_from is null then raise exception 'Effective date required'; end if;
 select * into old from public.student_details_at(p_student_id,p_effective_from);
 if old.id is null then raise exception 'Date precedes student start'; end if;
 if p_changes ? 'student_name' then raise exception 'Student name changes are not supported'; end if;
 if (p_changes ? 'subject' and nullif(btrim(p_changes->>'subject'),'') is null)
 or (p_changes ? 'payer_name' and nullif(btrim(p_changes->>'payer_name'),'') is null)
 then raise exception 'Subject and payer name cannot be blank'; end if;
 v_mode:=coalesce(p_changes->>'billing_mode',old.billing_mode);
 v_price:=case when p_changes ? 'price' then (p_changes->>'price')::numeric
               when v_mode=old.billing_mode then coalesce(old.rate,old.monthly_fee)
               else null end;
 v_name:=old.student_name;
 v_subject:=coalesce(nullif(btrim(p_changes->>'subject'),''),old.subject);
 v_payer:=coalesce(nullif(btrim(p_changes->>'payer_name'),''),old.payer_name);
 v_email:=case when p_changes ? 'payer_email' then nullif(btrim(p_changes->>'payer_email'),'') else old.payer_email end;
 v_minutes:=coalesce((p_changes->>'minutes')::integer,old.minutes);
 v_frequency:=coalesce((p_changes->>'lessons_per_week')::numeric,old.lessons_per_week);
 v_address:=case when p_changes ? 'payer_address' then p_changes->'payer_address' else old.payer_address end;
 v_location:=case when p_changes ? 'location' then nullif(p_changes->>'location','') else old.location end;
 if v_mode not in ('per_lesson','monthly_flat') or v_price is null or v_price<=0
 or v_minutes<=0 or v_frequency<=0 or btrim(v_subject)='' or btrim(v_payer)=''
 then raise exception 'Invalid student details'; end if;
 if v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 then raise exception 'Invalid payer email'; end if;
 if (old.billing_mode='monthly_flat' or v_mode='monthly_flat')
 and extract(day from p_effective_from)<>1
 and (v_mode<>old.billing_mode or v_price is distinct from coalesce(old.rate,old.monthly_fee))
 then raise exception 'Monthly billing changes must start on the first day of a month'; end if;
 insert into public.student_versions(student_id,ledger_id,effective_from,student_name,nickname,subject,
 minutes,lessons_per_week,billing_mode,rate,monthly_fee,payer_name,payer_address,payer_email,location)
 values(p_student_id,v_ledger,p_effective_from,v_name,
 case when p_changes ? 'nickname' then nullif(btrim(p_changes->>'nickname'),'') else old.nickname end,
 v_subject,v_minutes,v_frequency,v_mode,
 case when v_mode='per_lesson' then v_price end,
 case when v_mode='monthly_flat' then v_price end,
 v_payer,v_address,v_email,v_location) returning id into v_id;
 return v_id;
end $$;
