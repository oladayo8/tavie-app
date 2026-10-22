/** Turns a Supabase auth error into a short, friendly sentence. */
export function authErrorMessage(error: { message?: string; status?: number; code?: string } | null): string {
  if (!error) return 'Something went wrong. Please try again.';
  const msg = error.message?.toLowerCase() ?? '';
  if (error.status === 429 || msg.includes('rate limit') || msg.includes('security purposes')) {
    return 'Too many tries. Wait a minute, then try again.';
  }
  if (msg.includes('expired') || msg.includes('invalid') || error.code === 'otp_expired') {
    return "That code didn't work. Check it, or send a new one.";
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return "Can't reach Tavie. Check your connection and try again.";
  }
  return error.message || 'Something went wrong. Please try again.';
}
