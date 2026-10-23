import type { SupabaseClient } from '@supabase/supabase-js';

import type { CompletionType, ResourceType } from '@/lib/program';
import { supabase } from '@/lib/supabase';

/**
 * The student side. Students never read program tables: three database functions return exactly
 * what they may see (join_program, get_today, submit_check_in), and only submit_check_in moves
 * progress, by the creator's rules.
 */

export type TodayTask = {
  id: string;
  title: string;
  why: string | null;
  est_minutes: number;
  is_optional: boolean;
  completion_type: CompletionType;
  check_in_question: string | null;
  target_count: number | null;
  unit: string | null;
  follow_up_question: string | null;
  follow_up_options: string[] | null;
  state: 'current' | 'in_progress' | 'stuck';
  count_so_far: number;
};

export type TodayResource = {
  id: string;
  type: ResourceType;
  title: string;
  url: string | null;
  file_path: string | null;
};

export type TodayCard = {
  enrollment_id: string;
  program: { title: string; goal: string; status: 'live' | 'paused' | 'draft' };
  creator: { first_name: string; last_name: string; agent_name: string };
  progress: { done: number; total: number };
  /** Null when they've finished the path. */
  task: TodayTask | null;
  milestone?: { number: number; count: number; title: string };
  resources?: TodayResource[];
};

export type CheckInKind = 'complete' | 'progress' | 'not_yet' | 'stuck' | 'unstuck' | 'skip';

export type CheckIn = {
  kind: CheckInKind;
  number?: number;
  yes?: boolean;
  text?: string;
  followUp?: string;
  reason?: string;
};

export type CheckInResult = {
  ok: boolean;
  /** The task had already moved on (another tap or device); `today` shows where they really are. */
  stale?: boolean;
  state?: 'in_progress' | 'stuck' | 'done' | 'skipped';
  today: TodayCard;
};

export const STUCK_REASONS = ["I don't know how", "I tried and it didn't work", 'Something outside my control'];
export const NOT_YET_REASONS = ['Ran out of time', 'Waiting on someone else'];
export const TEXT_ANSWER = { min: 10, max: 500 } as const;

function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

/** Enrolls the signed-in student from a join link (safe to repeat) and returns their Today card. */
export async function joinProgram(slug: string): Promise<TodayCard> {
  const { data, error } = await db().rpc('join_program', { slug });
  if (error) throw error;
  return data as TodayCard;
}

/** Null when they haven't joined a program yet. */
export async function getToday(): Promise<TodayCard | null> {
  const { data, error } = await db().rpc('get_today');
  if (error) throw error;
  return (data as TodayCard | null) ?? null;
}

/** `requestId` stays the same across retries of one answer, so a retry never counts twice. */
export async function submitCheckIn(
  card: TodayCard,
  taskId: string,
  answer: CheckIn,
  requestId: string,
): Promise<CheckInResult> {
  const { data, error } = await db().rpc('submit_check_in', {
    enrollment_id: card.enrollment_id,
    task_id: taskId,
    kind: answer.kind,
    value_number: answer.number ?? null,
    value_yes_no: answer.yes ?? null,
    value_text: answer.text?.trim() || null,
    follow_up_answer: answer.followUp?.trim() || null,
    reason: answer.reason ?? null,
    client_request_id: requestId,
  });
  if (error) throw error;
  return data as CheckInResult;
}

export async function openableUrl(resource: TodayResource): Promise<string | null> {
  if (resource.url) return resource.url;
  if (!resource.file_path) return null;
  const { data, error } = await db().storage.from('program-files').createSignedUrl(resource.file_path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export type JoinInfo = { creatorName: string; firstName: string; agentName: string; goal: string; title: string };

/** The public facts about a live program's link, readable before sign-in. Null when the link isn't live. */
export async function getJoinInfo(slug: string): Promise<JoinInfo | null> {
  const { data, error } = await db().rpc('get_join_info', { slug });
  if (error) throw error;
  const row = (data as Record<string, string>[] | null)?.[0];
  if (!row) return null;
  return {
    creatorName: [row.creator_first_name, row.creator_last_name].filter(Boolean).join(' '),
    firstName: row.creator_first_name,
    agentName: row.agent_name,
    goal: row.goal,
    title: row.title,
  };
}
