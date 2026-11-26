-- Run only on an explicitly authorized disposable database AFTER the security migration.
-- Never run against the connected live project. All fixtures roll back.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-4000-8000-0000000000e5','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','security-replay@example.invalid','',now(),now());
insert into public.ledgers(id,owner_id) values
 ('10000000-0000-4000-8000-0000000000e5','00000000-0000-4000-8000-0000000000e5');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000e5',true);
do $$
declare
 s uuid; a jsonb; b jsonb; original jsonb; replaced jsonb;
 changes jsonb:=jsonb_build_object('subject','Physics');
 k1 uuid:='30000000-0000-4000-8000-000000000001';
 k2 uuid:='30000000-0000-4000-8000-000000000002';
 k3 uuid:='30000000-0000-4000-8000-000000000003';
 k4 uuid:='30000000-0000-4000-8000-000000000004';
begin
 s:=public.create_student(jsonb_build_object('student_name','Security Replay','subject','Math',
   'payer_name','Test Payer','billing_mode','per_lesson','start_date',(current_date-20)::text,
   'minutes',60,'price',50));
 -- Repricing wrapper: identical retry succeeds; date, payload, flag must be rejected.
 a:=public.change_student_with_repricing(s,current_date-10,changes,false,k1);
 b:=public.change_student_with_repricing(s,current_date-10,changes,false,k1);
 if b->>'replayed'<>'true' or b->>'version_id'<>a->>'version_id' then
   raise exception 'Identical repricing-wrapper replay failed'; end if;
 begin
  perform public.change_student_with_repricing(s,current_date-9,changes,false,k1);
  raise exception 'DATE_REPLAY_ACCEPTED';
 exception when others then
  if sqlerrm='DATE_REPLAY_ACCEPTED' or sqlerrm not like '%Idempotency key reused with different student change%'
  then raise exception 'Repricing date mismatch not rejected: %',sqlerrm; end if;
 end;
 begin
  perform public.change_student_with_repricing(s,current_date-10,jsonb_build_object('subject','Chemistry'),false,k1);
  raise exception 'CHANGES_REPLAY_ACCEPTED';
 exception when others then
  if sqlerrm='CHANGES_REPLAY_ACCEPTED' or sqlerrm not like '%Idempotency key reused with different student change%'
  then raise exception 'Repricing payload mismatch not rejected: %',sqlerrm; end if;
 end;
 begin
  perform public.change_student_with_repricing(s,current_date-10,changes,true,k1);
  raise exception 'FLAG_REPLAY_ACCEPTED';
 exception when others then
  if sqlerrm='FLAG_REPLAY_ACCEPTED' or sqlerrm not like '%Idempotency key reused with different student change%'
  then raise exception 'Repricing flag mismatch not rejected: %',sqlerrm; end if;
 end;
 -- V2: omitted defaults remain callable and replayable when unchanged.
 a:=public.log_lesson_v2(s,current_date-3,'held',null,null,false,k2,false,'web');
 b:=public.log_lesson_v2(s,current_date-3,'held',null,null,false,k2,false,'web');
 if b->>'replayed'<>'true' or b->>'id'<>a->>'id' then
   raise exception 'V2 default replay failed'; end if;
 begin
  perform public.log_lesson_v2(s,current_date-3,'held',90,null,false,k2,false,'web');
  raise exception 'MINUTES_REPLAY_ACCEPTED';
 exception when others then
  if sqlerrm='MINUTES_REPLAY_ACCEPTED' or sqlerrm not like '%Idempotency key reused with different lesson%'
  then raise exception 'V2 minutes mismatch not rejected: %',sqlerrm; end if;
 end;
 begin
  perform public.log_lesson_v2(s,current_date-3,'held',null,75,false,k2,false,'web');
  raise exception 'RATE_REPLAY_ACCEPTED';
 exception when others then
  if sqlerrm='RATE_REPLAY_ACCEPTED' or sqlerrm not like '%Idempotency key reused with different lesson%'
  then raise exception 'V2 rate mismatch not rejected: %',sqlerrm; end if;
 end;
 -- Legacy replacement: unchanged retry succeeds; changed date or rate rejects.
 original:=public.log_lesson(s,current_date-6,'held',60,50,null,null,null,false,k3,'web',false);
 replaced:=public.replace_lesson((original->>'id')::uuid,current_date-5,'held',60,50,
   null,null,null,false,k4,false);
 if replaced->>'state'<>'saved' then raise exception 'Legacy replacement failed: %',replaced; end if;
 b:=public.replace_lesson((original->>'id')::uuid,current_date-5,'held',60,50,
   null,null,null,false,k4,false);
 if b->>'replayed'<>'true' or b->>'id'<>replaced->>'id' then
   raise exception 'Legacy identical replay failed'; end if;
 begin
  perform public.replace_lesson((original->>'id')::uuid,current_date-4,'held',60,50,
    null,null,null,false,k4,false);
  raise exception 'LEGACY_DATE_REPLAY_ACCEPTED';
 exception when others then
  if sqlerrm='LEGACY_DATE_REPLAY_ACCEPTED' or sqlerrm not like '%Idempotency key reused with different lesson%'
  then raise exception 'Legacy date mismatch not rejected: %',sqlerrm; end if;
 end;
 begin
  perform public.replace_lesson((original->>'id')::uuid,current_date-5,'held',60,70,
    null,null,null,false,k4,false);
  raise exception 'LEGACY_RATE_REPLAY_ACCEPTED';
 exception when others then
  if sqlerrm='LEGACY_RATE_REPLAY_ACCEPTED' or sqlerrm not like '%Idempotency key reused with different lesson%'
  then raise exception 'Legacy rate mismatch not rejected: %',sqlerrm; end if;
 end;
 -- Changing student defaults must not turn an omitted-argument replay into a false success.
 perform public.change_student(s,current_date-10,jsonb_build_object('minutes',75,'price',65));
 begin
  perform public.log_lesson_v2(s,current_date-3,'held',null,null,false,k2,false,'web');
  raise exception 'DEFAULT_CHANGE_REPLAY_ACCEPTED';
 exception when others then
  if sqlerrm='DEFAULT_CHANGE_REPLAY_ACCEPTED' or sqlerrm not like '%Idempotency key reused with different lesson%'
  then raise exception 'Changed defaults not rejected: %',sqlerrm; end if;
 end;
end $$;
rollback;
