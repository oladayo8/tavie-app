import { describe, expect, it } from '@jest/globals';

import {
  classifyLink,
  defaultQuestion,
  draftFromSuggestion,
  draftFromTask,
  goalIsValid,
  moveId,
  nextPosition,
  parseWeeks,
  programProblems,
  studentButton,
  suggestedAgentName,
  taskFields,
  validateTaskDraft,
  type Task,
  type TaskDraft,
} from '@/lib/program';

const draft = (over: Partial<TaskDraft> = {}): TaskDraft => ({
  ...draftFromTask(null),
  title: 'Call 50 sellers',
  ...over,
});
const fields = (d: TaskDraft) => validateTaskDraft(d).map((e) => e.field);

describe('validateTaskDraft', () => {
  it('accepts a plain done task and lets "why" wait until publishing', () => {
    expect(validateTaskDraft(draft())).toEqual([]);
  });

  it('needs an action', () => {
    expect(fields(draft({ title: '  ' }))).toEqual(['title']);
  });

  it('refuses a number task without a target from 1 to 10,000', () => {
    expect(fields(draft({ completion_type: 'count', target_count: '' }))).toEqual(['target_count']);
    expect(fields(draft({ completion_type: 'count', target_count: '0' }))).toEqual(['target_count']);
    expect(fields(draft({ completion_type: 'count', target_count: '10001' }))).toEqual(['target_count']);
    expect(fields(draft({ completion_type: 'count', target_count: '50' }))).toEqual([]);
  });

  it('checks the follow-up question and its choices', () => {
    expect(fields(draft({ follow_up: 'choices', follow_up_question: '', follow_up_options: ['A'] }))).toEqual([
      'follow_up_question',
    ]);
    expect(
      fields(draft({ follow_up: 'choices', follow_up_question: 'How did it go?', follow_up_options: ['', ' '] })),
    ).toEqual(['follow_up_options']);
    expect(fields(draft({ follow_up: 'text', follow_up_question: 'How did it go?' }))).toEqual([]);
  });

  it('keeps minutes between 1 and 1440 and resources at 3 or fewer', () => {
    expect(fields(draft({ est_minutes: '0' }))).toEqual(['est_minutes']);
    expect(fields(draft({ est_minutes: '1441' }))).toEqual(['est_minutes']);
    expect(fields(draft({ resource_ids: ['a', 'b', 'c', 'd'] }))).toEqual(['resource_ids']);
  });
});

describe('taskFields', () => {
  it('drops fields that do not apply to the report type', () => {
    const row = taskFields(
      draft({ completion_type: 'done', check_in_question: 'left over', target_count: '50', unit: 'calls', why: ' ' }),
    );
    expect(row).toMatchObject({ check_in_question: null, target_count: null, unit: null, why: null });
  });

  it('saves a number task with its target, unit, and follow-up choices', () => {
    const row = taskFields(
      draft({
        completion_type: 'count',
        target_count: '50',
        unit: 'calls',
        check_in_question: 'How many calls did you make?',
        follow_up: 'choices',
        follow_up_question: 'How did it go?',
        follow_up_options: ['Wants to sell', ' ', 'Not motivated'],
        est_minutes: '90',
      }),
    );
    expect(row).toMatchObject({
      target_count: 50,
      unit: 'calls',
      follow_up_options: ['Wants to sell', 'Not motivated'],
      est_minutes: 90,
    });
  });

  it('round-trips a saved task through the editor', () => {
    const task = {
      id: 't',
      milestone_id: 'm',
      position: 0,
      archived_at: null,
      ...taskFields(
        draft({
          completion_type: 'yes_no',
          check_in_question: 'Did you?',
          follow_up: 'text',
          follow_up_question: 'Why?',
        }),
      ),
    } as Task;
    expect(draftFromTask(task, ['r1'])).toMatchObject({
      completion_type: 'yes_no',
      follow_up: 'text',
      resource_ids: ['r1'],
    });
  });
});

describe('wording', () => {
  it('pre-fills a question for each report type', () => {
    expect(defaultQuestion('done')).toBe('');
    expect(defaultQuestion('count', 'calls')).toBe('How many calls did you do?');
    expect(defaultQuestion('yes_no')).toBe('Did you do it?');
    expect(defaultQuestion('text')).toBe('What did you do?');
  });

  it('words the student button by report type', () => {
    expect(studentButton('done', null)).toBe('Mark done');
    expect(studentButton('count', 'calls')).toBe('Log calls');
    expect(studentButton('text', null)).toBe('Write my answer');
  });

  it('suggests an agent name that fits the 40 character limit', () => {
    expect(suggestedAgentName('Marcus')).toBe("Marcus's agent");
    expect(suggestedAgentName('A'.repeat(60)).length).toBe(40);
  });
});

describe('programProblems', () => {
  const m = (id: string, title: string) => ({ id, title, archived_at: null });
  const t = (milestone_id: string, over = {}) => ({
    milestone_id,
    title: 'Task',
    why: 'Because',
    completion_type: 'done' as const,
    check_in_question: null,
    archived_at: null,
    ...over,
  });

  it('matches what publish_program refuses', () => {
    expect(programProblems([], [], null)).toEqual(['Name your agent.', 'Add at least one milestone.']);
    expect(
      programProblems(
        [m('1', 'Find a market'), m('2', 'Make offers')],
        [t('1', { why: '', title: 'Pick a zip', completion_type: 'text' })],
        "Marcus's agent",
      ),
    ).toEqual([
      'Say why "Pick a zip" matters.',
      'Add the check-in question for "Pick a zip".',
      'Add a task to "Make offers".',
    ]);
  });

  it('ignores archived milestones and tasks', () => {
    expect(
      programProblems(
        [m('1', 'Kept'), { ...m('2', 'Gone'), archived_at: 'x' }],
        [t('1'), t('1', { why: '', archived_at: 'x' })],
        'Agent',
      ),
    ).toEqual([]);
  });
});

describe('helpers', () => {
  it('moves ids up and down within bounds', () => {
    expect(moveId(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveId(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('puts new rows after every existing position', () => {
    expect(nextPosition([])).toBe(0);
    expect(nextPosition([{ position: 0 }, { position: 4 }])).toBe(5);
  });

  it('accepts only https links and spots YouTube', () => {
    expect(classifyLink('https://youtu.be/abc')).toBe('youtube');
    expect(classifyLink('https://www.youtube.com/watch?v=abc')).toBe('youtube');
    expect(classifyLink('https://docs.google.com/x')).toBe('link');
    expect(classifyLink('http://example.com')).toBeNull();
    expect(classifyLink('javascript:alert(1)')).toBeNull();
  });

  it('validates goal and weeks', () => {
    expect(goalIsValid('Hi')).toBe(false);
    expect(goalIsValid('Close your first deal')).toBe(true);
    expect(parseWeeks('8')).toBe(8);
    expect(parseWeeks('0')).toBeNull();
    expect(parseWeeks('53')).toBeNull();
  });
});

describe('draftFromSuggestion', () => {
  const suggestion = {
    title: 'Call 50 sellers',
    why: 'Deals come from conversations.',
    completion_type: 'count' as const,
    check_in_question: 'How many calls did you make?',
    target_count: 50,
    unit: 'calls',
    follow_up_question: 'What got in the way?',
    follow_up_options: ['Nothing', 'No answers'],
    est_minutes: 90,
    is_optional: false,
  };

  it('fills every field the creator would type, and keeps chosen resources', () => {
    const draft = draftFromSuggestion(suggestion, { ...draftFromTask(null), resource_ids: ['r1'] });
    expect(draft).toMatchObject({
      title: 'Call 50 sellers',
      completion_type: 'count',
      target_count: '50',
      unit: 'calls',
      follow_up: 'choices',
      follow_up_options: ['Nothing', 'No answers'],
      est_minutes: '90',
      resource_ids: ['r1'],
    });
    expect(validateTaskDraft(draft)).toEqual([]);
  });

  it('maps a written follow-up and no follow-up', () => {
    expect(draftFromSuggestion({ ...suggestion, follow_up_options: null }, draftFromTask(null)).follow_up).toBe('text');
    expect(
      draftFromSuggestion({ ...suggestion, follow_up_question: null, follow_up_options: null }, draftFromTask(null))
        .follow_up,
    ).toBe('none');
  });
});
