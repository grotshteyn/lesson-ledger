-- Run ONLY after the E3 v2 migration on a disposable development database.
-- Transactional fixtures; all changes are rolled back. Never run against production.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values
 ('00000000-0000-4000-8000-0000000000c3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e3-backend-a@example.invalid','',now(),now()),
 ('00000000-0000-4000-8000-0000000000d4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e3-backend-b@example.invalid','',now(),now());
insert into public.ledgers(id,owner_id) values
 ('10000000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-0000000000c3'),
 ('10000000-0000-4000-8000-0000000000d4','00000000-0000-4000-8000-0000000000d4');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000c3',true);
do $$
declare
 a uuid; b uuid; x jsonb; y jsonb; z jsonb;
 future_date date:=current_date+7;
 key1 uuid:='20000000-0000-4000-8000-000000000001';
 key2 uuid:='20000000-0000-4000-8000-000000000002';
 key3 uuid:='20000000-0000-4000-8000-000000000003';
begin
 a:=public.create_student(jsonb_build_object('student_name','Backend Test A',
   'subject','Math','payer_name','Payer A','billing_mode','per_lesson',
   'start_date',current_date::text,'minutes',60,'price',50));
 -- A second user must not see or modify A's student/lesson.
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d4',true);
 b:=public.create_student(jsonb_build_object('student_name','Backend Test B',
   'subject','Math','payer_name','Payer B','billing_mode','per_lesson',
   'start_date',current_date::text,'minutes',60,'price',60));
 begin
  perform public.log_lesson_v2(a,future_date,'held',60,0,false,key1,false,'web');
  raise exception 'Cross-tenant log was allowed';
 exception when others then
  if sqlerrm='Cross-tenant log was allowed' then raise; end if;
 end;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000c3',true);
 x:=public.log_lesson_v2(a,future_date,'held',60,0,false,key1,false,'web');
 if x->>'state'<>'saved' then raise exception 'Future zero-price lesson not saved: %',x; end if;
 y:=public.log_lesson_v2(a,future_date,'held',60,0,false,key1,false,'web');
 if y->>'replayed'<>'true' or y->>'id'<>x->>'id'
 then raise exception 'Idempotency replay failed: %',y; end if;
 -- A replay key cannot be silently reused for a different lesson date.
 begin
  perform public.log_lesson_v2(a,future_date+2,'held',60,0,false,key1,false,'web');
  raise exception 'Mismatched idempotency key was accepted';
 exception when others then
  if sqlerrm='Mismatched idempotency key was accepted' then raise; end if;
 end;
 y:=public.log_lesson_v2(a,future_date,'cancelled_billable',60,0,false,key2,false,'web');
 if y->>'state'<>'duplicate' or y->>'existing_id'<>x->>'id'
 then raise exception 'Duplicate confirmation missing: %',y; end if;
 y:=public.log_lesson_v2(a,future_date,'cancelled_billable',60,0,true,key2,false,'web');
 if y->>'state'<>'saved' then raise exception 'Explicit duplicate not saved: %',y; end if;
 z:=public.replace_lesson_v2((x->>'id')::uuid,future_date+1,'held',60,0,false,key3,false);
 if z->>'state'<>'saved' then raise exception 'Replacement failed: %',z; end if;
 if not exists(select 1 from public.lesson_voids where lesson_id=(x->>'id')::uuid
   and replacement_id=(z->>'id')::uuid)
 then raise exception 'Replacement history missing'; end if;
 if (select rate from public.lessons where id=(x->>'id')::uuid)<>0
 then raise exception 'Historical lesson changed'; end if;
 begin
  perform public.replace_lesson_v2((x->>'id')::uuid,future_date+2,'held',60,0,false,
    gen_random_uuid(),false);
  raise exception 'Voided lesson was editable';
 exception when others then
  if sqlerrm='Voided lesson was editable' then raise; end if;
 end;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d4',true);
 begin
  perform public.void_lesson((z->>'id')::uuid,'remove',gen_random_uuid(),'web');
  raise exception 'Cross-tenant void was allowed';
 exception when others then
  if sqlerrm='Cross-tenant void was allowed' then raise; end if;
 end;
 if exists(select 1 from public.lessons where id=(z->>'id')::uuid)
 then raise exception 'RLS exposed another tenant lesson'; end if;
end $$;
rollback;
