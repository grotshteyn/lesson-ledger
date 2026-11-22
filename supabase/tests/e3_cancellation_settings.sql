-- Regression for effective-dated cancellation preferences; no changes persist.
begin;
do $$
declare v_owner uuid;v_student uuid;v_rate numeric;v_mode text;v_result uuid;
begin
 select l.owner_id,s.id,v.rate,v.billing_mode into v_owner,v_student,v_rate,v_mode
 from public.students s join public.ledgers l on l.id=s.ledger_id
 join lateral public.student_details_at(s.id,current_date) v on true limit 1;
 if v_student is null then raise exception 'No student fixture'; end if;
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 execute 'set local role authenticated';
 v_result:=public.change_student(v_student,current_date,'{"no_show_billable":false}'::jsonb);
 if (select no_show_billable from public.student_details_at(v_student,current_date)) is distinct from false
 then raise exception 'No-show policy change did not take effect'; end if;
 v_result:=public.change_student(v_student,current_date,jsonb_build_object('subject',(select subject from public.student_details_at(v_student,current_date))));
 if (select no_show_billable from public.student_details_at(v_student,current_date)) is distinct from false
 then raise exception 'Unrelated E2 edit reset the no-show policy'; end if;
end $$;
rollback;
