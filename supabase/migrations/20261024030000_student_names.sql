-- Student names. Students give a required first name and an optional last name when they join
-- (existing students are asked the next time they open the app), and creators see that name
-- everywhere instead of the email. Nothing is inferred from the email: a student who hasn't
-- answered yet has a null name, and the app shows their email as it is.

alter table public.students
  add column last_name text check (last_name is null or char_length(last_name) <= 60);

-- Students already update their own row (students_update_own); this adds the new column to what
-- they may change. They still can't touch id, email or created_at.
grant update (last_name) on public.students to authenticated;

-- "First Last", or null when the student hasn't given a first name.
create function private.student_name(s public.students) returns text
language sql
immutable
set search_path = ''
as $$
  select case when nullif(btrim(s.first_name), '') is null then null
              else btrim(btrim(s.first_name) || ' ' || coalesce(btrim(s.last_name), '')) end;
$$;

revoke all on function private.student_name(public.students) from public, anon, authenticated;

-- Same as before except the name.
create or replace function private.student_row(enrollment uuid) returns jsonb
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
    -- The name the student gave, or null if they haven't yet. Never made up from the email.
    'name', private.student_name(s),
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

-- Same as before except the latest reports carry the name and email separately.
create or replace function public.creator_dashboard(program_id uuid default null) returns jsonb
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
  recent jsonb;
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
    from (select private.student_row(e.id)
                 || jsonb_build_object('check_ins', (select count(*) from public.check_ins ci where ci.enrollment_id = e.id)) as r
            from public.enrollments e where e.program_id = selected) x;

  -- The latest reports across this program's students, newest first, exactly as reported.
  select coalesce(jsonb_agg(f order by (f ->> 'created_at')::timestamptz desc, (f ->> 'id')::bigint desc), '[]'::jsonb)
    into recent
    from (select jsonb_build_object(
                   'id', ci.id, 'enrollment_id', ci.enrollment_id, 'name', private.student_name(s), 'email', s.email,
                   'kind', ci.kind, 'value_number', ci.value_number, 'unit', t.unit, 'task_title', t.title,
                   'created_at', ci.created_at) as f
            from public.check_ins ci
            join public.enrollments e on e.id = ci.enrollment_id
            join public.students s on s.id = e.student_id
            join public.tasks t on t.id = ci.task_id
           where e.program_id = selected
           order by ci.created_at desc, ci.id desc
           limit 6) x;

  return jsonb_build_object(
    'programs', programs,
    'program_id', selected,
    'inactive_days', extract(day from private.inactive_after())::integer,
    'counts', jsonb_build_object(
      'enrolled', jsonb_array_length(rows),
      'progressing', (select count(*) from jsonb_array_elements(rows) r where r ->> 'status' = 'progressing'),
      'needs_attention', (select count(*) from jsonb_array_elements(rows) r where r ->> 'status' = 'needs_attention'),
      'completed', (select count(*) from jsonb_array_elements(rows) r where r ->> 'status' = 'completed')),
    'students', rows,
    -- Rolling 24-hour windows, so the numbers mean the same thing in every time zone.
    'activity', (select jsonb_build_object(
                   'last_24h', count(*) filter (where ci.created_at >= now() - interval '24 hours'),
                   'previous_24h', count(*) filter (where ci.created_at >= now() - interval '48 hours'
                                                      and ci.created_at < now() - interval '24 hours'))
                   from public.check_ins ci join public.enrollments e on e.id = ci.enrollment_id
                  where e.program_id = selected),
    'recent', recent);
end;
$$;
