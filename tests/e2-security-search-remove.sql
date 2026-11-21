-- E2 hardened RPCs, ranked search, future students and remove. Fixtures roll back.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-4000-8000-0000000000d3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e2-hardening@example.invalid','',now(),now());
insert into public.ledgers(id,owner_id) values ('10000000-0000-4000-8000-0000000000d3','00000000-0000-4000-8000-0000000000d3');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d3',true);
do $$
declare v uuid; blocked boolean:=false;
begin
 v:=public.create_student('{"student_name":"José Müller","nickname":"Pepe","subject":"Piano","payer_name":"Parent","billing_mode":"per_lesson","minutes":45,"price":35,"start_date":"2026-11-01"}');
 if (select count(*) from public.find_students('jose','active','2026-11-21'))<>1 then raise exception 'Accent search failed'; end if;
 if (select count(*) from public.find_students('muller','active','2026-11-21'))<>1 then raise exception 'Surname search failed'; end if;
 if (select count(*) from public.find_students('pepe','active','2026-11-21'))<>1 then raise exception 'Nickname search failed'; end if;
 if (select count(*) from public.find_students('jsoe','active','2026-11-21'))<>1 then raise exception 'Typo search failed'; end if;
 begin
  insert into public.students(ledger_id) values('10000000-0000-4000-8000-0000000000d3');
 exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Direct insert allowed'; end if;
 blocked:=false;
 begin perform public.change_student(v,'2026-11-21','{"payer_name":""}'); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Blank payer allowed'; end if;
 perform public.set_student_status(v,'remove','2026-11-01',null);
 if (select count(*) from public.find_students('jose',null,'2026-11-21'))<>0 then raise exception 'Removed student visible'; end if;
 blocked:=false;
 begin perform public.set_student_status(v,'restart','2026-11-21',null);exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Removed student restarted'; end if;
end $$;
rollback;
