-- Monthly billing boundary regression. Run in a transaction; fixtures roll back.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-4000-8000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e2-f@example.invalid','',now(),now());
insert into public.ledgers(id,owner_id) values ('10000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000f1');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000f1',true);
do $$
declare v uuid; failed boolean;
begin
 v:=public.create_student('{"student_name":"Mia","subject":"Piano","payer_name":"Parent","billing_mode":"monthly_flat","minutes":45,"price":120,"start_date":"2026-11-21"}');
 failed:=false;
 begin
  perform public.change_student(v,'2026-12-15','{"price":150}');
 exception when raise_exception then failed:=true; end;
 if not failed then raise exception 'Midmonth flat fee change allowed'; end if;
 perform public.change_student(v,'2027-01-01','{"price":150}');
 if (select monthly_fee from public.student_details_at(v,'2027-01-10'))<>150 then raise exception 'Month boundary price failed'; end if;
 failed:=false;
 begin
  perform public.set_student_status(v,'pause','2027-01-15',null);
 exception when raise_exception then failed:=true; end;
 if not failed then raise exception 'Midmonth flat fee pause allowed'; end if;
end $$;
rollback;
