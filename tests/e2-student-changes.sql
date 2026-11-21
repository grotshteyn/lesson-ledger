-- E2 dated changes and lifecycle regression. Fixtures roll back.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-4000-8000-0000000000e1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e2-e@example.invalid','',now(),now());
insert into public.ledgers(id,owner_id) values ('10000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000e1');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000e1',true);
do $$
declare v uuid;
begin
 v:=public.create_student('{"student_name":"Anna","subject":"Maths","payer_name":"Parent","billing_mode":"per_lesson","minutes":45,"price":35,"start_date":"2026-11-01"}');
 perform public.change_student(v,'2026-12-01','{"price":38}');
 if (select rate from public.student_details_at(v,'2026-11-28'))<>35 then raise exception 'Old price failed'; end if;
 if (select rate from public.student_details_at(v,'2026-12-02'))<>38 then raise exception 'New price failed'; end if;
 perform public.set_student_status(v,'pause','2027-01-01','2027-02-01');
 if public.student_status_at(v,'2027-01-10')<>'paused' then raise exception 'Pause failed'; end if;
 if public.student_status_at(v,'2027-02-10')<>'active' then raise exception 'Restart failed'; end if;
 perform public.set_student_status(v,'end','2027-03-01',null);
 if public.student_status_at(v,'2027-03-05')<>'ended' then raise exception 'End failed'; end if;
end $$;
rollback;
