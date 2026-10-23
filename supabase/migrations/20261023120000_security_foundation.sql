-- Tavie, Milestone 2 PR 1: security foundation.
--
-- Roles come from the creators and students tables, never from user metadata.
-- Every table has row-level security, the app's roles get only the privileges
-- listed here, and every function checks the caller itself.

-- ---------------------------------------------------------------------------
-- Start closed: nothing in public is reachable unless granted below.
-- ---------------------------------------------------------------------------

-- Supabase grants anon and authenticated full access to new public tables by
-- default. Revoke that, so a table added later starts with no access at all.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
-- Postgres lets everyone execute new functions unless told otherwise.
alter default privileges revoke execute on functions from public;

-- Helpers used by policies and triggers. Not exposed through the API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.creators (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name text not null default '' check (char_length(last_name) <= 60),
  email text not null,
  agent_name text check (agent_name is null or char_length(btrim(agent_name)) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  first_name text check (first_name is null or char_length(btrim(first_name)) between 1 and 60),
  timezone text check (timezone is null or char_length(timezone) <= 64),
  created_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  goal text not null check (char_length(btrim(goal)) between 3 and 140),
  duration_weeks integer not null check (duration_weeks between 1 and 52),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  status text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index programs_creator_id_idx on public.programs (creator_id);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  position integer not null check (position >= 0),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  requires_review boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  -- Deferred so a reorder can swap positions inside one transaction.
  constraint milestones_position_unique unique (program_id, position) deferrable initially deferred
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones (id) on delete cascade,
  position integer not null check (position >= 0),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  why text check (why is null or char_length(why) <= 280),
  est_minutes integer not null default 30 check (est_minutes between 1 and 1440),
  is_optional boolean not null default false,
  completion_type text not null default 'done'
    check (completion_type in ('done', 'count', 'yes_no', 'text')),
  check_in_question text check (check_in_question is null or char_length(check_in_question) <= 140),
  target_count integer check (target_count is null or target_count between 1 and 10000),
  unit text check (unit is null or char_length(unit) <= 20),
  follow_up_question text check (follow_up_question is null or char_length(follow_up_question) <= 140),
  -- Null means the follow-up is a short written answer.
  follow_up_options text[] check (
    follow_up_options is null or (
      cardinality(follow_up_options) between 1 and 4
      and array_position(follow_up_options, null) is null
      and array_position(follow_up_options, '') is null
      and char_length(array_to_string(follow_up_options, '')) <= 160
    )
  ),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_count_needs_target check (completion_type <> 'count' or target_count is not null),
  constraint tasks_options_need_question check (follow_up_options is null or follow_up_question is not null),
  constraint tasks_position_unique unique (milestone_id, position) deferrable initially deferred
);
create index tasks_milestone_id_idx on public.tasks (milestone_id);
create index milestones_program_id_idx on public.milestones (program_id);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  type text not null check (type in ('youtube', 'link', 'file')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  url text check (url is null or (char_length(url) <= 2048 and url ~* '^https://[^\s]+$')),
  file_path text check (file_path is null or char_length(file_path) <= 512),
  created_at timestamptz not null default now(),
  constraint resources_source check (
    (type = 'youtube' and url ~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/' and file_path is null)
    or (type = 'link' and url is not null and file_path is null)
    or (type = 'file' and file_path is not null and url is null)
  )
);
create index resources_program_id_idx on public.resources (program_id);

create table public.task_resources (
  task_id uuid not null references public.tasks (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  -- 0, 1 or 2: at most three resources per task.
  position integer not null check (position between 0 and 2),
  primary key (task_id, resource_id),
  constraint task_resources_position_unique unique (task_id, position) deferrable initially deferred
);
create index task_resources_resource_id_idx on public.task_resources (resource_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger programs_updated_at before update on public.programs
  for each row execute function private.set_updated_at();
create trigger tasks_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();

-- A task may only link resources from its own program.
create function private.task_resource_same_program() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_program uuid;
  resource_program uuid;
begin
  select m.program_id into task_program
    from public.tasks t join public.milestones m on m.id = t.milestone_id
   where t.id = new.task_id;
  select r.program_id into resource_program from public.resources r where r.id = new.resource_id;
  if task_program is null or resource_program is null or task_program <> resource_program then
    raise exception 'A task can only use resources from its own program.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger task_resources_same_program before insert or update on public.task_resources
  for each row execute function private.task_resource_same_program();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.creators enable row level security;
alter table public.students enable row level security;
alter table public.programs enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.resources enable row level security;
alter table public.task_resources enable row level security;

-- creators: a creator sees and edits only their own row. Rows are created only
-- by register_creator().
create policy creators_select_own on public.creators
  for select to authenticated using (id = (select auth.uid()));
create policy creators_update_own on public.creators
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- students: the same, created only by register_student().
create policy students_select_own on public.students
  for select to authenticated using (id = (select auth.uid()));
create policy students_update_own on public.students
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- programs: created only by create_program(); status changes only by publish_program().
create policy programs_select_own on public.programs
  for select to authenticated using (creator_id = (select auth.uid()));
create policy programs_update_own on public.programs
  for update to authenticated
  using (creator_id = (select auth.uid())) with check (creator_id = (select auth.uid()));
create policy programs_delete_own_draft on public.programs
  for delete to authenticated using (creator_id = (select auth.uid()) and status = 'draft');

-- milestones, tasks, resources, task_resources: full access only under the
-- caller's own programs. Checked through the parent program's creator_id.
create policy milestones_own on public.milestones
  for all to authenticated
  using (exists (
    select 1 from public.programs p
     where p.id = milestones.program_id and p.creator_id = (select auth.uid())))
  with check (exists (
    select 1 from public.programs p
     where p.id = milestones.program_id and p.creator_id = (select auth.uid())));

create policy tasks_own on public.tasks
  for all to authenticated
  using (exists (
    select 1 from public.milestones m join public.programs p on p.id = m.program_id
     where m.id = tasks.milestone_id and p.creator_id = (select auth.uid())))
  with check (exists (
    select 1 from public.milestones m join public.programs p on p.id = m.program_id
     where m.id = tasks.milestone_id and p.creator_id = (select auth.uid())));

create policy resources_own on public.resources
  for all to authenticated
  using (exists (
    select 1 from public.programs p
     where p.id = resources.program_id and p.creator_id = (select auth.uid())))
  with check (
    exists (
      select 1 from public.programs p
       where p.id = resources.program_id and p.creator_id = (select auth.uid()))
    -- An uploaded file must sit in the caller's own folder for this program.
    and (file_path is null
         or starts_with(file_path, (select auth.uid())::text || '/' || resources.program_id::text || '/'))
  );

create policy task_resources_own on public.task_resources
  for all to authenticated
  using (exists (
    select 1 from public.tasks t
      join public.milestones m on m.id = t.milestone_id
      join public.programs p on p.id = m.program_id
     where t.id = task_resources.task_id and p.creator_id = (select auth.uid())))
  with check (
    exists (
      select 1 from public.tasks t
        join public.milestones m on m.id = t.milestone_id
        join public.programs p on p.id = m.program_id
       where t.id = task_resources.task_id and p.creator_id = (select auth.uid()))
    and exists (
      select 1 from public.resources r join public.programs p on p.id = r.program_id
       where r.id = task_resources.resource_id and p.creator_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Table privileges. Logged-out users (anon) get none. Signed-in users get only
-- the operations and columns below; the policies above decide which rows.
-- ---------------------------------------------------------------------------

revoke all on public.creators, public.students, public.programs, public.milestones,
  public.tasks, public.resources, public.task_resources from anon, authenticated;

grant select on public.creators to authenticated;
grant update (first_name, last_name, agent_name) on public.creators to authenticated;

grant select on public.students to authenticated;
grant update (first_name, timezone) on public.students to authenticated;

grant select, delete on public.programs to authenticated;
grant update (title, goal, duration_weeks) on public.programs to authenticated;

grant select, delete on public.milestones to authenticated;
grant insert (program_id, position, title, description, requires_review) on public.milestones to authenticated;
grant update (position, title, description, requires_review, archived_at) on public.milestones to authenticated;

grant select, delete on public.tasks to authenticated;
grant insert (milestone_id, position, title, why, est_minutes, is_optional, completion_type,
  check_in_question, target_count, unit, follow_up_question, follow_up_options)
  on public.tasks to authenticated;
grant update (position, title, why, est_minutes, is_optional, completion_type, check_in_question,
  target_count, unit, follow_up_question, follow_up_options, archived_at)
  on public.tasks to authenticated;

grant select, delete on public.resources to authenticated;
grant insert (program_id, type, title, url, file_path) on public.resources to authenticated;
grant update (title, url) on public.resources to authenticated;

grant select, delete on public.task_resources to authenticated;
grant insert (task_id, resource_id, position) on public.task_resources to authenticated;
grant update (position) on public.task_resources to authenticated;

-- ---------------------------------------------------------------------------
-- Functions. Each one that runs with extra rights uses an empty search_path,
-- names every object in full, and checks the caller's login itself.
-- ---------------------------------------------------------------------------

-- The signed-in caller's id, refusing logged-out and anonymous sessions.
create function private.require_user() returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'You need to sign in first.' using errcode = '42501';
  end if;
  return uid;
end;
$$;

-- The explicit "I'm a creator" step. Ordinary sign-in never calls this.
create function public.register_creator(first_name text, last_name text default '')
returns public.creators
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  login_email text;
  result public.creators;
begin
  select u.email into login_email from auth.users u where u.id = uid;
  if login_email is null or login_email = '' then
    raise exception 'Your account needs an email address.' using errcode = '42501';
  end if;

  insert into public.creators (id, first_name, last_name, email)
  values (uid, btrim(coalesce(register_creator.first_name, '')), btrim(coalesce(register_creator.last_name, '')), login_email)
  on conflict (id) do update
    set first_name = excluded.first_name, last_name = excluded.last_name
  returning * into result;
  return result;
end;
$$;

-- Called after sign-in from a join link. Grants no program access on its own.
create function public.register_student()
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  login_email text;
  result public.students;
begin
  select u.email into login_email from auth.users u where u.id = uid;
  if login_email is null or login_email = '' then
    raise exception 'Your account needs an email address.' using errcode = '42501';
  end if;

  insert into public.students (id, email) values (uid, login_email)
  on conflict (id) do nothing;
  select * into result from public.students s where s.id = uid;
  return result;
end;
$$;

-- Creates a draft with a unique slug made from the creator's name.
create function public.create_program(goal text, duration_weeks integer)
returns public.programs
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  creator public.creators;
  base text;
  candidate text;
  attempt integer := 1;
  result public.programs;
begin
  select * into creator from public.creators c where c.id = uid;
  if not found then
    raise exception 'Only creators can make programs.' using errcode = '42501';
  end if;
  if (select count(*) from public.programs p where p.creator_id = uid) >= 50 then
    raise exception 'You have reached the limit of 50 programs.' using errcode = '54000';
  end if;

  base := lower(btrim(creator.first_name || ' ' || creator.last_name));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := btrim(left(btrim(base, '-'), 50), '-');
  if char_length(base) < 3 then
    base := 'coach';
  end if;

  loop
    candidate := case when attempt = 1 then base else base || '-' || attempt end;
    begin
      insert into public.programs (creator_id, title, goal, duration_weeks, slug)
      values (uid, left(btrim(coalesce(create_program.goal, '')), 80), btrim(coalesce(create_program.goal, '')),
              create_program.duration_weeks, candidate)
      returning * into result;
      return result;
    exception when unique_violation then
      attempt := attempt + 1;
      if attempt > 200 then
        base := base || '-' || substr(md5(random()::text), 1, 6);
        attempt := 1;
      end if;
    end;
  end loop;
end;
$$;

-- Checks a program is complete, then makes it live. The only way to set status.
create function public.publish_program(program_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  prog public.programs;
  problems jsonb := '[]'::jsonb;
begin
  select * into prog from public.programs p
   where p.id = publish_program.program_id and p.creator_id = uid
   for update;
  if not found then
    -- Same answer whether the program is missing or belongs to someone else.
    raise exception 'Program not found.' using errcode = '42501';
  end if;
  if prog.status <> 'draft' then
    return jsonb_build_object('ok', true, 'status', prog.status, 'problems', problems);
  end if;

  if (select c.agent_name from public.creators c where c.id = uid) is null then
    problems := problems || jsonb_build_object('code', 'agent_name', 'message', 'Name your agent.');
  end if;

  if not exists (select 1 from public.milestones m
                  where m.program_id = prog.id and m.archived_at is null) then
    problems := problems || jsonb_build_object('code', 'no_milestones', 'message', 'Add at least one milestone.');
  end if;

  problems := problems || coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', 'empty_milestone', 'milestone_id', m.id,
             'message', format('Add a task to "%s".', m.title)) order by m.position)
      from public.milestones m
     where m.program_id = prog.id and m.archived_at is null
       and not exists (select 1 from public.tasks t
                        where t.milestone_id = m.id and t.archived_at is null)), '[]'::jsonb);

  problems := problems || coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', 'missing_why', 'milestone_id', m.id, 'task_id', t.id,
             'message', format('Say why "%s" matters.', t.title)) order by m.position, t.position)
      from public.tasks t join public.milestones m on m.id = t.milestone_id
     where m.program_id = prog.id and m.archived_at is null and t.archived_at is null
       and coalesce(btrim(t.why), '') = ''), '[]'::jsonb);

  problems := problems || coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', 'missing_question', 'milestone_id', m.id, 'task_id', t.id,
             'message', format('Add the check-in question for "%s".', t.title)) order by m.position, t.position)
      from public.tasks t join public.milestones m on m.id = t.milestone_id
     where m.program_id = prog.id and m.archived_at is null and t.archived_at is null
       and t.completion_type <> 'done' and coalesce(btrim(t.check_in_question), '') = ''), '[]'::jsonb);

  if jsonb_array_length(problems) > 0 then
    return jsonb_build_object('ok', false, 'status', prog.status, 'problems', problems);
  end if;

  update public.programs p set status = 'live', published_at = now() where p.id = prog.id;
  return jsonb_build_object('ok', true, 'status', 'live', 'problems', problems);
end;
$$;

-- Saves a new order. Runs as the caller, so row-level security applies, and
-- the list must name every milestone in the program exactly once.
create function public.reorder_milestones(program_id uuid, ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  existing uuid[];
begin
  perform private.require_user();
  select coalesce(array_agg(m.id order by m.id), '{}') into existing
    from public.milestones m where m.program_id = reorder_milestones.program_id;
  if ids is null or cardinality(existing) = 0
     or existing <> (select array_agg(x order by x) from unnest(ids) x) then
    raise exception 'The list must contain every milestone in this program once.' using errcode = '22023';
  end if;
  update public.milestones m
     set position = o.ord - 1
    from unnest(ids) with ordinality as o(id, ord)
   where m.id = o.id and m.program_id = reorder_milestones.program_id;
end;
$$;

create function public.reorder_tasks(milestone_id uuid, ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  existing uuid[];
begin
  perform private.require_user();
  select coalesce(array_agg(t.id order by t.id), '{}') into existing
    from public.tasks t where t.milestone_id = reorder_tasks.milestone_id;
  if ids is null or cardinality(existing) = 0
     or existing <> (select array_agg(x order by x) from unnest(ids) x) then
    raise exception 'The list must contain every task in this milestone once.' using errcode = '22023';
  end if;
  update public.tasks t
     set position = o.ord - 1
    from unnest(ids) with ordinality as o(id, ord)
   where t.id = o.id and t.milestone_id = reorder_tasks.milestone_id;
end;
$$;

-- What a join link shows before sign-in. Live programs only, and only these fields.
create function public.get_join_info(slug text)
returns table (creator_first_name text, creator_last_name text, agent_name text, goal text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.first_name, c.last_name, coalesce(c.agent_name, c.first_name || '''s agent'), p.goal
    from public.programs p join public.creators c on c.id = p.creator_id
   where char_length(get_join_info.slug) <= 60
     and p.slug = lower(btrim(get_join_info.slug))
     and p.status = 'live'
   limit 1;
$$;

revoke all on function
  private.set_updated_at(), private.task_resource_same_program(), private.require_user(),
  public.register_creator(text, text), public.register_student(),
  public.create_program(text, integer), public.publish_program(uuid),
  public.reorder_milestones(uuid, uuid[]), public.reorder_tasks(uuid, uuid[]),
  public.get_join_info(text)
  from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.require_user() to authenticated;
grant execute on function
  public.register_creator(text, text), public.register_student(),
  public.create_program(text, integer), public.publish_program(uuid),
  public.reorder_milestones(uuid, uuid[]), public.reorder_tasks(uuid, uuid[]),
  public.get_join_info(text)
  to authenticated;
grant execute on function public.get_join_info(text) to anon;

-- ---------------------------------------------------------------------------
-- File storage: a private bucket, PDFs only, 20 MB. A creator can only touch
-- files under <their id>/<one of their program ids>/.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('program-files', 'program-files', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create function private.owns_program_folder(object_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (storage.foldername(object_name))[1] = (select auth.uid())::text
     and exists (
       select 1 from public.programs p
        where p.creator_id = (select auth.uid())
          and p.id::text = (storage.foldername(object_name))[2]);
$$;
revoke all on function private.owns_program_folder(text) from public, anon, authenticated;
grant execute on function private.owns_program_folder(text) to authenticated;

create policy program_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'program-files' and private.owns_program_folder(name));
create policy program_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'program-files' and private.owns_program_folder(name));
create policy program_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'program-files' and private.owns_program_folder(name))
  with check (bucket_id = 'program-files' and private.owns_program_folder(name));
create policy program_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'program-files' and private.owns_program_folder(name));
