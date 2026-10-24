-- Creator dashboard, more of what students already reported (no new data, nothing written):
-- each student's number of check-ins, check-ins in the last 24 hours against the 24 before, and
-- the six latest check-ins for the program. Same owner check as before: only the creator's own
-- published programs.

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
                   'id', ci.id, 'enrollment_id', ci.enrollment_id, 'name', coalesce(s.first_name, s.email),
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
