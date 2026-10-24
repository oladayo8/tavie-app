/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { areaFor, CREATOR_TABS, STUDENT_TABS } from '@/lib/navigation';

const APP = join(__dirname, '..', 'app');

/** Every route file under src/app, as Expo Router names it ("creator/(tabs)", "student", "j/[slug]"). */
function routes(dir = APP): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    if (!/\.tsx$/.test(name) || name.endsWith('.test.tsx')) return [];
    return [relative(APP, full).replace(/\.tsx$/, '')];
  });
}

/** The <Stack.Screen name="..."> entries inside each <Stack.Protected guard={area === '...'}> block. */
function guardedScreens(): Record<string, string[]> {
  const source = readFileSync(join(APP, '_layout.tsx'), 'utf8');
  const blocks: Record<string, string[]> = {};
  for (const m of source.matchAll(/guard=\{area === '([a-z-]+)'\}>([\s\S]*?)<\/Stack\.Protected>/g)) {
    blocks[m[1]] = [...m[2].matchAll(/Stack\.Screen name="([^"]+)"/g)].map((x) => x[1]);
  }
  blocks.public = [
    ...source.replace(/<Stack\.Protected[\s\S]*?<\/Stack\.Protected>/g, '').matchAll(/Stack\.Screen name="([^"]+)"/g),
  ].map((x) => x[1]);
  return blocks;
}

describe('areaFor', () => {
  it('opens only the area the database gave this person', () => {
    expect(areaFor(false, null)).toBe('signed-out');
    expect(areaFor(false, 'creator')).toBe('signed-out');
    expect(areaFor(false, 'student')).toBe('signed-out');
    expect(areaFor(true, 'creator')).toBe('creator');
    expect(areaFor(true, 'student')).toBe('student');
    expect(areaFor(true, 'needs-name')).toBe('needs-name');
    expect(areaFor(true, 'student-needs-name')).toBe('student-name');
    expect(areaFor(true, 'none')).toBe('no-access');
    expect(areaFor(true, null)).toBe('no-access');
  });
});

describe('tabs', () => {
  it('students get Today, My Path, Profile; creators get Overview, Students, Programs', () => {
    expect(STUDENT_TABS.map((t) => t.title)).toEqual(['Today', 'My Path', 'Profile']);
    expect(CREATOR_TABS.map((t) => t.title)).toEqual(['Overview', 'Students', 'Programs']);
  });

  it('every tab opens a real screen file', () => {
    for (const t of STUDENT_TABS) expect(existsSync(join(APP, 'student', `${t.name}.tsx`))).toBe(true);
    for (const t of CREATOR_TABS) expect(existsSync(join(APP, 'creator', '(tabs)', `${t.name}.tsx`))).toBe(true);
  });
});

describe('route guards', () => {
  const guarded = guardedScreens();
  // Files inside a group with its own _layout are covered by the group's entry.
  const covers = (screen: string, route: string) =>
    route === screen || (route.startsWith(`${screen}/`) && existsSync(join(APP, screen, '_layout.tsx')));
  const areaOf = (route: string) =>
    Object.entries(guarded).find(([, screens]) => screens.some((s) => covers(s, route)))?.[0];

  it('every route is declared in the root layout, so none slips past the guards', () => {
    const missing = routes().filter((r) => !r.endsWith('_layout') && !areaOf(r));
    expect(missing).toEqual([]);
  });

  it('creator screens open only for creators, student screens only for students', () => {
    for (const r of routes().filter((x) => !x.endsWith('_layout'))) {
      if (r === 'creator/name') expect(areaOf(r)).toBe('needs-name');
      else if (r.startsWith('creator/')) expect(areaOf(r)).toBe('creator');
      if (r.startsWith('student/')) expect(areaOf(r)).toBe('student');
      if (r === 'student-name') expect(areaOf(r)).toBe('student-name');
    }
    expect(guarded.public).toEqual(['j/[slug]']);
  });
});
