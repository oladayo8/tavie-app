/**
 * The shape of an AI-suggested plan, and the clean-up applied to everything the model returns.
 * Shared by the `generate` Edge Function (Deno) and the app (through src/lib/plan-rules.ts), so it imports nothing.
 * The limits match the database's check rules, so a cleaned plan always saves.
 */

export type SuggestedTask = {
  title: string;
  why: string | null;
  completion_type: 'done' | 'count' | 'yes_no' | 'text';
  check_in_question: string | null;
  target_count: number | null;
  unit: string | null;
  follow_up_question: string | null;
  follow_up_options: string[] | null;
  est_minutes: number;
  is_optional: boolean;
};

export type SuggestedMilestone = { title: string; description: string | null; tasks: SuggestedTask[] };

export type SuggestedPlan = { milestones: SuggestedMilestone[] };

const TYPES = ['done', 'count', 'yes_no', 'text'] as const;

/** Limits on what the AI may suggest. import_plan enforces the same plan size. */
export const AI_LIMITS = { inputChars: 15000, milestones: 10, tasksPerMilestone: 5 } as const;

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

function whole(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Returns a task that satisfies every database rule, or null when there's nothing usable. */
export function cleanTask(raw: unknown): SuggestedTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = text(r.title, 120);
  if (!title) return null;

  let type = (TYPES as readonly unknown[]).includes(r.completion_type)
    ? (r.completion_type as SuggestedTask['completion_type'])
    : 'done';
  let target = type === 'count' ? whole(r.target_count, 1, 10000) : null;
  // A number task without a target can't be saved; asking yes or no keeps the intent.
  const countWithoutTarget = type === 'count' && target === null;
  if (countWithoutTarget) type = 'yes_no';
  if (type !== 'count') target = null;

  const question = type === 'done' ? null : countWithoutTarget ? 'Did you do it?' : text(r.check_in_question, 140);
  const followQuestion = text(r.follow_up_question, 140);
  let options = Array.isArray(r.follow_up_options)
    ? r.follow_up_options
        .map((o) => text(o, 40))
        .filter((o): o is string => !!o)
        .slice(0, 4)
    : null;
  if (options && (options.length === 0 || options.join('').length > 160)) options = null;
  if (!followQuestion) options = null;

  return {
    title,
    why: text(r.why, 280),
    completion_type: type,
    check_in_question: question,
    target_count: target,
    unit: type === 'count' ? text(r.unit, 20) : null,
    follow_up_question: followQuestion,
    follow_up_options: options,
    est_minutes: whole(r.est_minutes, 1, 1440) ?? 30,
    is_optional: r.is_optional === true,
  };
}

/** Keeps up to 10 milestones with up to 5 tasks each, dropping anything unusable. */
export function cleanPlan(raw: unknown): SuggestedPlan {
  const list = raw && typeof raw === 'object' ? (raw as { milestones?: unknown }).milestones : null;
  const milestones: SuggestedMilestone[] = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    const title = text(r.title, 80);
    if (!title) continue;
    const tasks = (Array.isArray(r.tasks) ? r.tasks : [])
      .map(cleanTask)
      .filter((t): t is SuggestedTask => !!t)
      .slice(0, AI_LIMITS.tasksPerMilestone);
    milestones.push({ title, description: text(r.description, 500), tasks });
    if (milestones.length === AI_LIMITS.milestones) break;
  }
  return { milestones };
}
