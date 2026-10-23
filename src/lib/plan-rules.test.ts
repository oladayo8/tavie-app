import { describe, expect, test } from '@jest/globals';

import { AI_LIMITS, cleanPlan, cleanTask } from '@/lib/plan-rules';

const good = {
  title: 'Call 50 sellers from your list',
  why: 'Deals come from conversations.',
  completion_type: 'count',
  check_in_question: 'How many sellers did you call?',
  target_count: 50,
  unit: 'calls',
  follow_up_question: 'What got in the way?',
  follow_up_options: ['Nothing', 'No answers', 'Ran out of time'],
  est_minutes: 120,
  is_optional: false,
};

describe('cleanTask', () => {
  test('keeps a good task as it is', () => {
    expect(cleanTask(good)).toEqual(good);
  });

  test('drops tasks with no title, and anything that is not an object', () => {
    expect(cleanTask({ ...good, title: '   ' })).toBeNull();
    expect(cleanTask('Call sellers')).toBeNull();
    expect(cleanTask(null)).toBeNull();
  });

  test('a number task with no target becomes a yes or no check-in', () => {
    const t = cleanTask({ ...good, target_count: null });
    expect(t).toMatchObject({
      completion_type: 'yes_no',
      target_count: null,
      unit: null,
      check_in_question: 'Did you do it?',
    });
  });

  test('only number tasks keep a target and unit, and done tasks have no question', () => {
    expect(cleanTask({ ...good, completion_type: 'text' })).toMatchObject({ target_count: null, unit: null });
    expect(cleanTask({ ...good, completion_type: 'done' })).toMatchObject({
      check_in_question: null,
      target_count: null,
    });
    expect(cleanTask({ ...good, completion_type: 'dance' })?.completion_type).toBe('done');
  });

  test('clamps numbers and long text to what the database accepts', () => {
    const t = cleanTask({ ...good, title: 'x'.repeat(500), target_count: 99999, est_minutes: 0, unit: 'u'.repeat(50) });
    expect(t?.title.length).toBe(120);
    expect(t?.target_count).toBe(10000);
    expect(t?.est_minutes).toBe(1);
    expect(t?.unit?.length).toBe(20);
    expect(cleanTask({ ...good, est_minutes: 'soon' })?.est_minutes).toBe(30);
  });

  test('keeps answer choices only with a follow-up question, up to 4 of 40 characters', () => {
    expect(cleanTask({ ...good, follow_up_question: null })?.follow_up_options).toBeNull();
    expect(cleanTask({ ...good, follow_up_options: ['a', 'b', 'c', 'd', 'e'] })?.follow_up_options).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    const long = cleanTask({ ...good, follow_up_options: ['x'.repeat(60), 'y'.repeat(40)] })?.follow_up_options;
    expect(long?.map((o) => o.length)).toEqual([40, 40]);
    expect(cleanTask({ ...good, follow_up_options: [] })?.follow_up_options).toBeNull();
  });

  test('is_optional is only true when the model says exactly true', () => {
    expect(cleanTask({ ...good, is_optional: 'yes' })?.is_optional).toBe(false);
  });
});

describe('cleanPlan', () => {
  test(`keeps up to ${AI_LIMITS.milestones} milestones with up to ${AI_LIMITS.tasksPerMilestone} tasks each`, () => {
    const raw = {
      milestones: Array.from({ length: 12 }, (_, i) => ({
        title: `Step ${i}`,
        description: 'd',
        tasks: Array.from({ length: 8 }, () => good),
      })),
    };
    const plan = cleanPlan(raw);
    expect(plan.milestones).toHaveLength(10);
    expect(plan.milestones.every((m) => m.tasks.length === 5)).toBe(true);
  });

  test('drops milestones with no title and unusable tasks, and survives junk', () => {
    const plan = cleanPlan({
      milestones: [
        { title: '', tasks: [good] },
        { title: 'Find sellers', tasks: [good, { title: '' }, 7] },
      ],
    });
    expect(plan.milestones).toEqual([{ title: 'Find sellers', description: null, tasks: [good] }]);
    expect(cleanPlan('nonsense').milestones).toEqual([]);
    expect(cleanPlan({ milestones: 'x' }).milestones).toEqual([]);
  });
});
