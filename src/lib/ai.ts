import type { SupabaseClient } from '@supabase/supabase-js';

import type { SuggestedMilestone, SuggestedPlan, SuggestedTask } from '@/lib/plan-rules';
import { cleanPlan, cleanTask } from '@/lib/plan-rules';
import { supabase } from '@/lib/supabase';

/**
 * Asks the `generate` Edge Function for suggestions. Suggestions are never saved here: the creator
 * edits them first, and only importPlan or saveTask writes anything. Every failure comes back as a
 * plain message so the screen can keep what the creator typed and offer the manual builder instead.
 */

export type AiResult<T> = { ok: true; value: T } | { ok: false; message: string };

const PLAN_WAIT_MS = 140_000;
const TASK_WAIT_MS = 45_000;
const IMPORT_WAIT_MS = 30_000;

function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

async function call(body: object, waitMs: number, fallback: string): Promise<AiResult<Record<string, unknown>>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), waitMs);
  try {
    const { data, error } = await db().functions.invoke('generate', { body, signal: controller.signal });
    if (!error) return { ok: true, value: data };
    // The function answers refusals and failures with { error: "a sentence for the creator" }.
    const response = (error as { context?: Response }).context;
    const answer = response && typeof response.json === 'function' ? await response.json().catch(() => null) : null;
    return { ok: false, message: typeof answer?.error === 'string' ? answer.error : fallback };
  } catch {
    return {
      ok: false,
      message: controller.signal.aborted ? 'Tavie took too long. Try again, or build it yourself.' : fallback,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function suggestPlan(
  goal: string,
  weeks: number,
  outline: string,
): Promise<AiResult<{ plan: SuggestedPlan; draft: boolean }>> {
  const result = await call(
    { mode: 'plan', goal, weeks, outline: outline.trim() },
    PLAN_WAIT_MS,
    "Tavie couldn't write a plan right now. Try again, or build it yourself.",
  );
  if (!result.ok) return result;
  // Checked again here, so the review screen can rely on the shape.
  const plan = cleanPlan(result.value.plan);
  if (!plan.milestones.length) return { ok: false, message: "Tavie couldn't write a plan this time. Try again." };
  return { ok: true, value: { plan, draft: result.value.draft !== false } };
}

export async function suggestTask(goal: string, milestone: string, sentence: string): Promise<AiResult<SuggestedTask>> {
  const result = await call(
    { mode: 'task', goal, milestone, sentence: sentence.trim() },
    TASK_WAIT_MS,
    "Tavie couldn't suggest this task right now. Fill it in below.",
  );
  if (!result.ok) return result;
  const task = cleanTask(result.value.task);
  return task
    ? { ok: true, value: task }
    : { ok: false, message: "Tavie couldn't suggest this task. Fill it in below." };
}

/** Saves the milestones and tasks the creator approved, all or nothing. The program stays a draft. */
export async function importPlan(programId: string, milestones: SuggestedMilestone[]): Promise<number> {
  // Never leave the save button spinning: give up after 30 seconds and let the screen check what happened.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMPORT_WAIT_MS);
  try {
    const { data, error } = await db()
      .rpc('import_plan', { program_id: programId, milestones })
      .abortSignal(controller.signal);
    if (error) throw error;
    return data as number;
  } finally {
    clearTimeout(timer);
  }
}
