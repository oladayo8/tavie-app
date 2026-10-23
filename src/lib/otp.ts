import type { SupabaseClient } from '@supabase/supabase-js';

/** Codes are six digits. Set the same length in Supabase (Authentication > Sign In / Providers > Email). */
export const CODE_LENGTH = 6;

/** Supabase lets one email ask for a new code once a minute. */
const COOLDOWN_SECONDS = 60;

const nextAllowed = new Map<string, number>();
const sent = new Set<string>();

/** True once a code has reached this email during this app session. */
export function hasSentCode(email: string) {
  return sent.has(email);
}

/** Seconds until this email may ask for another code. 0 means now. */
export function secondsUntilResend(email: string, now = Date.now()): number {
  return Math.max(0, Math.ceil(((nextAllowed.get(email) ?? 0) - now) / 1000));
}

/** Reads the wait from a rate-limit error, e.g. "you can only request this after 42 seconds". */
export function rateLimitSeconds(error: { message?: string; status?: number; code?: string }): number | null {
  const msg = error.message?.toLowerCase() ?? '';
  const limited =
    error.status === 429 ||
    error.code?.includes('rate_limit') ||
    msg.includes('rate limit') ||
    msg.includes('security purposes');
  if (!limited) return null;
  const seconds = msg.match(/(\d+)\s*seconds?/);
  return seconds ? Number(seconds[1]) : COOLDOWN_SECONDS;
}

/**
 * Emails a six-digit code. Never calls Supabase while this email is still waiting,
 * so repeated taps can't extend a rate limit.
 */
export async function sendCode(client: SupabaseClient, email: string, now = Date.now()) {
  if (secondsUntilResend(email, now) > 0) return { error: null, skipped: true };
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  const wait = error ? rateLimitSeconds(error) : COOLDOWN_SECONDS;
  if (!error) sent.add(email);
  if (wait) nextAllowed.set(email, now + wait * 1000);
  return { error, skipped: false };
}
