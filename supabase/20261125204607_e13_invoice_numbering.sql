create or replace function public.get_invoice_numbering()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 l uuid; d date := (now() at time zone 'Europe/Berlin')::date;
 y integer := extract(year from d)::integer; n integer; prefix text; locked boolean;
begin
 if auth.uid() is null then raise exception 'unauthenticated'; end if;
 select id into l from public.ledgers where owner_id=auth.uid();
 if l is null then raise exception 'not_found'; end if;
 select coalesce((select last_number from public.invoice_counters where ledger_id=l and invoice_year=y),0)+1,
 exists(select 1 from public.invoices where ledger_id=l)
 into n,locked;
 select coalesce(nullif(btrim(s.invoice_prefix),''),'') into prefix
 from public.billing_settings_versions s where s.ledger_id=l and s.effective_from<=d
 order by s.effective_from desc,s.created_at desc limit 1;
 prefix:=coalesce(prefix,'');
 return jsonb_build_object('year',y,'next_number',case when n<=9999 then n end,
 'next_invoice_number',case when n<=9999 then
 (case when position('YYYY' in prefix)>0 then replace(prefix,'YYYY',y::text) else prefix||y::text end)||'-'||lpad(n::text,4,'0') end,
 'editable',not locked,'exhausted',n>9999);
end $$;
create or replace function public.set_invoice_numbering(p_next_number integer,p_expected_year integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l uuid; y integer:=extract(year from (now() at time zone 'Europe/Berlin')::date)::integer;
begin
 if auth.uid() is null then raise exception 'unauthenticated'; end if;
 if p_next_number is null or p_next_number not between 1 and 9999 then raise exception 'invalid_next_number'; end if;
 select id into l from public.ledgers where owner_id=auth.uid() for update;
 if l is null then raise exception 'not_found'; end if;
 if p_expected_year is not null and p_expected_year<>y then raise exception 'invoice_year_changed'; end if;
 if exists(select 1 from public.invoices where ledger_id=l) then raise exception 'invoice_numbering_locked'; end if;
 insert into public.invoice_counters(ledger_id,invoice_year,last_number) values(l,y,p_next_number-1)
 on conflict(ledger_id,invoice_year) do update set last_number=excluded.last_number;
 return public.get_invoice_numbering();
end $$;
revoke all on function public.get_invoice_numbering() from public,anon,authenticated;
revoke all on function public.set_invoice_numbering(integer,integer) from public,anon,authenticated;
grant execute on function public.get_invoice_numbering() to authenticated;
grant execute on function public.set_invoice_numbering(integer,integer) to authenticated;