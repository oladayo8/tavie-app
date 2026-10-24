import type { Access } from '@/lib/role';

/**
 * Which part of the app a person may open. The root layout guards every route group with this,
 * so a student can never reach the creator tabs (or the reverse) by typing a URL, and the
 * database still checks every read and write on its own.
 */
export type Area = 'signed-out' | 'creator' | 'needs-name' | 'student' | 'no-access';

export function areaFor(signedIn: boolean, access: Access | null): Area {
  if (!signedIn) return 'signed-out';
  switch (access) {
    case 'creator':
      return 'creator';
    case 'needs-name':
      return 'needs-name';
    case 'student':
      return 'student';
    default:
      return 'no-access';
  }
}

export type TabIconName = 'today' | 'path' | 'profile' | 'overview' | 'students' | 'programs';
export type TabSpec = { name: string; title: string; icon: TabIconName };

/** The student's three tabs, in order. `name` is the route file in src/app/student. */
export const STUDENT_TABS: readonly TabSpec[] = [
  { name: 'index', title: 'Today', icon: 'today' },
  { name: 'path', title: 'My Path', icon: 'path' },
  { name: 'profile', title: 'Profile', icon: 'profile' },
];

/** The creator's three tabs, in order. `name` is the route file in src/app/creator/(tabs). */
export const CREATOR_TABS: readonly TabSpec[] = [
  { name: 'index', title: 'Overview', icon: 'overview' },
  { name: 'students', title: 'Students', icon: 'students' },
  { name: 'programs', title: 'Programs', icon: 'programs' },
];
