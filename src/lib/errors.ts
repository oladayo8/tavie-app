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

/** Turns a database or network error into a short, friendly sentence. */
export function dataErrorMessage(error: { message?: string; code?: string } | null): string {
  if (!error) return 'Something went wrong. Please try again.';
  const msg = error.message?.toLowerCase() ?? '';
  if (msg.includes('network') || msg.includes('fetch')) {
    return "Can't reach Tavie. Check your connection and try again.";
  }
  if (error.code === '42501') return "You don't have access to that.";
  if (error.code === '23514') return 'Please check what you entered and try again.';
  return 'Something went wrong. Please try again.';
}
