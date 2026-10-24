import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

/**
 * The signed-in person's own name and email. Each person can read and change only their own row
 * (row-level security), and only the name columns: never their id, email, or role.
 */

export type MyProfile = { first_name: string; last_name: string; email: string };

export const NAME_MAX = 60;

function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

/** A first name is required; a last name is optional. Both are trimmed and at most 60 characters. */
export function cleanName(first: string, last: string): { first_name: string; last_name: string } | null {
  const first_name = first.trim();
  const last_name = last.trim();
  if (!first_name || first_name.length > NAME_MAX || last_name.length > NAME_MAX) return null;
  return { first_name, last_name };
}

export function fullName(p: { first_name: string | null; last_name: string | null } | null): string {
  return p
    ? [p.first_name, p.last_name]
        .map((x) => x?.trim())
        .filter(Boolean)
        .join(' ')
    : '';
}

async function myId(): Promise<string> {
  const { data } = await db().auth.getUser();
  if (!data.user) throw new Error('Not signed in.');
  return data.user.id;
}

export async function getProfile(role: 'creator' | 'student'): Promise<MyProfile | null> {
  const { data, error } = await db()
    .from(role === 'creator' ? 'creators' : 'students')
    .select('first_name, last_name, email')
    .eq('id', await myId())
    .maybeSingle();
  if (error) throw error;
  return data ? { first_name: data.first_name ?? '', last_name: data.last_name ?? '', email: data.email } : null;
}

/** Saves the name. Students store an empty last name as null; creators' last name column is never null. */
export async function saveName(role: 'creator' | 'student', first: string, last: string): Promise<void> {
  const name = cleanName(first, last);
  if (!name) throw new Error('Add your first name.');
  const values = role === 'creator' ? name : { first_name: name.first_name, last_name: name.last_name || null };
  const { error } = await db()
    .from(role === 'creator' ? 'creators' : 'students')
    .update(values)
    .eq('id', await myId());
  if (error) throw error;
}
