-- E4 batch adapter: each candidate is an independent subtransaction.
-- Stable per-item keys are derived from the batch key and candidate identity.
create or replace function public.issue_invoices(
  p_selections jsonb, p_idempotency_key uuid
) returns jsonb language plpgsql volatile security invoker set search_path=''
as $$
declare
  v_item jsonb;
  v_results jsonb:='[]'::jsonb;
  v_student uuid;
  v_month date;
  v_key uuid;
  v_result jsonb;
  v_count integer;
begin
  if (select auth.uid()) is null then raise exception 'unauthenticated'; end if;
  if p_idempotency_key is null or jsonb_typeof(p_selections)<>'array'
    then raise exception 'invalid_arguments'; end if;
  v_count:=jsonb_array_length(p_selections);
  if v_count<1 or v_count>30 then raise exception 'invalid_batch_size'; end if;
  for v_item in select value from jsonb_array_elements(p_selections)
  loop
    begin
      v_student:=(v_item->>'student_id')::uuid;
      v_month:=(v_item->>'billing_month')::date;
      -- Convert deterministic MD5 hex into UUID syntax; keys are scoped to a
      -- batch and student/month. This is an idempotency identifier, not a secret.
      v_key:=md5(p_idempotency_key::text||':'||v_student::text||':'||v_month::text)::uuid;
      v_result:=public.issue_invoice(v_student,v_month,v_key);
      v_results:=v_results||jsonb_build_array(
        v_result||jsonb_build_object('student_id',v_student,'billing_month',v_month));
    exception when others then
      v_results:=v_results||jsonb_build_array(jsonb_build_object(
        'student_id',v_item->>'student_id',
        'billing_month',v_item->>'billing_month',
        'status','failed','error_code',left(sqlerrm,300)));
    end;
  end loop;
  return jsonb_build_object('results',v_results);
end;
$$;
revoke all on function public.issue_invoices(jsonb,uuid) from public,anon;
grant execute on function public.issue_invoices(jsonb,uuid) to authenticated;
