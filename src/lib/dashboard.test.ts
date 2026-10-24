import { describe, expect, it, jest } from '@jest/globals';

import {
  ago,
  attentionLine,
  daysSince,
  feedLine,
  initials,
  reportSummary,
  resolvedLine,
  studentLabel,
  trend,
} from '@/lib/dashboard';

jest.mock('@/lib/supabase', () => ({ supabase: null }));

const NOW = new Date('2026-10-24T12:00:00Z').getTime();
const before = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

describe('ago', () => {
  it('reads like a person would say it', () => {
    expect(ago(before(10_000), NOW)).toBe('just now');
    expect(ago(before(12 * MIN), NOW)).toBe('12 min ago');
    expect(ago(before(3 * 60 * MIN), NOW)).toBe('3 h ago');
    expect(ago(before(DAY + MIN), NOW)).toBe('yesterday');
    expect(ago(before(4 * DAY), NOW)).toBe('4 days ago');
  });
});

describe('attentionLine', () => {
  it('names the blocker reason, or how long they have been inactive', () => {
    expect(
      attentionLine(
        {
          attention: 'blocker',
          blocker: { reason: "I don't know how", note: null, reported_at: before(DAY) },
          last_activity_at: before(DAY),
        },
        NOW,
      ),
    ).toBe("Stuck: I don't know how");
    expect(attentionLine({ attention: 'inactive', blocker: null, last_activity_at: before(4 * DAY + MIN) }, NOW)).toBe(
      'No check-in for 4 days',
    );
    expect(attentionLine({ attention: null, blocker: null, last_activity_at: before(MIN) }, NOW)).toBeNull();
  });

  it('counts whole days', () => {
    expect(daysSince(before(3 * DAY - MIN), NOW)).toBe(2);
    expect(daysSince(before(3 * DAY), NOW)).toBe(3);
  });
});

describe('reportSummary and resolvedLine', () => {
  it('says what the student reported, not that it was verified', () => {
    expect(reportSummary({ kind: 'progress', value_number: 15, unit: 'calls' })).toBe('Logged 15 calls');
    expect(reportSummary({ kind: 'progress', value_number: 2, unit: null })).toBe('Logged 2');
    expect(reportSummary({ kind: 'complete', value_number: null, unit: null })).toBe('Marked done');
    expect(reportSummary({ kind: 'stuck', value_number: null, unit: null })).toBe('Reported stuck');
    expect(resolvedLine('unstuck')).toBe('They said they figured it out');
    expect(resolvedLine(null)).toBeNull();
  });
});

describe('names, trend, and feed lines', () => {
  it('uses the name the student gave and never makes one up from the email', () => {
    expect(studentLabel({ name: 'Jasmine King', email: 'jk@gmail.com' })).toBe('Jasmine King');
    expect(studentLabel({ name: null, email: 'jasmine.k@gmail.com' })).toBe('jasmine.k@gmail.com');
    expect(studentLabel({ name: '  ', email: 'jo@x.com' })).toBe('jo@x.com');
    expect(initials('Daniel Gbenle')).toBe('DG');
    expect(initials('Mary Ann Lee')).toBe('ML');
    expect(initials('Priya')).toBe('PR');
    expect(initials(null)).toBe('');
  });

  it('compares the last 24 hours only when there is something to compare', () => {
    expect(trend(142, 120)).toBe('+18% vs previous 24 h');
    expect(trend(5, 10)).toBe('-50% vs previous 24 h');
    expect(trend(3, 3)).toBe('Same as previous 24 h');
    expect(trend(4, 0)).toBeNull();
  });

  it('says what the student reported', () => {
    expect(
      feedLine({
        name: null,
        email: 'jo@x.com',
        kind: 'progress',
        value_number: 5,
        unit: 'calls',
        task_title: 'Call sellers',
      }),
    ).toBe('jo@x.com logged 5 calls');
    expect(
      feedLine({
        name: 'Jo',
        email: 'jo@x.com',
        kind: 'complete',
        value_number: null,
        unit: null,
        task_title: 'Watch the lesson',
      }),
    ).toBe('Jo finished Watch the lesson');
    expect(
      feedLine({
        name: 'Jo',
        email: 'jo@x.com',
        kind: 'stuck',
        value_number: null,
        unit: null,
        task_title: 'Call sellers',
      }),
    ).toBe('Jo is stuck on Call sellers');
  });
});
