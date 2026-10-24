-- Creator dashboard: who joined, where they are, and who needs help (MVP spec section 9, pilot slice).
--
-- Read only. Two functions return exactly what a creator may see about students in their own
-- programs: creator_dashboard (counts and the sorted student list) and creator_student (one
-- student's full record). Nothing here writes, and nothing new is stored: every status is
-- worked out from enrollments, task_progress and check_ins each time it is asked for.
--
-- Status, first match wins:
--   completed        every active task is done or skipped
--   needs_attention  blocker: they marked their current task "I'm stuck" and haven't resolved it
--   needs_attention  inactive: no check-in for 3 days (from when they joined if they never checked in);
--                    never while the program is paused
--   progressing      everyone else
--
-- Not in this step (later milestones): pacing (On track / Behind), nudges, resolving, waiving or
-- replacing tasks, milestone reviews, and notifications.

-- The MVP inactivity threshold (the Build Brief's "gone quiet" rule). One place to change it.
create function private.inactive_after() returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '3 days';
$$;

-- One student's dashboard row. The caller has already checked the creator owns the program.
create function private.student_row(enrollment uuid) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  e public.enrollments;
  p public.programs;
  s public.students;
  current_id uuid;
  t public.tasks;
  m public.milestones;
  tp public.task_progress;
  total integer;
  finished integer;
  milestone_count integer;
  milestone_number integer;
  blocker public.check_ins;
  last_ci public.check_ins;
  last_task public.tasks;
  last_activity timestamptz;
  status text;
  reason text;
begin
  select * into e from public.enrollments x where x.id = student_row.enrollment;
  select * into p from public.programs x where x.id = e.program_id;
  select * into s from public.students x where x.id = e.student_id;

  select count(*), count(*) filter (where tp2.state in ('done', 'skipped'))
    into total, finished
    from public.milestones m2
    join public.tasks t2 on t2.milestone_id = m2.id and t2.archived_at is null
    left join public.task_progress tp2 on tp2.enrollment_id = e.id and tp2.task_id = t2.id
   where m2.program_id = p.id and m2.archived_at is null;

  select count(*) into milestone_count from public.milestones x where x.program_id = p.id and x.archived_at is null;

  current_id := private.current_task(e.id);
  if current_id is not null then
    select * into t from public.tasks x where x.id = current_id;
    select * into m from public.milestones x where x.id = t.milestone_id;
    select * into tp from public.task_progress x where x.enrollment_id = e.id and x.task_id = t.id;
    select count(*) into milestone_number
      from public.milestones x where x.program_id = p.id and x.archived_at is null and x.position <= m.position;
    if tp.state = 'stuck' then
      select * into blocker from public.check_ins x
       where x.enrollment_id = e.id and x.task_id = t.id and x.kind = 'stuck'
       order by x.created_at desc, x.id desc limit 1;
    end if;
  end if;

  select * into last_ci from public.check_ins x where x.enrollment_id = e.id order by x.created_at desc, x.id desc limit 1;
  if last_ci.id is not null then
    select * into last_task from public.tasks x where x.id = last_ci.task_id;
  end if;
  last_activity := coalesce(last_ci.created_at, e.started_at);

  if total > 0 and current_id is null then
    status := 'completed';
  elsif tp.state = 'stuck' then
    status := 'needs_attention';
    reason := 'blocker';
  elsif p.status = 'live' and last_activity < now() - private.inactive_after() then
    status := 'needs_attention';
    reason := 'inactive';
  else
    status := 'progressing';
  end if;

  return jsonb_build_object(
    'enrollment_id', e.id,
    -- Students don't set a name yet, so the email they signed in with is the identifier.
    'name', coalesce(s.first_name, s.email),
    'email', s.email,
    'status', status,
    'attention', reason,
    'joined_at', e.started_at,
    'last_activity_at', last_activity,
    'finished_at', case when status = 'completed' then e.finished_at end,
    'progress', jsonb_build_object('done', finished, 'total', total),
    'milestone', case when current_id is null then null else jsonb_build_object(
      'number', milestone_number, 'count', milestone_count, 'title', m.title) end,
    'task', case when current_id is null then null else jsonb_build_object(
      'id', t.id, 'title', t.title, 'completion_type', t.completion_type, 'target_count', t.target_count,
      'unit', t.unit, 'state', coalesce(tp.state, 'current'), 'count_so_far', coalesce(tp.count_so_far, 0)) end,
    'blocker', case when blocker.id is null then null else jsonb_build_object(
      'reason', blocker.reason, 'note', blocker.value_text, 'reported_at', blocker.created_at) end,
    'last_check_in', case when last_ci.id is null then null else jsonb_build_object(
      'kind', last_ci.kind, 'value_number', last_ci.value_number, 'unit', last_task.unit,
      'task_title', last_task.title, 'created_at', last_ci.created_at) end);
end;
$$;

-- The creator's published programs, and for one of them (the newest by default) the four counts
-- and every enrolled student, sorted so the ones who need help come first.
create function public.creator_dashboard(program_id uuid default null) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  selected uuid := creator_dashboard.program_id;
  programs jsonb;
  rows jsonb;
begin
  if not exists (select 1 from public.creators c where c.id = uid) then
    raise exception 'Only creators have a dashboard.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'title', p.title, 'status', p.status,
           'enrolled', (select count(*) from public.enrollments e where e.program_id = p.id))
           order by p.published_at desc, p.id), '[]'::jsonb)
    into programs
    from public.programs p
   where p.creator_id = uid and p.published_at is not null;

  if selected is null then
    selected := (programs -> 0 ->> 'id')::uuid;
  elsif not exists (select 1 from public.programs p
                     where p.id = selected and p.creator_id = uid and p.published_at is not null) then
    raise exception 'Program not found.' using errcode = '42501';
  end if;

  if selected is null then
    return jsonb_build_object('programs', programs, 'program_id', null, 'counts', null, 'students', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(r order by
           case when r ->> 'status' = 'needs_attention' and r ->> 'attention' = 'blocker' then 0
                when r ->> 'status' = 'needs_attention' then 1
                when r ->> 'status' = 'progressing' then 2
                else 3 end,
           -- Longest-waiting blocker first, then quiet the longest, then most recently active.
           case when r ->> 'attention' = 'blocker' then (r -> 'blocker' ->> 'reported_at')::timestamptz end asc,
           case when r ->> 'attention' = 'inactive' then (r ->> 'last_activity_at')::timestamptz end asc,
           (r ->> 'last_activity_at')::timestamptz desc,
           r ->> 'enrollment_id'), '[]'::jsonb)
    into rows
    from (select private.student_row(e.id) as r from public.enrollments e where e.program_id = selected) x;

  return jsonb_build_object(
    'programs', programs,
    'program_id', selected,
    'inactive_days', extract(day from private.inactive_after())::integer,
    'counts', jsonb_build_object(
      'enrolled', jsonb_array_length(rows),
      'progressing', (select count(*) from jsonb_array_elements(rows) r where r ->> 'status' = 'progressing'),
      'needs_attention', (select count(*) from jsonb_array_elements(rows) r where r ->> 'status' = 'needs_attention'),
      'completed', (select count(*) from jsonb_array_elements(rows) r where r ->> 'status' = 'completed')),
    'students', rows);
end;
$$;

-- One student's full record for the creator whose program they joined: their row, the path with
-- each task's progress, and every check-in exactly as reported, newest first.
create function public.creator_student(enrollment_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  e public.enrollments;
  p public.programs;
  current_id uuid;
  path jsonb;
  history jsonb;
begin
  select x.* into e
    from public.enrollments x join public.programs y on y.id = x.program_id
   where x.id = creator_student.enrollment_id and y.creator_id = uid;
  if not found then
    raise exception 'Student not found.' using errcode = '42501';
  end if;
  select * into p from public.programs x where x.id = e.program_id;
  current_id := private.current_task(e.id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'number', mm.number, 'title', mm.title,
           'tasks', (select coalesce(jsonb_agg(jsonb_build_object(
                        'id', t.id, 'title', t.title, 'completion_type', t.completion_type,
                        'target_count', t.target_count, 'unit', t.unit, 'is_optional', t.is_optional,
                        'state', case when t.id = current_id then coalesce(tp.state, 'current')
                                      else coalesce(tp.state, 'not_started') end,
                        'count_so_far', coalesce(tp.count_so_far, 0), 'done_at', tp.done_at,
                        'current', t.id = current_id) order by t.position), '[]'::jsonb)
                       from public.tasks t
                       left join public.task_progress tp on tp.enrollment_id = e.id and tp.task_id = t.id
                      where t.milestone_id = mm.id and t.archived_at is null))
           order by mm.number), '[]'::jsonb)
    into path
    from (select m.id, m.title, row_number() over (order by m.position) as number
            from public.milestones m where m.program_id = p.id and m.archived_at is null) mm;

  -- A blocker is resolved by the first later report on the same task that clears "stuck" in
  -- submit_check_in: "I figured it out", logging progress, finishing, or skipping. ("Not yet" keeps it.)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ci.id, 'created_at', ci.created_at, 'kind', ci.kind, 'actor', ci.actor,
           'task_id', ci.task_id, 'task_title', t.title, 'unit', t.unit, 'completion_type', t.completion_type,
           'value_number', ci.value_number, 'value_yes_no', ci.value_yes_no, 'value_text', ci.value_text,
           'follow_up_question', t.follow_up_question, 'follow_up_answer', ci.follow_up_answer,
           'reason', ci.reason,
           'resolved_by', case when ci.kind = 'stuck' then res.kind end,
           'resolved_at', case when ci.kind = 'stuck' then res.created_at end)
           order by ci.created_at desc, ci.id desc), '[]'::jsonb)
    into history
    from public.check_ins ci
    join public.tasks t on t.id = ci.task_id
    left join lateral (
      select later.kind, later.created_at
        from public.check_ins later
       where ci.kind = 'stuck' and later.enrollment_id = ci.enrollment_id and later.task_id = ci.task_id
         and (later.created_at, later.id) > (ci.created_at, ci.id)
         and later.kind in ('unstuck', 'progress', 'complete', 'skip')
       order by later.created_at, later.id
       limit 1) res on true
   where ci.enrollment_id = e.id;

  return private.student_row(e.id) || jsonb_build_object(
    'program', jsonb_build_object('id', p.id, 'title', p.title, 'goal', p.goal, 'status', p.status),
    'consented_at', e.consented_at,
    'path', path,
    'check_ins', history);
end;
$$;

revoke all on function
  private.inactive_after(), private.student_row(uuid),
  public.creator_dashboard(uuid), public.creator_student(uuid)
  from public, anon, authenticated;
grant execute on function public.creator_dashboard(uuid), public.creator_student(uuid) to authenticated;
