-- Issue #161: repeatable transaction-isolated regression.
-- Run as database administrator against a TEST database only.
DO $test$
declare l uuid; o uuid; s uuid; f uuid; m date:=date_trunc('month',now() at time zone 'Europe/Berlin')::date; p date; k uuid; a jsonb; b jsonb; c jsonb; x jsonb; addr jsonb:='{"street":"Test 1","postcode":"12345","city":"Test"}';
begin
 select id,owner_id into l,o from public.ledgers order by id limit 1;
 assert l is not null, 'Test database needs one ledger';
 perform set_config('request.jwt.claim.sub',o::text,true);
 p:=(m-interval '1 month')::date;
 begin
 insert into public.billing_settings_versions(ledger_id,effective_from,created_at,teacher_name,teacher_address,teacher_email,tax_number,iban,vat_mode) values(l,(now() at time zone 'Europe/Berlin')::date,clock_timestamp(),'Regression teacher',addr,'test@example.invalid','123/456/78901','DE89370400440532013000','small_business');
 insert into public.students(ledger_id) values(l) returning id into s;
 insert into public.student_versions(student_id,ledger_id,effective_from,student_name,subject,minutes,billing_mode,rate,payer_name,payer_address) values(s,l,p,'Regression 161','Test',60,'per_lesson',40,'Test',addr);
 insert into public.lessons(ledger_id,student_id,lesson_date,minutes,rate,billing_mode,status,idempotency_key) values(l,s,p,60,40,'per_lesson','held',gen_random_uuid());
 a:=public.issue_invoice(s,p,gen_random_uuid());
 insert into public.lessons(ledger_id,student_id,lesson_date,minutes,rate,billing_mode,status,idempotency_key) values(l,s,p+1,60,50,'per_lesson','held',gen_random_uuid()),(l,s,m,60,30,'per_lesson','held',gen_random_uuid());
 assert (public.get_invoice_preview(s,p)->>'gross_amount')::numeric=0;
 assert (public.get_invoice_preview(s,m)->>'gross_amount')::numeric=80;
 k:=gen_random_uuid(); b:=public.issue_invoice(s,m,k);
 x:=public.issue_invoice(s,m,k); assert x->>'invoice_id'=b->>'invoice_id' and (x->>'replayed')::boolean;
 insert into public.lessons(ledger_id,student_id,lesson_date,minutes,rate,billing_mode,status,idempotency_key) values(l,s,p+2,60,60,'per_lesson','held',gen_random_uuid());
 c:=public.issue_invoice(s,m,gen_random_uuid());
 assert (select count(*)=4 and count(distinct lesson_id)=4 from public.invoice_lines where invoice_id in ((a->>'invoice_id')::uuid,(b->>'invoice_id')::uuid,(c->>'invoice_id')::uuid));
 assert (select max(invoice_sequence)-min(invoice_sequence)=2 from public.invoices where student_id=s);
 begin perform public.issue_invoice(s,m,gen_random_uuid()); raise exception 'unexpected success'; exception when others then assert sqlerrm like 'invoice_not_ready:%'; end;
 k:=gen_random_uuid(); x:=public.cancel_invoice((a->>'invoice_id')::uuid,k);
 assert (public.get_invoice_preview(s,p)->>'gross_amount')::numeric=40;
 assert (public.get_invoice_preview(s,m)->>'gross_amount')::numeric=0;
 assert (public.cancel_invoice((a->>'invoice_id')::uuid,k)->>'invoice_id')=x->>'invoice_id';
 perform public.cancel_invoice((b->>'invoice_id')::uuid,gen_random_uuid());
 assert (public.get_invoice_preview(s,p)->>'gross_amount')::numeric=90;
 assert (public.get_invoice_preview(s,m)->>'gross_amount')::numeric=30;
 perform public.cancel_invoice((c->>'invoice_id')::uuid,gen_random_uuid());
 assert (public.get_invoice_preview(s,p)->>'gross_amount')::numeric=150;
 assert (public.get_invoice_preview(s,m)->>'gross_amount')::numeric=30;
 insert into public.students(ledger_id) values(l) returning id into f;
 insert into public.student_versions(student_id,ledger_id,effective_from,student_name,subject,minutes,billing_mode,monthly_fee,payer_name,payer_address) values(f,l,p,'Regression flat','Test',60,'monthly_flat',120,'Test',addr);
 assert (public.get_invoice_preview(f,p)->>'gross_amount')::numeric=120;
 a:=public.issue_invoice(f,p,gen_random_uuid());
 insert into public.lessons(ledger_id,student_id,lesson_date,minutes,rate,billing_mode,status,idempotency_key) values(l,f,p,60,0,'monthly_flat','held',gen_random_uuid()),(l,f,p+1,60,0,'monthly_flat','held',gen_random_uuid());
 assert (public.get_invoice_preview(f,p)->>'gross_amount')::numeric=0;
 perform public.cancel_invoice((a->>'invoice_id')::uuid,gen_random_uuid());
 assert (public.get_invoice_preview(f,p)->>'gross_amount')::numeric=120;
 b:=public.issue_invoice(f,p,gen_random_uuid());
 assert a->>'invoice_id'<>b->>'invoice_id';
 raise exception 'rollback_fixture' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null; end;
 assert not exists(select 1 from public.students where id in (s,f));
end $test$;
select 'PASS: supplemental lifecycle, flat fee lifecycle, rollback' as result;