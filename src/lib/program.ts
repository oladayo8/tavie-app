/**
 * Builder data shapes and the pure rules behind them. The database enforces the same limits
 * (supabase/migrations); these give the creator a plain message before a save is refused.
 */

import type { SuggestedTask } from '@/lib/plan-rules';

export type CompletionType = 'done' | 'count' | 'yes_no' | 'text';
export type ProgramStatus = 'draft' | 'live' | 'paused';
export type ResourceType = 'youtube' | 'link' | 'file';

export type Program = {
  id: string;
  title: string;
  goal: string;
  duration_weeks: number;
  slug: string;
  status: ProgramStatus;
  published_at: string | null;
  updated_at: string;
};

export type Milestone = {
  id: string;
  program_id: string;
  position: number;
  title: string;
  description: string | null;
  requires_review: boolean;
  archived_at: string | null;
};

export type Task = {
  id: string;
  milestone_id: string;
  position: number;
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
  archived_at: string | null;
};

export type Resource = {
  id: string;
  program_id: string;
  type: ResourceType;
  title: string;
  url: string | null;
  file_path: string | null;
};

export const LIMITS = {
  goal: { min: 3, max: 140 },
  weeks: { min: 1, max: 52 },
  milestoneTitle: 80,
  taskTitle: 120,
  why: 280,
  question: 140,
  unit: 20,
  minutes: { min: 1, max: 1440 },
  target: { min: 1, max: 10000 },
  followUpOptions: 4,
  followUpOptionsChars: 160,
  resourceTitle: 120,
  resourcesPerTask: 3,
  agentName: 40,
} as const;

export const REPORT_TYPES: { type: CompletionType; label: string; hint: string }[] = [
  { type: 'done', label: 'Just tap done', hint: 'They tap Mark done.' },
  { type: 'count', label: 'Tell me a number', hint: 'Done when their total reaches your target.' },
  { type: 'yes_no', label: 'Answer yes or no', hint: 'Done when they answer Yes.' },
  { type: 'text', label: 'Write a short answer', hint: 'Done when they write at least 10 characters.' },
];

/** The question Tavie pre-fills for each report type. The creator can change it. */
export function defaultQuestion(type: CompletionType, unit = ''): string {
  switch (type) {
    case 'count':
      return unit.trim() ? `How many ${unit.trim()} did you do?` : 'How many did you do?';
    case 'yes_no':
      return 'Did you do it?';
    case 'text':
      return 'What did you do?';
    default:
      return '';
  }
}

/** The student's main button on the Today card, worded by report type. */
export function studentButton(type: CompletionType, unit: string | null): string {
  switch (type) {
    case 'count':
      return unit?.trim() ? `Log ${unit.trim()}` : 'Log it';
    case 'yes_no':
      return 'Check in';
    case 'text':
      return 'Write my answer';
    default:
      return 'Mark done';
  }
}

/** What the task editor holds while typing. Numbers stay as text until saved. */
export type TaskDraft = {
  title: string;
  why: string;
  completion_type: CompletionType;
  check_in_question: string;
  target_count: string;
  unit: string;
  follow_up: 'none' | 'choices' | 'text';
  follow_up_question: string;
  follow_up_options: string[];
  est_minutes: string;
  is_optional: boolean;
  resource_ids: string[];
};

export function draftFromTask(task: Task | null, resourceIds: string[] = []): TaskDraft {
  return {
    title: task?.title ?? '',
    why: task?.why ?? '',
    completion_type: task?.completion_type ?? 'done',
    check_in_question: task?.check_in_question ?? '',
    target_count: task?.target_count ? String(task.target_count) : '',
    unit: task?.unit ?? '',
    follow_up: !task?.follow_up_question ? 'none' : task.follow_up_options ? 'choices' : 'text',
    follow_up_question: task?.follow_up_question ?? '',
    follow_up_options: task?.follow_up_options ?? [],
    est_minutes: String(task?.est_minutes ?? 30),
    is_optional: task?.is_optional ?? false,
    resource_ids: resourceIds,
  };
}

/** Fills the task editor from a suggestion. Resources the creator already picked stay. */
export function draftFromSuggestion(task: SuggestedTask, current: TaskDraft): TaskDraft {
  return {
    ...current,
    title: task.title,
    why: task.why ?? '',
    completion_type: task.completion_type,
    check_in_question: task.check_in_question ?? '',
    target_count: task.target_count ? String(task.target_count) : '',
    unit: task.unit ?? '',
    follow_up: !task.follow_up_question ? 'none' : task.follow_up_options ? 'choices' : 'text',
    follow_up_question: task.follow_up_question ?? '',
    follow_up_options: task.follow_up_options ?? [],
    est_minutes: String(task.est_minutes),
    is_optional: task.is_optional,
  };
}

function wholeNumber(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

export type FieldError = { field: keyof TaskDraft; message: string };

/** Problems that stop a task from saving. A missing "why" doesn't: it only blocks publishing. */
export function validateTaskDraft(d: TaskDraft): FieldError[] {
  const errors: FieldError[] = [];
  const title = d.title.trim();
  if (!title) errors.push({ field: 'title', message: 'Say what they should do.' });
  else if (title.length > LIMITS.taskTitle)
    errors.push({ field: 'title', message: `Keep it under ${LIMITS.taskTitle} characters.` });
  if (d.why.trim().length > LIMITS.why)
    errors.push({ field: 'why', message: `Keep it under ${LIMITS.why} characters.` });

  if (d.completion_type !== 'done' && d.check_in_question.trim().length > LIMITS.question) {
    errors.push({ field: 'check_in_question', message: `Keep it under ${LIMITS.question} characters.` });
  }
  if (d.completion_type === 'count') {
    const target = wholeNumber(d.target_count);
    if (target === null || target < LIMITS.target.min || target > LIMITS.target.max) {
      errors.push({ field: 'target_count', message: 'Set a target from 1 to 10,000.' });
    }
    if (d.unit.trim().length > LIMITS.unit)
      errors.push({ field: 'unit', message: `Keep it under ${LIMITS.unit} characters.` });
  }

  if (d.follow_up !== 'none') {
    const question = d.follow_up_question.trim();
    if (!question) errors.push({ field: 'follow_up_question', message: 'Write the follow-up question, or remove it.' });
    else if (question.length > LIMITS.question) {
      errors.push({ field: 'follow_up_question', message: `Keep it under ${LIMITS.question} characters.` });
    }
    if (d.follow_up === 'choices') {
      const options = cleanOptions(d.follow_up_options);
      if (options.length === 0) errors.push({ field: 'follow_up_options', message: 'Add at least one answer choice.' });
      else if (options.length > LIMITS.followUpOptions) {
        errors.push({ field: 'follow_up_options', message: `Use up to ${LIMITS.followUpOptions} choices.` });
      } else if (options.join('').length > LIMITS.followUpOptionsChars) {
        errors.push({ field: 'follow_up_options', message: 'Make the choices shorter.' });
      }
    }
  }

  const minutes = wholeNumber(d.est_minutes);
  if (minutes === null || minutes < LIMITS.minutes.min || minutes > LIMITS.minutes.max) {
    errors.push({ field: 'est_minutes', message: 'Use a number of minutes from 1 to 1440.' });
  }
  if (d.resource_ids.length > LIMITS.resourcesPerTask) {
    errors.push({ field: 'resource_ids', message: `Use up to ${LIMITS.resourcesPerTask} resources.` });
  }
  return errors;
}

function cleanOptions(options: string[]) {
  return options.map((o) => o.trim()).filter(Boolean);
}

function orNull(text: string) {
  return text.trim() || null;
}

/** The columns written for a task. Only call after validateTaskDraft returns no errors. */
export function taskFields(d: TaskDraft) {
  const counting = d.completion_type === 'count';
  return {
    title: d.title.trim(),
    why: orNull(d.why),
    completion_type: d.completion_type,
    check_in_question: d.completion_type === 'done' ? null : orNull(d.check_in_question),
    target_count: counting ? Number(d.target_count.trim()) : null,
    unit: counting ? orNull(d.unit) : null,
    follow_up_question: d.follow_up === 'none' ? null : orNull(d.follow_up_question),
    follow_up_options: d.follow_up === 'choices' ? cleanOptions(d.follow_up_options) : null,
    est_minutes: Number(d.est_minutes.trim()),
    is_optional: d.is_optional,
  };
}

/** What publishing would refuse about this task, in the same words as publish_program. */
export function taskWarnings(task: Pick<Task, 'why' | 'completion_type' | 'check_in_question'>): string[] {
  const warnings: string[] = [];
  if (!task.why?.trim()) warnings.push('Missing why');
  if (task.completion_type !== 'done' && !task.check_in_question?.trim()) warnings.push('Missing question');
  return warnings;
}

/** Everything publish_program would refuse, so the overview can show it before trying. */
export function programProblems(
  milestones: Pick<Milestone, 'id' | 'title' | 'archived_at'>[],
  tasks: Pick<Task, 'milestone_id' | 'title' | 'why' | 'completion_type' | 'check_in_question' | 'archived_at'>[],
  agentName: string | null,
): string[] {
  const problems: string[] = [];
  if (!agentName?.trim()) problems.push('Name your agent.');
  const active = milestones.filter((m) => !m.archived_at);
  if (active.length === 0) problems.push('Add at least one milestone.');
  for (const m of active) {
    const own = tasks.filter((t) => t.milestone_id === m.id && !t.archived_at);
    if (own.length === 0) problems.push(`Add a task to "${m.title}".`);
    for (const t of own) {
      if (!t.why?.trim()) problems.push(`Say why "${t.title}" matters.`);
      if (t.completion_type !== 'done' && !t.check_in_question?.trim()) {
        problems.push(`Add the check-in question for "${t.title}".`);
      }
    }
  }
  return problems;
}

/** Moves one id up (-1) or down (+1). Returns the same order when it can't move. */
export function moveId(ids: string[], index: number, delta: -1 | 1): string[] {
  const to = index + delta;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** The next free position after every existing row, archived ones included. */
export function nextPosition(rows: { position: number }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.position + 1), 0);
}

/** Sorts a link: YouTube, another https link, or not usable. */
export function classifyLink(url: string): 'youtube' | 'link' | null {
  const trimmed = url.trim();
  if (!/^https:\/\/\S+$/i.test(trimmed) || trimmed.length > 2048) return null;
  return /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(trimmed) ? 'youtube' : 'link';
}

/** Parses the goal and length screens. */
export function parseWeeks(text: string): number | null {
  const weeks = wholeNumber(text);
  return weeks !== null && weeks >= LIMITS.weeks.min && weeks <= LIMITS.weeks.max ? weeks : null;
}

export function goalIsValid(goal: string) {
  const length = goal.trim().length;
  return length >= LIMITS.goal.min && length <= LIMITS.goal.max;
}

export function suggestedAgentName(firstName: string) {
  return `${firstName.trim()}'s agent`.slice(0, LIMITS.agentName);
}

export function joinUrl(slug: string) {
  return `https://tavie.ai/j/${slug}`;
}
