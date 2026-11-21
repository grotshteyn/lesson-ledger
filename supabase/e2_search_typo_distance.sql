create extension if not exists fuzzystrmatch with schema extensions;
create or replace function public.find_students(p_query text default '',p_status text default 'active',p_at date default current_date)
returns table(student_id uuid,student_name text,nickname text,subject text,payer_name text,billing_mode text,rate numeric,monthly_fee numeric,status text,match_rank integer)
language sql stable security invoker set search_path='' as $$
 with terms as (select extensions.unaccent(lower(btrim(coalesce(p_query,'')))) as needle),
 candidates as (
  select s.id as student_id,v.student_name,v.nickname,v.subject,v.payer_name,v.billing_mode,v.rate,v.monthly_fee,
   public.student_status_at(s.id,p_at) as status,
   extensions.unaccent(lower(coalesce(v.student_name,''))) as full_name,
   extensions.unaccent(lower(coalesce(v.nickname,''))) as short_name
  from public.students s cross join lateral (
    select sv.* from public.student_versions sv where sv.student_id=s.id
    order by case when sv.effective_from<=p_at then 0 else 1 end,
      case when sv.effective_from<=p_at then sv.effective_from end desc,
      case when sv.effective_from>p_at then sv.effective_from end asc,
      sv.created_at desc,sv.id desc limit 1
   ) v
  where exists(select 1 from public.ledgers l where l.id=s.ledger_id and l.owner_id=(select auth.uid()))
 ),
 ranked as (
  select c.*,
  case when t.needle='' then 0
   when c.full_name=t.needle or c.short_name=t.needle or exists (
    select 1 from regexp_split_to_table(c.full_name,'[[:space:]]+') w where w=t.needle) then 0
   when c.full_name like t.needle||'%' or c.short_name like t.needle||'%' or exists (
    select 1 from regexp_split_to_table(c.full_name,'[[:space:]]+') w where w like t.needle||'%') then 1
   when c.full_name like '%'||t.needle||'%' or c.short_name like '%'||t.needle||'%' then 2
   when length(t.needle)>=3 and (
    extensions.similarity(c.full_name,t.needle)>=0.25
    or extensions.similarity(c.short_name,t.needle)>=0.25
    or exists(select 1 from regexp_split_to_table(c.full_name,'[[:space:]]+') w
      where (extensions.similarity(w,t.needle)>=0.25 or
        (length(w)<=255 and length(t.needle)<=255 and
         abs(length(w)-length(t.needle))<=2 and
         extensions.levenshtein_less_equal(w,t.needle,2)<=case when length(t.needle)>=4 then 2 else 1 end)))
   ) then 3 else 99 end as match_rank
  from candidates c cross join terms t
 )
 select r.student_id,r.student_name,r.nickname,r.subject,r.payer_name,r.billing_mode,r.rate,r.monthly_fee,r.status,r.match_rank
 from ranked r
 where r.match_rank<99 and r.status<>'removed' and (p_status is null or r.status=p_status)
 order by r.match_rank,r.student_name,r.student_id limit 100
$$;
