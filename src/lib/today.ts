import type { CheckInResult, TodayTask } from '@/lib/student';

/** Pure helpers for the student's Today screen. */

/** A random id for one check-in. Not a secret: it only has to be unique. */
export function newRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** What the student sees after a report that didn't finish the task. */
export function afterCheckIn(result: CheckInResult, taskBefore: TodayTask): string | null {
  if (result.stale) return 'This task was already updated. Here’s where you are.';
  switch (result.state) {
    case 'done':
      return 'Done. Nice work.';
    case 'skipped':
      return 'Skipped.';
    case 'stuck':
      return 'Got it. Your coach can see you’re stuck.';
    case 'in_progress': {
      const now = result.today.task;
      if (now && now.id === taskBefore.id && taskBefore.completion_type === 'count' && taskBefore.target_count) {
        return `${now.count_so_far} of ${taskBefore.target_count} ${taskBefore.unit ?? ''} logged. Keep going.`.replace(
          '  ',
          ' ',
        );
      }
      return 'Saved. This task stays here until it’s done.';
    }
    default:
      return null;
  }
}
