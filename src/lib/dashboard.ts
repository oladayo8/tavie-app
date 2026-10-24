import type { SupabaseClient } from '@supabase/supabase-js';

import type { CompletionType } from '@/lib/program';
import { supabase } from '@/lib/supabase';

/**
 * The creator's view of their students. Two read-only database functions decide everything:
 * creator_dashboard (counts and the sorted list) and creator_student (one student's record).
 * They only return students in the caller's own programs, and statuses are worked out from the
 * check-ins each time, so nothing here can drift from what students actually reported.
 */

export type StudentStatus = 'progressing' | 'needs_attention' | 'completed';
export type Attention = 'blocker' | 'inactive' | null;
export type CheckInKind = 'complete' | 'progress' | 'not_yet' | 'stuck' | 'unstuck' | 'skip';

export type StudentRow = {
  enrollment_id: string;
  name: string;
  email: string;
  status: StudentStatus;
  attention: Attention;
  joined_at: string;
  last_activity_at: string;
  finished_at: string | null;
  progress: { done: number; total: number };
  milestone: { number: number; count: number; title: string } | null;
  task: {
    id: string;
    title: string;
    completion_type: CompletionType;
    target_count: number | null;
    unit: string | null;
    state: 'current' | 'in_progress' | 'stuck';
    count_so_far: number;
  } | null;
  blocker: { reason: string; note: string | null; reported_at: string } | null;
  last_check_in: {
    kind: CheckInKind;
    value_number: number | null;
    unit: string | null;
    task_title: string;
    created_at: string;
  } | null;
};

export type Dashboard = {
  programs: { id: string; title: string; status: 'live' | 'paused' | 'draft'; enrolled: number }[];
  program_id: string | null;
  inactive_days?: number;
  counts: { enrolled: number; progressing: number; needs_attention: number; completed: number } | null;
  students: StudentRow[];
};

export type PathTask = {
  id: string;
  title: string;
  completion_type: CompletionType;
  target_count: number | null;
  unit: string | null;
  is_optional: boolean;
  state: 'current' | 'not_started' | 'in_progress' | 'stuck' | 'done' | 'skipped';
  count_so_far: number;
  done_at: string | null;
  current: boolean;
};

export type ReportedCheckIn = {
  id: number;
  created_at: string;
  kind: CheckInKind;
  actor: 'student' | 'creator';
  task_id: string;
  task_title: string;
  unit: string | null;
  completion_type: CompletionType;
  value_number: number | null;
  value_yes_no: boolean | null;
  value_text: string | null;
  follow_up_question: string | null;
  follow_up_answer: string | null;
  reason: string | null;
  /** For a "stuck" report: the later report that cleared it, or null while it's still open. */
  resolved_by: CheckInKind | null;
  resolved_at: string | null;
};

export type StudentRecord = StudentRow & {
  program: { id: string; title: string; goal: string; status: 'live' | 'paused' | 'draft' };
  consented_at: string;
  path: { number: number; title: string; tasks: PathTask[] }[];
  check_ins: ReportedCheckIn[];
};

function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

/** The newest published program when `programId` is null. */
export async function getDashboard(programId: string | null): Promise<Dashboard> {
  const { data, error } = await db().rpc('creator_dashboard', { program_id: programId });
  if (error) throw error;
  return data as Dashboard;
}

export async function getStudent(enrollmentId: string): Promise<StudentRecord> {
  const { data, error } = await db().rpc('creator_student', { enrollment_id: enrollmentId });
  if (error) throw error;
  return data as StudentRecord;
}

const DAY = 24 * 60 * 60 * 1000;

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
export function ago(iso: string, now = Date.now()): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(ms / DAY);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Whole days since `iso`, for "No check-in for 4 days". */
export function daysSince(iso: string, now = Date.now()): number {
  return Math.floor(Math.max(0, now - new Date(iso).getTime()) / DAY);
}

/** "Oct 23, 4:12 PM". */
export function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** What a report says, in a few words: "Logged 15 calls", "Marked done", "Reported stuck". */
export function reportSummary(c: { kind: CheckInKind; value_number: number | null; unit: string | null }): string {
  switch (c.kind) {
    case 'progress':
      return `Logged ${c.value_number ?? 0} ${c.unit?.trim() || ''}`.trim();
    case 'complete':
      return 'Marked done';
    case 'not_yet':
      return 'Said not yet';
    case 'stuck':
      return 'Reported stuck';
    case 'unstuck':
      return 'Said they figured it out';
    case 'skip':
      return 'Skipped (optional)';
  }
}

export const STATUS_LABEL: Record<StudentStatus, string> = {
  progressing: 'Progressing',
  needs_attention: 'Needs attention',
  completed: 'Completed',
};

/** The one-line reason under a student who needs attention. */
export function attentionLine(s: Pick<StudentRow, 'attention' | 'blocker' | 'last_activity_at'>, now = Date.now()) {
  if (s.attention === 'blocker' && s.blocker) return `Stuck: ${s.blocker.reason}`;
  if (s.attention === 'inactive') {
    const days = daysSince(s.last_activity_at, now);
    return `No check-in for ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  return null;
}

/** How a blocker was cleared, for the student's record. */
export function resolvedLine(kind: CheckInKind | null): string | null {
  switch (kind) {
    case 'unstuck':
      return 'They said they figured it out';
    case 'progress':
      return 'They logged progress after it';
    case 'complete':
      return 'They finished the task';
    case 'skip':
      return 'They skipped the task';
    default:
      return null;
  }
}
