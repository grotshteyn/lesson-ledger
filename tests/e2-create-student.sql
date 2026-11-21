-- Transactional regression for create_student. All fixtures roll back.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-4000-8000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e2-create@example.invalid','',now(),now());
insert into public.ledgers(id,owner_id) values ('10000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d1');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d1',true);
do $$
declare v uuid;
begin
 v:=public.create_student('{"student_name":"Anna","subject":"Maths","payer_name":"Parent A","billing_mode":"per_lesson","minutes":45,"price":35,"start_date":"2026-11-21"}'::jsonb);
 if (select count(*) from public.student_versions where student_id=v)<>1 then raise exception 'Atomic creation failed'; end if;
 if (select rate from public.student_details_at(v,'2026-11-21'))<>35 then raise exception 'Wrong initial price'; end if;
 begin
  perform public.create_student('{"student_name":"Bad","subject":"Maths","payer_name":"P","billing_mode":"per_lesson","minutes":45,"price":0}'::jsonb);
  raise exception 'Zero price accepted';
 exception when raise_exception then
  if sqlerrm='Zero price accepted' then raise; end if;
 end;
 if (select count(*) from public.students)<>1 then raise exception 'Invalid creation left partial record'; end if;
end $$;
rollback;
