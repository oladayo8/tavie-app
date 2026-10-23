-- Makes the daily AI limits a per-project setting instead of fixed numbers, so the test project
-- can turn them off while production keeps them. A null limit means no daily limit.
-- Every other safeguard stays: sign-in and creator checks, and one request at a time.
--
-- Turn the daily limits off (test project only), in the SQL Editor:
--   update private.ai_limits set daily_limit = null;
-- Turn them back on (production default):
--   update private.ai_limits set daily_limit = case kind when 'plan' then 5 else 30 end;

create table private.ai_limits (
  kind text primary key check (kind in ('plan', 'task')),
  daily_limit integer check (daily_limit > 0)
);
insert into private.ai_limits (kind, daily_limit) values ('plan', 5), ('task', 30);
revoke all on private.ai_limits from public, anon, authenticated;

create or replace function public.start_ai_request(kind text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  daily_limit integer;
  used integer;
  request_id bigint;
begin
  if not exists (select 1 from public.creators c where c.id = uid) then
    raise exception 'Only creators can use AI suggestions.' using errcode = '42501';
  end if;
  if start_ai_request.kind is distinct from 'plan' and start_ai_request.kind is distinct from 'task' then
    raise exception 'Unknown kind.' using errcode = '22023';
  end if;
  select l.daily_limit into daily_limit from private.ai_limits l where l.kind = start_ai_request.kind;
  -- Parallel calls for the same creator queue here, so none can slip past the checks below.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  -- A request still running after 3 minutes has died (the function itself stops well before that).
  if exists (select 1 from public.ai_requests r
              where r.creator_id = uid and r.status = 'running' and r.created_at > now() - interval '3 minutes') then
    raise exception 'Tavie is still working on your last request. Wait for it to finish.' using errcode = '55P03';
  end if;
  if daily_limit is not null then
    select count(*) into used
      from public.ai_requests r
     where r.creator_id = uid and r.kind = start_ai_request.kind and r.status <> 'failed'
       and r.created_at > now() - interval '1 day';
    if used >= daily_limit then
      raise exception 'You''ve used today''s AI limit. Try again tomorrow, or build it yourself.' using errcode = '54000';
    end if;
  end if;
  insert into public.ai_requests (creator_id, kind) values (uid, start_ai_request.kind) returning id into request_id;
  return request_id;
end;
$$;
