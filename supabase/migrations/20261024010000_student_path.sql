-- The student's My Path tab: every milestone and task in the creator's order, with what they've
-- finished, where they are now, and what comes next. Read only: it changes nothing and offers no
-- way to act on a task, so progression still happens only through submit_check_in on Today.

create function public.get_path() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  e public.enrollments;
  p public.programs;
  c public.creators;
  current_id uuid;
  milestones jsonb;
begin
  select * into e from public.enrollments x where x.student_id = uid order by x.started_at desc limit 1;
  if e.id is null then
    return null;
  end if;
  select * into p from public.programs x where x.id = e.program_id;
  select * into c from public.creators x where x.id = p.creator_id;
  current_id := private.current_task(e.id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'number', mm.number, 'title', mm.title,
           'tasks', (select coalesce(jsonb_agg(jsonb_build_object(
                        'title', t.title, 'completion_type', t.completion_type, 'target_count', t.target_count,
                        'unit', t.unit, 'is_optional', t.is_optional,
                        'state', case when tp.state in ('done', 'skipped') then tp.state
                                      when t.id = current_id then 'current'
                                      else 'upcoming' end,
                        'stuck', coalesce(tp.state = 'stuck', false),
                        'count_so_far', coalesce(tp.count_so_far, 0), 'done_at', tp.done_at)
                        order by t.position), '[]'::jsonb)
                       from public.tasks t
                       left join public.task_progress tp on tp.enrollment_id = e.id and tp.task_id = t.id
                      where t.milestone_id = mm.id and t.archived_at is null))
           order by mm.number), '[]'::jsonb)
    into milestones
    from (select m.id, m.title, row_number() over (order by m.position) as number
            from public.milestones m where m.program_id = p.id and m.archived_at is null) mm;

  return jsonb_build_object(
    'program', jsonb_build_object('title', p.title, 'goal', p.goal, 'status', p.status),
    'creator', jsonb_build_object('first_name', c.first_name, 'last_name', c.last_name),
    'joined_at', e.started_at,
    'finished', current_id is null,
    'milestones', milestones);
end;
$$;

revoke all on function public.get_path() from public, anon, authenticated;
grant execute on function public.get_path() to authenticated;
