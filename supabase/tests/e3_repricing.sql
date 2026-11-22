-- Atomic backdated repricing regression. All changes roll back.
begin;
do $$
declare v_owner uuid;v_student uuid;v_price numeric;v_lesson jsonb;v_result jsonb;v_repeat jsonb;v_id uuid;v_new uuid;v_key uuid:=gen_random_uuid();
begin
 select l.owner_id,s.id,v.rate into v_owner,v_student,v_price
 from public.students s join public.ledgers l on l.id=s.ledger_id
 join lateral public.student_details_at(s.id,current_date) v on true
 where v.billing_mode='per_lesson' and public.student_status_at(s.id,current_date)='active' limit 1;
 if v_student is null then raise exception 'No active per-lesson fixture'; end if;
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 execute 'set local role authenticated';
 v_lesson:=public.log_lesson(v_student,current_date,'held',null,null,null,null,null,true,gen_random_uuid(),'web');
 if v_lesson->>'state'<>'saved' then raise exception 'Fixture log failed: %',v_lesson; end if;
 v_id:=(v_lesson->>'id')::uuid;
 v_result:=public.change_student_with_repricing(v_student,current_date,jsonb_build_object('price',v_price+3),true,v_key);
 if v_result->>'state'<>'saved' or (v_result->>'replaced_count')::int<1 then raise exception 'Reprice failed: %',v_result; end if;
 select z.replacement_id into v_new from public.lesson_voids z where z.lesson_id=v_id;
 if v_new is null or not exists(select 1 from public.lessons where id=v_new and rate=v_price+3)
 then raise exception 'Repriced lesson amount or replacement history is incorrect'; end if;
 v_repeat:=public.change_student_with_repricing(v_student,current_date,jsonb_build_object('price',v_price+3),true,v_key);
 if v_repeat->>'replayed'<>'true' then raise exception 'Reprice idempotency failed'; end if;
end $$;
rollback;
