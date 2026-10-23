-- Students: joining a live program, the Today task, and check-ins (MVP spec sections 2 and 4 to 7).
--
-- Students never read program tables directly. Three functions do everything, each checking
-- the caller: join_program (enrolls them from a join link), get_today (their one task), and
-- submit_check_in (records a report and moves progress forward by the creator's rules).
-- check_ins is the permanent diary of what the student reported; task_progress is the bookmark.
--
-- Not in this step (later milestones): onboarding questions and pacing, milestone review gates,
-- creator overrides (waive or replace), undo, and the creator dashboard.

-- ---------------------------------------------------------------------------
-- Tables. Row-level security is on and nobody gets direct access: only the functions below.
-- ---------------------------------------------------------------------------

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  -- The join screen says "<coach> can see your progress and check-ins" before they continue.
  consented_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  last_active_at timestamptz,
  finished_at timestamptz,
  constraint enrollments_one_per_program unique (student_id, program_id)
);
create index enrollments_program_id_idx on public.enrollments (program_id);

create table public.task_progress (
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  state text not null check (state in ('in_progress', 'stuck', 'done', 'skipped')),
  count_so_far integer not null default 0 check (count_so_far >= 0),
  done_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (enrollment_id, task_id)
);
create index task_progress_task_id_idx on public.task_progress (task_id);

create table public.check_ins (
  id bigint generated always as identity primary key,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  task_id uuid not null references public.tasks (id),
  actor text not null default 'student' check (actor in ('student', 'creator')),
  actor_id uuid not null,
  kind text not null check (kind in ('complete', 'progress', 'not_yet', 'stuck', 'unstuck', 'skip')),
  value_number integer check (value_number between 0 and 999),
  value_yes_no boolean,
  value_text text check (char_length(value_text) <= 500),
  follow_up_answer text check (char_length(follow_up_answer) <= 160),
  reason text check (char_length(reason) <= 60),
  -- Lets the app retry after a dropped connection without counting twice.
  client_request_id uuid unique,
  created_at timestamptz not null default now()
);
create index check_ins_enrollment_idx on public.check_ins (enrollment_id, created_at);
create index check_ins_task_id_idx on public.check_ins (task_id);

alter table public.enrollments enable row level security;
alter table public.task_progress enable row level security;
alter table public.check_ins enable row level security;
revoke all on public.enrollments, public.task_progress, public.check_ins from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The progression engine. The same program and check-ins always give the same task.
-- ---------------------------------------------------------------------------

-- The first task, in the creator's order, that this student hasn't finished or skipped.
-- Null means they finished the path.
create function private.current_task(enrollment uuid) returns uuid
language sql
stable
set search_path = ''
as $$
  select t.id
    from public.enrollments e
    join public.milestones m on m.program_id = e.program_id and m.archived_at is null
    join public.tasks t on t.milestone_id = m.id and t.archived_at is null
    left join public.task_progress tp on tp.enrollment_id = e.id and tp.task_id = t.id
   where e.id = current_task.enrollment
     and coalesce(tp.state, 'current') not in ('done', 'skipped')
   order by m.position, t.position
   limit 1;
$$;

-- Everything the Today screen shows, for one enrollment.
create function private.today_card(enrollment uuid) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  e public.enrollments;
  p public.programs;
  c public.creators;
  current_id uuid;
  t public.tasks;
  m public.milestones;
  tp public.task_progress;
  total integer;
  finished integer;
  milestone_count integer;
  milestone_number integer;
  card jsonb;
begin
  select * into e from public.enrollments x where x.id = today_card.enrollment;
  select * into p from public.programs x where x.id = e.program_id;
  select * into c from public.creators x where x.id = p.creator_id;

  select count(*), count(*) filter (where tp2.state in ('done', 'skipped'))
    into total, finished
    from public.milestones m2
    join public.tasks t2 on t2.milestone_id = m2.id and t2.archived_at is null
    left join public.task_progress tp2 on tp2.enrollment_id = e.id and tp2.task_id = t2.id
   where m2.program_id = p.id and m2.archived_at is null;

  card := jsonb_build_object(
    'enrollment_id', e.id,
    'program', jsonb_build_object('title', p.title, 'goal', p.goal, 'status', p.status),
    'creator', jsonb_build_object(
      'first_name', c.first_name, 'last_name', c.last_name,
      'agent_name', coalesce(c.agent_name, c.first_name || '''s agent')),
    'progress', jsonb_build_object('done', finished, 'total', total),
    'task', null);

  current_id := private.current_task(e.id);
  if current_id is null then
    return card;
  end if;

  select * into t from public.tasks x where x.id = current_id;
  select * into m from public.milestones x where x.id = t.milestone_id;
  select * into tp from public.task_progress x where x.enrollment_id = e.id and x.task_id = t.id;
  select count(*), count(*) filter (where x.position <= m.position)
    into milestone_count, milestone_number
    from public.milestones x where x.program_id = p.id and x.archived_at is null;

  return card || jsonb_build_object(
    'milestone', jsonb_build_object('number', milestone_number, 'count', milestone_count, 'title', m.title),
    'task', jsonb_build_object(
      'id', t.id, 'title', t.title, 'why', t.why, 'est_minutes', t.est_minutes, 'is_optional', t.is_optional,
      'completion_type', t.completion_type, 'check_in_question', t.check_in_question,
      'target_count', t.target_count, 'unit', t.unit,
      'follow_up_question', t.follow_up_question, 'follow_up_options', to_jsonb(t.follow_up_options),
      'state', coalesce(tp.state, 'current'), 'count_so_far', coalesce(tp.count_so_far, 0)),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'type', r.type, 'title', r.title, 'url', r.url,
                                          'file_path', r.file_path) order by tr.position)
        from public.task_resources tr join public.resources r on r.id = tr.resource_id
       where tr.task_id = t.id), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- What the app calls.
-- ---------------------------------------------------------------------------

-- Called after a student signs in from a join link. Safe to repeat: they stay where they were.
create function public.join_program(slug text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  prog uuid;
  enrollment uuid;
begin
  if not exists (select 1 from public.students s where s.id = uid) then
    raise exception 'Only students can join a program.' using errcode = '42501';
  end if;
  select p.id into prog
    from public.programs p
   where char_length(join_program.slug) <= 60 and p.slug = lower(btrim(join_program.slug)) and p.status = 'live';
  if prog is null then
    raise exception 'This link isn''t active. Ask your coach for a new one.' using errcode = 'P0002';
  end if;

  insert into public.enrollments (student_id, program_id) values (uid, prog)
  on conflict on constraint enrollments_one_per_program do nothing;
  select e.id into enrollment from public.enrollments e where e.student_id = uid and e.program_id = prog;
  return private.today_card(enrollment);
end;
$$;

-- The student's Today card for the program they joined most recently, or null if they haven't joined one.
create function public.get_today() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  enrollment uuid;
begin
  select e.id into enrollment
    from public.enrollments e where e.student_id = uid
   order by e.started_at desc limit 1;
  if enrollment is null then
    return null;
  end if;
  return private.today_card(enrollment);
end;
$$;

-- Records one report and applies the creator's rule for the task, all in one transaction.
-- It can only finish the current task, add progress to it, or flag it as stuck; it can never
-- reorder the path or skip a required task. Returns the new Today card.
create function public.submit_check_in(
  enrollment_id uuid,
  task_id uuid,
  kind text,
  value_number integer default null,
  value_yes_no boolean default null,
  value_text text default null,
  follow_up_answer text default null,
  reason text default null,
  client_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  e public.enrollments;
  t public.tasks;
  tp public.task_progress;
  answer text := nullif(btrim(coalesce(submit_check_in.value_text, '')), '');
  follow_up text := nullif(btrim(coalesce(submit_check_in.follow_up_answer, '')), '');
  new_state text;
  new_count integer;
begin
  -- Locking the enrollment makes two taps at once run one after the other.
  select * into e from public.enrollments x
   where x.id = submit_check_in.enrollment_id and x.student_id = uid
   for update;
  if not found then
    raise exception 'Enrollment not found.' using errcode = '42501';
  end if;

  if submit_check_in.client_request_id is not null and exists (
       select 1 from public.check_ins ci
        where ci.client_request_id = submit_check_in.client_request_id and ci.enrollment_id = e.id) then
    return jsonb_build_object('ok', true, 'repeat', true, 'today', private.today_card(e.id));
  end if;

  if (select p.status from public.programs p where p.id = e.program_id) <> 'live' then
    raise exception 'Your coach has paused this program.' using errcode = '55000';
  end if;

  -- A stale screen or double tap can't move anyone forward twice.
  if private.current_task(e.id) is distinct from submit_check_in.task_id then
    return jsonb_build_object('ok', false, 'stale', true, 'today', private.today_card(e.id));
  end if;

  select * into t from public.tasks x where x.id = submit_check_in.task_id;
  select * into tp from public.task_progress x where x.enrollment_id = e.id and x.task_id = t.id;
  new_count := coalesce(tp.count_so_far, 0);

  case submit_check_in.kind
    when 'complete' then
      if t.completion_type = 'count'
         or (t.completion_type = 'yes_no' and submit_check_in.value_yes_no is not true)
         or (t.completion_type = 'text' and char_length(coalesce(answer, '')) not between 10 and 500) then
        raise exception 'That answer doesn''t finish this task.' using errcode = '22023';
      end if;
      new_state := 'done';
    when 'progress' then
      if t.completion_type <> 'count' or submit_check_in.value_number is null
         or submit_check_in.value_number not between 0 and 999 then
        raise exception 'Enter a number from 0 to 999.' using errcode = '22023';
      end if;
      new_count := new_count + submit_check_in.value_number;
      new_state := case when new_count >= t.target_count then 'done' else 'in_progress' end;
    when 'not_yet' then
      if t.completion_type <> 'yes_no' or submit_check_in.reason is null
         or submit_check_in.reason not in ('Ran out of time', 'Waiting on someone else') then
        raise exception 'Pick what got in the way.' using errcode = '22023';
      end if;
      new_state := case when tp.state = 'stuck' then 'stuck' else 'in_progress' end;
    when 'stuck' then
      if submit_check_in.reason is null or submit_check_in.reason not in (
           'I don''t know how', 'I tried and it didn''t work', 'Something outside my control') then
        raise exception 'Pick what''s in the way.' using errcode = '22023';
      end if;
      new_state := 'stuck';
    when 'unstuck' then
      if tp.state is distinct from 'stuck' then
        raise exception 'This task isn''t marked as stuck.' using errcode = '22023';
      end if;
      new_state := 'in_progress';
    when 'skip' then
      if not t.is_optional then
        raise exception 'Only optional tasks can be skipped.' using errcode = '22023';
      end if;
      new_state := 'skipped';
    else
      raise exception 'Unknown check-in.' using errcode = '22023';
  end case;

  -- The follow-up records how it went. It never decides whether the task is done.
  if follow_up is not null then
    if submit_check_in.kind not in ('complete', 'progress', 'not_yet') or t.follow_up_question is null
       or char_length(follow_up) > 160
       or (t.follow_up_options is not null and not follow_up = any (t.follow_up_options)) then
      raise exception 'That follow-up answer doesn''t fit this task.' using errcode = '22023';
    end if;
  end if;
  if answer is not null and char_length(answer) > 500 then
    raise exception 'Keep it under 500 characters.' using errcode = '22023';
  end if;

  insert into public.check_ins (enrollment_id, task_id, actor_id, kind, value_number, value_yes_no, value_text,
                                follow_up_answer, reason, client_request_id)
  values (e.id, t.id, uid, submit_check_in.kind, submit_check_in.value_number, submit_check_in.value_yes_no, answer,
          follow_up, submit_check_in.reason, submit_check_in.client_request_id);

  insert into public.task_progress (enrollment_id, task_id, state, count_so_far, done_at)
  values (e.id, t.id, new_state, new_count, case when new_state = 'done' then now() end)
  on conflict on constraint task_progress_pkey do update
    set state = excluded.state, count_so_far = excluded.count_so_far, done_at = excluded.done_at, updated_at = now();

  update public.enrollments x
     set last_active_at = now(),
         finished_at = case when private.current_task(e.id) is null then coalesce(x.finished_at, now()) end
   where x.id = e.id;

  return jsonb_build_object('ok', true, 'state', new_state, 'today', private.today_card(e.id));
end;
$$;

-- The join screen now shows the program title too. The return type changes, so recreate it.
drop function public.get_join_info(text);
create function public.get_join_info(slug text)
returns table (creator_first_name text, creator_last_name text, agent_name text, goal text, title text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.first_name, c.last_name, coalesce(c.agent_name, c.first_name || '''s agent'), p.goal, p.title
    from public.programs p join public.creators c on c.id = p.creator_id
   where char_length(get_join_info.slug) <= 60
     and p.slug = lower(btrim(get_join_info.slug))
     and p.status = 'live'
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Files: a student can open PDFs of a live program they joined, and nothing else.
-- ---------------------------------------------------------------------------

create function private.enrolled_in_program_folder(object_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e join public.programs p on p.id = e.program_id
     where e.student_id = (select auth.uid())
       and p.status = 'live'
       and p.creator_id::text = (storage.foldername(object_name))[1]
       and p.id::text = (storage.foldername(object_name))[2]);
$$;

create policy program_files_select_enrolled on storage.objects
  for select to authenticated
  using (bucket_id = 'program-files' and private.enrolled_in_program_folder(name));

revoke all on function
  private.current_task(uuid), private.today_card(uuid), private.enrolled_in_program_folder(text),
  public.join_program(text), public.get_today(),
  public.submit_check_in(uuid, uuid, text, integer, boolean, text, text, text, uuid),
  public.get_join_info(text)
  from public, anon, authenticated;
grant execute on function
  private.enrolled_in_program_folder(text),
  public.join_program(text), public.get_today(),
  public.submit_check_in(uuid, uuid, text, integer, boolean, text, text, text, uuid),
  public.get_join_info(text)
  to authenticated;
grant execute on function public.get_join_info(text) to anon;
