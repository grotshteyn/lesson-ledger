-- Run against the development Supabase project. All inserted lessons are rolled back.
begin;
do $test$
declare
 v_owner uuid; v_student uuid; v_key uuid:=gen_random_uuid();
 v_first jsonb; v_second jsonb; v_edit jsonb; v_void uuid;
 v_rejected boolean:=false;
begin
 select l.owner_id,s.id into v_owner,v_student
 from public.students s join public.ledgers l on l.id=s.ledger_id
 where public.student_status_at(s.id,current_date)='active'
 and exists(select 1 from public.student_versions v where v.student_id=s.id and v.effective_from<=current_date)
 limit 1;
 if v_student is null then raise exception 'Need an active student fixture'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 execute 'set local role authenticated';
 v_rejected:=false;
 begin
  perform public.log_lesson(v_student,current_date,'held',null,null,null,null,null,false,gen_random_uuid(),'web');
 exception when others then v_rejected:=true; end;
 if not v_rejected then raise exception 'Cross-tenant lesson log was accepted'; end if;
 execute 'set local role postgres';
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 execute 'set local role authenticated';
 begin
  perform public.log_lesson(v_student,current_date+1,'held',null,null,null,null,null,false,gen_random_uuid(),'web');
 exception when others then v_rejected:=true; end;
 if not v_rejected then raise exception 'Future held lesson was accepted'; end if;
 v_first:=public.log_lesson(v_student,current_date,'held',null,null,null,null,null,false,v_key,'web');
 if v_first->>'state'<>'saved' then raise exception 'Log failed: %',v_first; end if;
 v_second:=public.log_lesson(v_student,current_date,'held',null,null,null,null,null,false,v_key,'web');
 if v_second->>'replayed'<>'true' then raise exception 'Retry was not idempotent'; end if;
 v_second:=public.log_lesson(v_student,current_date,'held',null,null,null,null,null,false,gen_random_uuid(),'web');
 if v_second->>'state'<>'duplicate' then raise exception 'Duplicate check failed'; end if;
 v_edit:=public.replace_lesson((v_first->>'id')::uuid,current_date,'held',60,null,null,null,null,false,gen_random_uuid());
 if v_edit->>'state'<>'saved' then raise exception 'Atomic edit failed: %',v_edit; end if;
 if not exists(select 1 from public.lesson_voids where lesson_id=(v_first->>'id')::uuid and replacement_id=(v_edit->>'id')::uuid)
 then raise exception 'Replacement history missing'; end if;
 -- Verify cancellation, override, no-show and flat-fee snapshot behavior.
 v_second:=public.log_lesson(v_student,current_date,'cancelled',null,null,'teacher',null,'charged',true,gen_random_uuid(),'web');
 if v_second->>'state'<>'saved' then raise exception 'Cancellation override logging failed'; end if;
 if not exists(select 1 from public.lessons where id=(v_second->>'id')::uuid and status='cancelled_free' and charge_override='charged')
 then raise exception 'Charge override not preserved'; end if;
 v_second:=public.log_lesson(v_student,current_date,'no_show',null,null,null,null,'not_charged',true,gen_random_uuid(),'web');
 if v_second->>'state'<>'saved' then raise exception 'No-show logging failed'; end if;
 if not exists(select 1 from public.lessons where id=(v_second->>'id')::uuid and no_show and charge_override='not_charged')
 then raise exception 'No-show override not preserved'; end if;
 -- Cancellation decision matrix for the 24-hour policy.
 v_second:=public.log_lesson(v_student,current_date,'cancelled',null,null,'student',true,null,true,gen_random_uuid(),'web');
 if not exists(select 1 from public.lessons where id=(v_second->>'id')::uuid and status='cancelled_free')
 then raise exception 'Timely cancellation must be free'; end if;
 v_second:=public.log_lesson(v_student,current_date,'cancelled',null,null,'student',false,null,true,gen_random_uuid(),'web');
 if not exists(select 1 from public.lessons where id=(v_second->>'id')::uuid and status='cancelled_billable')
 then raise exception 'Late cancellation must be billable'; end if;
 v_second:=public.log_lesson(v_student,current_date,'no_show',null,null,null,null,null,true,gen_random_uuid(),'web');
 if not exists(select 1 from public.lessons where id=(v_second->>'id')::uuid and status='cancelled_billable' and no_show)
 then raise exception 'Default no-show must be billable'; end if;
 execute 'set local role postgres';
 update public.student_versions set no_show_billable=false where student_id=v_student;
 execute 'set local role authenticated';
 v_second:=public.log_lesson(v_student,current_date,'no_show',null,null,null,null,null,true,gen_random_uuid(),'web');
 if not exists(select 1 from public.lessons where id=(v_second->>'id')::uuid and status='cancelled_free' and no_show)
 then raise exception 'No-show with no-show billing off must be free'; end if;
 -- A lesson invoiced after opening the UI must reject void and edit.
 execute 'set local role postgres';
 update public.lessons set invoice_id=gen_random_uuid() where id=(v_edit->>'id')::uuid;
 execute 'set local role authenticated';
 v_rejected:=false;
 begin
  perform public.void_lesson((v_edit->>'id')::uuid,'remove',gen_random_uuid(),'web');
 exception when others then v_rejected:=true; end;
 if not v_rejected then raise exception 'Invoiced lesson could be voided'; end if;
 v_rejected:=false;
 begin
  perform public.replace_lesson((v_edit->>'id')::uuid,current_date,'held',45,null,null,null,null,true,gen_random_uuid());
 exception when others then v_rejected:=true; end;
 if not v_rejected then raise exception 'Invoiced lesson could be edited'; end if;
 execute 'set local role postgres';
 update public.lessons set invoice_id=null where id=(v_edit->>'id')::uuid;
 execute 'set local role authenticated';
 v_void:=public.void_lesson((v_edit->>'id')::uuid,'undo',gen_random_uuid(),'web');
 if v_void is null then raise exception 'Undo failed'; end if;
end $test$;
rollback;
