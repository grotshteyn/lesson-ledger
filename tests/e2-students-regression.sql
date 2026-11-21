-- E2 regression tests. Run only on a disposable Supabase test database
-- after applying e2_students_foundation.sql. All fixtures roll back.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values
('00000000-0000-4000-8000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e2-a@example.invalid','',now(),now()),
('00000000-0000-4000-8000-0000000000c2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e2-b@example.invalid','',now(),now());
insert into public.ledgers(id,owner_id) values
('10000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c1'),
('10000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c2');
insert into public.students(id,ledger_id) values
('20000000-0000-4000-8000-0000000000c1','10000000-0000-4000-8000-0000000000c1'),
('20000000-0000-4000-8000-0000000000c2','10000000-0000-4000-8000-0000000000c2');
insert into public.student_versions
(id,student_id,ledger_id,effective_from,student_name,subject,minutes,billing_mode,rate,payer_name)
values
('30000000-0000-4000-8000-0000000000c1','20000000-0000-4000-8000-0000000000c1','10000000-0000-4000-8000-0000000000c1','2026-11-01','Anna','Maths',45,'per_lesson',35,'Parent A'),
('30000000-0000-4000-8000-0000000000c2','20000000-0000-4000-8000-0000000000c2','10000000-0000-4000-8000-0000000000c2','2026-11-01','Ben','Music',60,'per_lesson',40,'Parent B');
insert into public.student_versions
(student_id,ledger_id,effective_from,student_name,subject,minutes,billing_mode,rate,payer_name)
values ('20000000-0000-4000-8000-0000000000c1','10000000-0000-4000-8000-0000000000c1','2026-12-01','Anna','Maths',45,'per_lesson',38,'Parent A');
insert into public.student_status_events(student_id,ledger_id,effective_from,event_type,pause_until)
values ('20000000-0000-4000-8000-0000000000c1','10000000-0000-4000-8000-0000000000c1','2027-01-01','pause','2027-02-01');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000c1',true);
do $$
begin
 if (select count(*) from public.students)<>1 then raise exception 'Student tenant leak'; end if;
 if (select count(*) from public.student_versions)<>2 then raise exception 'Version tenant leak'; end if;
 if (select count(*) from public.student_status_events)<>1 then raise exception 'Status tenant leak'; end if;
 if (select rate from public.student_details_at('20000000-0000-4000-8000-0000000000c1','2026-11-28'))<>35 then raise exception 'Old price incorrect'; end if;
 if (select rate from public.student_details_at('20000000-0000-4000-8000-0000000000c1','2026-12-02'))<>38 then raise exception 'New price incorrect'; end if;
 if public.student_status_at('20000000-0000-4000-8000-0000000000c1','2027-01-15')<>'paused' then raise exception 'Pause incorrect'; end if;
 if public.student_status_at('20000000-0000-4000-8000-0000000000c1','2027-02-01')<>'active' then raise exception 'Auto restart incorrect'; end if;
 if exists(select 1 from public.student_details_at('20000000-0000-4000-8000-0000000000c2','2026-12-01')) then raise exception 'Cross tenant details leaked'; end if;
 if public.student_status_at('20000000-0000-4000-8000-0000000000c2','2026-12-01') is not null then raise exception 'Cross tenant status leaked'; end if;
end $$;
-- Authenticated tenant A cannot insert a version against tenant B's student.
do $$
begin
 begin
  insert into public.student_versions(student_id,ledger_id,effective_from,student_name,subject,minutes,billing_mode,rate,payer_name)
  values ('20000000-0000-4000-8000-0000000000c2','10000000-0000-4000-8000-0000000000c2','2026-12-01','Bad','Maths',45,'per_lesson',35,'Bad');
  raise exception 'Cross-tenant write unexpectedly succeeded';
 exception when insufficient_privilege or foreign_key_violation or check_violation then null;
 end;
end $$;
rollback;
