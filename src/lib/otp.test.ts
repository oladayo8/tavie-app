import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import { rateLimitSeconds, secondsUntilResend, sendCode } from '@/lib/otp';

function fakeClient(result: { error: unknown }) {
  const signInWithOtp = jest.fn(async () => result);
  return {
    client: { auth: { signInWithOtp } } as unknown as SupabaseClient,
    signInWithOtp,
  };
}

describe('rateLimitSeconds', () => {
  it('reads the wait from Supabase’s message', () => {
    expect(
      rateLimitSeconds({
        status: 429,
        message: 'For security purposes, you can only request this after 42 seconds.',
      }),
    ).toBe(42);
  });
  it('falls back to a minute when no wait is given', () => {
    expect(
      rateLimitSeconds({
        status: 429,
        code: 'over_email_send_rate_limit',
        message: 'Email rate limit exceeded',
      }),
    ).toBe(60);
  });
  it('ignores other errors', () => {
    expect(rateLimitSeconds({ status: 400, message: 'Invalid email' })).toBeNull();
  });
});

describe('sendCode', () => {
  it('waits a minute after a code is sent and does not call Supabase meanwhile', async () => {
    const { client, signInWithOtp } = fakeClient({ error: null });
    await sendCode(client, 'a@example.com', 0);
    expect(secondsUntilResend('a@example.com', 0)).toBe(60);
    expect((await sendCode(client, 'a@example.com', 30_000)).skipped).toBe(true);
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    await sendCode(client, 'a@example.com', 60_000);
    expect(signInWithOtp).toHaveBeenCalledTimes(2);
  });

  it('respects the wait Supabase asks for when rate-limited', async () => {
    const { client } = fakeClient({
      error: { status: 429, message: 'only request this after 42 seconds' },
    });
    await sendCode(client, 'b@example.com', 0);
    expect(secondsUntilResend('b@example.com', 0)).toBe(42);
  });

  it('lets someone retry right away after an unrelated error', async () => {
    const { client } = fakeClient({
      error: { status: 500, message: 'network' },
    });
    await sendCode(client, 'c@example.com', 0);
    expect(secondsUntilResend('c@example.com', 0)).toBe(0);
  });
});
