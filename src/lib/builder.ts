import type { SupabaseClient } from '@supabase/supabase-js';

import type { Milestone, Program, Resource, Task, TaskDraft } from '@/lib/program';
import { nextPosition, taskFields } from '@/lib/program';
import { supabase } from '@/lib/supabase';

/**
 * Reads and writes for the creator builder. Row-level security limits every call to the
 * signed-in creator's own programs, so these never filter by creator themselves.
 */

function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

function check<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error;
  return data;
}

const PROGRAM = 'id, title, goal, duration_weeks, slug, status, published_at, updated_at';
const MILESTONE = 'id, program_id, position, title, description, requires_review, archived_at';
const TASK =
  'id, milestone_id, position, title, why, est_minutes, is_optional, completion_type, check_in_question, target_count, unit, follow_up_question, follow_up_options, archived_at';
const RESOURCE = 'id, program_id, type, title, url, file_path';

export type ProgramSummary = Program & { milestoneCount: number; taskCount: number };

export async function listPrograms(): Promise<ProgramSummary[]> {
  const rows = check(
    await db()
      .from('programs')
      .select(`${PROGRAM}, milestones(id, archived_at, tasks(id, archived_at))`)
      .order('updated_at', { ascending: false }),
  ) as (Program & { milestones: { archived_at: string | null; tasks: { archived_at: string | null }[] }[] })[];
  return rows.map(({ milestones, ...program }) => {
    const active = milestones.filter((m) => !m.archived_at);
    return {
      ...program,
      milestoneCount: active.length,
      taskCount: active.reduce((n, m) => n + m.tasks.filter((t) => !t.archived_at).length, 0),
    };
  });
}

export async function createProgram(goal: string, durationWeeks: number): Promise<Program> {
  return check(await db().rpc('create_program', { goal: goal.trim(), duration_weeks: durationWeeks })) as Program;
}

export type ProgramDetail = {
  program: Program;
  agentName: string | null;
  creatorFirstName: string;
  creatorLastName: string;
  milestones: Milestone[];
  tasks: Task[];
  resources: Resource[];
  /** resource ids per task id, in their order on the task */
  links: Record<string, string[]>;
};

/** One program with everything under it, in builder order. Archived rows are included. */
export async function loadProgram(programId: string): Promise<ProgramDetail> {
  const client = db();
  const [program, creator, milestones, resources] = await Promise.all([
    client.from('programs').select(PROGRAM).eq('id', programId).single(),
    client.from('creators').select('first_name, last_name, agent_name').single(),
    client.from('milestones').select(MILESTONE).eq('program_id', programId).order('position'),
    client.from('resources').select(RESOURCE).eq('program_id', programId).order('created_at'),
  ]);
  const ms = check(milestones) as Milestone[];
  const tasks = ms.length
    ? (check(
        await client
          .from('tasks')
          .select(TASK)
          .in(
            'milestone_id',
            ms.map((m) => m.id),
          )
          .order('position'),
      ) as Task[])
    : [];
  const linkRows = tasks.length
    ? (check(
        await client
          .from('task_resources')
          .select('task_id, resource_id, position')
          .in(
            'task_id',
            tasks.map((t) => t.id),
          )
          .order('position'),
      ) as { task_id: string; resource_id: string }[])
    : [];
  const links: Record<string, string[]> = {};
  for (const row of linkRows) (links[row.task_id] ??= []).push(row.resource_id);
  const c = check(creator) as { first_name: string; last_name: string; agent_name: string | null };
  return {
    program: check(program) as Program,
    agentName: c.agent_name,
    creatorFirstName: c.first_name,
    creatorLastName: c.last_name,
    milestones: ms,
    tasks,
    resources: check(resources) as Resource[],
    links,
  };
}

export async function updateProgram(programId: string, fields: { goal?: string; duration_weeks?: number }) {
  const update: Record<string, unknown> = { ...fields };
  // The title follows the goal; the Brief keeps it as a separate column for later.
  if (fields.goal) update.title = fields.goal.trim().slice(0, 80);
  check(await db().from('programs').update(update).eq('id', programId));
}

export async function setAgentName(name: string) {
  const { data: user } = await db().auth.getUser();
  if (!user.user) throw new Error('Not signed in.');
  check(await db().from('creators').update({ agent_name: name.trim() }).eq('id', user.user.id));
}

export async function addMilestone(programId: string, existing: Milestone[], title: string) {
  return check(
    await db()
      .from('milestones')
      .insert({ program_id: programId, position: nextPosition(existing), title: title.trim() })
      .select(MILESTONE)
      .single(),
  ) as Milestone;
}

export async function updateMilestone(
  id: string,
  fields: Partial<Pick<Milestone, 'title' | 'description' | 'requires_review' | 'archived_at'>>,
) {
  check(await db().from('milestones').update(fields).eq('id', id));
}

/** Saves a new order. `ids` is the visible order; archived rows keep their place at the end. */
export async function reorderMilestones(programId: string, ids: string[], all: Milestone[]) {
  const rest = all.filter((m) => !ids.includes(m.id)).map((m) => m.id);
  check(await db().rpc('reorder_milestones', { program_id: programId, ids: [...ids, ...rest] }));
}

export async function reorderTasks(milestoneId: string, ids: string[], all: Task[]) {
  const rest = all.filter((t) => t.milestone_id === milestoneId && !ids.includes(t.id)).map((t) => t.id);
  check(await db().rpc('reorder_tasks', { milestone_id: milestoneId, ids: [...ids, ...rest] }));
}

export async function archiveTask(id: string) {
  check(await db().from('tasks').update({ archived_at: new Date().toISOString() }).eq('id', id));
}

/**
 * Saves a task and its resource list. Safe to repeat after a failure: the task row is
 * written first (and its id kept), then the links are replaced to match the draft.
 */
export async function saveTask(
  draft: TaskDraft,
  where: { taskId: string | null; milestoneId: string; siblings: Task[] },
  onCreated?: (taskId: string) => void,
): Promise<string> {
  const client = db();
  const fields = taskFields(draft);
  let taskId = where.taskId;
  if (taskId) {
    check(await client.from('tasks').update(fields).eq('id', taskId));
  } else {
    const position = nextPosition(where.siblings.filter((t) => t.milestone_id === where.milestoneId));
    const row = check(
      await client
        .from('tasks')
        .insert({ ...fields, milestone_id: where.milestoneId, position })
        .select('id')
        .single(),
    ) as { id: string };
    taskId = row.id;
    // Report the new id before the links are written, so a retry updates this task instead of adding another.
    onCreated?.(taskId);
  }
  check(await client.from('task_resources').delete().eq('task_id', taskId));
  if (draft.resource_ids.length) {
    check(
      await client
        .from('task_resources')
        .insert(draft.resource_ids.map((resource_id, position) => ({ task_id: taskId, resource_id, position }))),
    );
  }
  return taskId;
}

export async function addLinkResource(programId: string, type: 'youtube' | 'link', title: string, url: string) {
  return check(
    await db()
      .from('resources')
      .insert({ program_id: programId, type, title: title.trim(), url: url.trim() })
      .select(RESOURCE)
      .single(),
  ) as Resource;
}

/** Uploads a PDF into the creator's own program folder, then records it as a resource. */
export async function addFileResource(
  programId: string,
  file: { uri: string; name: string; size?: number | null },
  title: string,
) {
  const client = db();
  const { data: user } = await client.auth.getUser();
  if (!user.user) throw new Error('Not signed in.');
  const body = await (await fetch(file.uri)).arrayBuffer();
  const path = `${user.user.id}/${programId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  check(await client.storage.from('program-files').upload(path, body, { contentType: 'application/pdf' }));
  try {
    return check(
      await client
        .from('resources')
        .insert({ program_id: programId, type: 'file', title: title.trim(), file_path: path })
        .select(RESOURCE)
        .single(),
    ) as Resource;
  } catch (error) {
    await client.storage.from('program-files').remove([path]);
    throw error;
  }
}

/** A link that works for a few minutes, for opening a private PDF. */
export async function resourceUrl(resource: Resource): Promise<string | null> {
  if (resource.url) return resource.url;
  if (!resource.file_path) return null;
  const { data, error } = await db().storage.from('program-files').createSignedUrl(resource.file_path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export type PublishResult = { ok: boolean; status: string; problems: { code: string; message: string }[] };

export async function publishProgram(programId: string): Promise<PublishResult> {
  return check(await db().rpc('publish_program', { program_id: programId })) as PublishResult;
}
