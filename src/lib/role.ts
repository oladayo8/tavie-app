import type { Arrival } from '@/lib/arrival';

/**
 * Which side of the app a signed-in person sees.
 * - `creator` / `student`: they have that row in the database.
 * - `needs-name`: they tapped "I'm a creator" but haven't registered yet.
 * - `none`: no role and no link, so they need their coach's link.
 */
export type Access = 'creator' | 'student' | 'needs-name' | 'none';

type Rows = { isCreator: boolean; isStudent: boolean };

/**
 * Decides the screen from the database rows and how the person arrived.
 * The arrival only picks a side; it never grants anything. The database decides
 * what each side can read and write.
 */
export function resolveAccess({ isCreator, isStudent }: Rows, arrival: Arrival | null): {
  access: Access;
  registerStudent: boolean;
} {
  if (arrival?.role === 'creator') {
    return { access: isCreator ? 'creator' : 'needs-name', registerStudent: false };
  }
  if (arrival?.role === 'student') {
    return { access: 'student', registerStudent: !isStudent };
  }
  if (isCreator) return { access: 'creator', registerStudent: false };
  if (isStudent) return { access: 'student', registerStudent: false };
  return { access: 'none', registerStudent: false };
}
