-- Run in the Supabase SQL editor on a development database.
-- This test is transactional and rolls back its fixtures.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-4000-8000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e1-isolation-a@example.invalid','',now(),now()),
('00000000-0000-4000-8000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e1-isolation-b@example.invalid','',now(),now());
insert into public.ledgers(id,owner_id) values
('10000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a1'),
('10000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000b2');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
do $$
begin
 if (select count(*) from public.ledgers) <> 1 then raise exception 'Tenant A sees another ledger'; end if;
 if exists (select 1 from public.ledgers where owner_id='00000000-0000-4000-8000-0000000000b2') then raise exception 'Tenant B ledger leaked'; end if;
end $$;
rollback;
