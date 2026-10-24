import { describe, expect, it } from '@jest/globals';

import { resolveAccess } from '@/lib/role';

const none = { isCreator: false, isStudent: false };
const creator = { isCreator: true, isStudent: false };
const student = { isCreator: false, isStudent: true, studentHasName: true };
const unnamed = { isCreator: false, isStudent: true, studentHasName: false };
const both = { isCreator: true, isStudent: true, studentHasName: true };

describe('resolveAccess', () => {
  it('never makes someone a creator just because they signed in', () => {
    expect(resolveAccess(none, null)).toEqual({ access: 'none', registerStudent: false });
  });

  it('asks for a name before someone who tapped "I\'m a creator" becomes one', () => {
    expect(resolveAccess(none, { role: 'creator' })).toEqual({ access: 'needs-name', registerStudent: false });
    expect(resolveAccess(student, { role: 'creator' })).toEqual({ access: 'needs-name', registerStudent: false });
  });

  it('opens the creator side only with a creators row', () => {
    expect(resolveAccess(creator, { role: 'creator' })).toEqual({ access: 'creator', registerStudent: false });
    expect(resolveAccess(creator, null)).toEqual({ access: 'creator', registerStudent: false });
  });

  it('registers a student who arrived by link, once, then asks their name', () => {
    expect(resolveAccess(none, { role: 'student', slug: 'marcus-reed' })).toEqual({
      access: 'student-needs-name',
      registerStudent: true,
    });
    expect(resolveAccess(student, { role: 'student', slug: 'marcus-reed' })).toEqual({
      access: 'student',
      registerStudent: false,
    });
  });

  it('lets the way someone arrived pick the side when they have both roles', () => {
    expect(resolveAccess(both, { role: 'student', slug: 'marcus-reed' }).access).toBe('student');
    expect(resolveAccess(both, { role: 'creator' }).access).toBe('creator');
    expect(resolveAccess(both, null).access).toBe('creator');
  });

  it('opens the student side for a returning student with no link', () => {
    expect(resolveAccess(student, null)).toEqual({ access: 'student', registerStudent: false });
  });

  it('asks an existing student without a first name for it before anything else', () => {
    expect(resolveAccess(unnamed, null)).toEqual({ access: 'student-needs-name', registerStudent: false });
    expect(resolveAccess(unnamed, { role: 'student', slug: 'marcus-reed' }).access).toBe('student-needs-name');
  });
});
