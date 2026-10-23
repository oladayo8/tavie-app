-- AI-assisted builder: per-creator usage limits, and saving an approved plan in one step.
-- AI never writes program data itself: the Edge Function only returns suggestions, and
-- import_plan runs as the signed-in creator, so every existing rule and policy applies.

-- ---------------------------------------------------------------------------
-- Usage limits, per creator: 5 plans and 30 task suggestions a day, one request at a time.
-- Only start_ai_request and finish_ai_request write here; nobody can read or write it directly.
-- ---------------------------------------------------------------------------

create table public.ai_requests (
  id bigint generated always as identity primary key,
  creator_id uuid not null references public.creators (id) on delete cascade,
  kind text not null check (kind in ('plan', 'task')),
  -- running: Claude is working on it. done: Claude answered (counts, even if the answer was unusable).
  -- failed: Claude was never reached, so it doesn't count towards the daily limit.
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  created_at timestamptz not null default now()
);
create index ai_requests_creator_recent_idx on public.ai_requests (creator_id, created_at);
alter table public.ai_requests enable row level security;
revoke all on public.ai_requests from anon, authenticated;

-- Called by the Edge Function, as the caller, before every Claude request, and returns the request id.
-- It is also the function's sign-in check: logged-out users, students, and no-role logins are refused.
create function public.start_ai_request(kind text)
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
  daily_limit := case start_ai_request.kind when 'plan' then 5 when 'task' then 30 end;
  if daily_limit is null then
    raise exception 'Unknown kind.' using errcode = '22023';
  end if;
  -- Parallel calls for the same creator queue here, so none can slip past the checks below.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  -- A request still running after 3 minutes has died (the function itself stops well before that).
  if exists (select 1 from public.ai_requests r
              where r.creator_id = uid and r.status = 'running' and r.created_at > now() - interval '3 minutes') then
    raise exception 'Tavie is still working on your last request. Wait for it to finish.' using errcode = '55P03';
  end if;
  select count(*) into used
    from public.ai_requests r
   where r.creator_id = uid and r.kind = start_ai_request.kind and r.status <> 'failed'
     and r.created_at > now() - interval '1 day';
  if used >= daily_limit then
    raise exception 'You''ve used today''s AI limit. Try again tomorrow, or build it yourself.' using errcode = '54000';
  end if;
  insert into public.ai_requests (creator_id, kind) values (uid, start_ai_request.kind) returning id into request_id;
  return request_id;
end;
$$;

-- Marks the caller's own running request as done, or as failed when Claude was never reached.
create function public.finish_ai_request(request_id bigint, reached_ai boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_requests r
     set status = case when finish_ai_request.reached_ai then 'done' else 'failed' end
   where r.id = finish_ai_request.request_id and r.creator_id = private.require_user() and r.status = 'running';
$$;

-- ---------------------------------------------------------------------------
-- Saves the milestones and tasks a creator approved, all or nothing. Runs as the caller
-- (security invoker), so row-level security, column grants, and check rules all apply.
-- ---------------------------------------------------------------------------

create function public.import_plan(program_id uuid, milestones jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  m jsonb;
  t jsonb;
  milestone_id uuid;
  next_milestone integer;
  next_task integer;
  saved integer := 0;
begin
  perform private.require_user();
  if jsonb_typeof(import_plan.milestones) is distinct from 'array'
     or jsonb_array_length(import_plan.milestones) not between 1 and 10 then
    raise exception 'A plan needs 1 to 10 milestones.' using errcode = '22023';
  end if;
  -- Row-level security hides other creators' programs, so this also checks ownership.
  if not exists (select 1 from public.programs p where p.id = import_plan.program_id and p.status = 'draft') then
    raise exception 'Program not found, or not a draft.' using errcode = '42501';
  end if;

  select coalesce(max(x.position) + 1, 0) into next_milestone
    from public.milestones x where x.program_id = import_plan.program_id;

  for m in select value from jsonb_array_elements(import_plan.milestones) loop
    if jsonb_typeof(coalesce(m -> 'tasks', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(m -> 'tasks', '[]'::jsonb)) > 5 then
      raise exception 'A milestone in a plan can have up to 5 tasks.' using errcode = '22023';
    end if;
    insert into public.milestones (program_id, position, title, description)
    values (import_plan.program_id, next_milestone, m ->> 'title', nullif(btrim(m ->> 'description'), ''))
    returning id into milestone_id;
    next_milestone := next_milestone + 1;
    next_task := 0;

    for t in select value from jsonb_array_elements(coalesce(m -> 'tasks', '[]'::jsonb)) loop
      insert into public.tasks (
        milestone_id, position, title, why, completion_type, check_in_question, target_count, unit,
        follow_up_question, follow_up_options, est_minutes, is_optional)
      values (
        milestone_id, next_task, t ->> 'title', nullif(btrim(t ->> 'why'), ''),
        coalesce(t ->> 'completion_type', 'done'), nullif(btrim(t ->> 'check_in_question'), ''),
        (t ->> 'target_count')::integer, nullif(btrim(t ->> 'unit'), ''),
        nullif(btrim(t ->> 'follow_up_question'), ''),
        case when jsonb_typeof(t -> 'follow_up_options') = 'array'
             then array(select jsonb_array_elements_text(t -> 'follow_up_options')) end,
        coalesce((t ->> 'est_minutes')::integer, 30), coalesce((t ->> 'is_optional')::boolean, false));
      next_task := next_task + 1;
      saved := saved + 1;
    end loop;
  end loop;
  return saved;
end;
$$;

revoke all on function public.start_ai_request(text), public.finish_ai_request(bigint, boolean),
  public.import_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.start_ai_request(text), public.finish_ai_request(bigint, boolean),
  public.import_plan(uuid, jsonb) to authenticated;
