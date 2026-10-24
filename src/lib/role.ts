import type { Arrival } from '@/lib/arrival';

/**
 * Which side of the app a signed-in person sees.
 * - `creator` / `student`: they have that row in the database.
 * - `needs-name`: they tapped "I'm a creator" but haven't registered yet.
 * - `student-needs-name`: a student who hasn't given their first name yet (new or existing).
 * - `none`: no role and no link, so they need their coach's link.
 */
export type Access = 'creator' | 'student' | 'student-needs-name' | 'needs-name' | 'none';

type Rows = {
  isCreator: boolean;
  isStudent: boolean;
  /** The student row has a first name. A student registered just now has none yet. */
  studentHasName?: boolean;
};

/**
 * Decides the screen from the database rows and how the person arrived.
 * The arrival only picks a side; it never grants anything. The database decides
 * what each side can read and write.
 */
export function resolveAccess(
  { isCreator, isStudent, studentHasName = false }: Rows,
  arrival: Arrival | null,
): {
  access: Access;
  registerStudent: boolean;
} {
  if (arrival?.role === 'creator') {
    return { access: isCreator ? 'creator' : 'needs-name', registerStudent: false };
  }
  // Students give their first name before anything else, so creators always see a real name.
  const student = isStudent && studentHasName ? 'student' : 'student-needs-name';
  if (arrival?.role === 'student') {
    return { access: student, registerStudent: !isStudent };
  }
  if (isCreator) return { access: 'creator', registerStudent: false };
  if (isStudent) return { access: student, registerStudent: false };
  return { access: 'none', registerStudent: false };
}
