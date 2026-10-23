import { describe, expect, test } from '@jest/globals';

import type { CheckInResult, TodayCard, TodayTask } from '@/lib/student';
import { afterCheckIn, newRequestId } from '@/lib/today';

const task: TodayTask = {
  id: 't1',
  title: 'Call 50 sellers',
  why: 'Deals come from conversations.',
  est_minutes: 60,
  is_optional: false,
  completion_type: 'count',
  check_in_question: 'How many calls did you make?',
  target_count: 50,
  unit: 'calls',
  follow_up_question: null,
  follow_up_options: null,
  state: 'current',
  count_so_far: 0,
};

const card = (next: TodayTask | null): TodayCard => ({
  enrollment_id: 'e1',
  program: { title: 'Close a deal', goal: 'Close a deal', status: 'live' },
  creator: { first_name: 'Cara', last_name: 'Lane', agent_name: "Cara's agent" },
  progress: { done: 0, total: 3 },
  task: next,
});

const result = (state: CheckInResult['state'], next: TodayTask | null, extra = {}): CheckInResult => ({
  ok: true,
  state,
  today: card(next),
  ...extra,
});

describe('afterCheckIn', () => {
  test('a partial count shows the running total', () => {
    expect(afterCheckIn(result('in_progress', { ...task, count_so_far: 20, state: 'in_progress' }), task)).toBe(
      '20 of 50 calls logged. Keep going.',
    );
  });

  test('done, skipped, stuck, and stale each get their own line', () => {
    expect(afterCheckIn(result('done', null), task)).toBe('Done. Nice work.');
    expect(afterCheckIn(result('skipped', null), task)).toBe('Skipped.');
    expect(afterCheckIn(result('stuck', task), task)).toMatch(/stuck/);
    expect(afterCheckIn(result(undefined, task, { ok: false, stale: true }), task)).toMatch(/already updated/);
  });

  test('a "not yet" on another kind of task says it stays', () => {
    const yesNo = { ...task, completion_type: 'yes_no' as const, target_count: null, unit: null };
    expect(afterCheckIn(result('in_progress', yesNo), yesNo)).toMatch(/stays here/);
  });
});

describe('newRequestId', () => {
  test('makes a different version 4 UUID each time', () => {
    const a = newRequestId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newRequestId()).not.toBe(a);
  });
});
