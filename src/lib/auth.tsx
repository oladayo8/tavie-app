import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { clearArrival, getArrival } from '@/lib/arrival';
import { resolveAccess, type Access } from '@/lib/role';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  /** Null while signed out or loading. */
  access: Access | null;
  loading: boolean;
  /** True when the role lookup failed, usually a network problem. */
  failed: boolean;
};

type AuthContextValue = AuthState & {
  /** Looks the role up again, e.g. after registering as a creator. */
  refresh: () => Promise<void>;
};

const initial: AuthState = { session: null, access: null, loading: true, failed: false };

const AuthContext = createContext<AuthContextValue>({ ...initial, refresh: async () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

/** Reads the person's role from the creators and students tables, which only show their own row. */
async function lookUpAccess(client: SupabaseClient, session: Session): Promise<Access> {
  const uid = session.user.id;
  const [creator, student, arrival] = await Promise.all([
    client.from('creators').select('id').eq('id', uid).maybeSingle(),
    client.from('students').select('id').eq('id', uid).maybeSingle(),
    getArrival(),
  ]);
  if (creator.error) throw creator.error;
  if (student.error) throw student.error;

  const { access, registerStudent } = resolveAccess({ isCreator: !!creator.data, isStudent: !!student.data }, arrival);
  if (registerStudent) {
    const { error } = await client.rpc('register_student');
    if (error) throw error;
  }
  return access;
}

/**
 * Tracks the Supabase session and which side of the app the person may see.
 * The role comes from the database, never from user metadata, which users can edit.
 * Session and access are set together so route guards never see one without the other.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...initial, loading: !!supabase });
  const sessionRef = useRef<Session | null>(null);

  const apply = useCallback(async (session: Session | null) => {
    sessionRef.current = session;
    if (!supabase || !session) {
      setState({ session: null, access: null, loading: false, failed: false });
      return;
    }
    try {
      const access = await lookUpAccess(supabase, session);
      if (sessionRef.current === session) setState({ session, access, loading: false, failed: false });
    } catch {
      if (sessionRef.current === session) setState({ session, access: 'none', loading: false, failed: true });
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // A token refresh doesn't change who someone is, so keep the current role.
      if (event === 'TOKEN_REFRESHED' && session && sessionRef.current?.user.id === session.user.id) {
        sessionRef.current = session;
        return;
      }
      // Supabase warns against awaiting its calls inside this callback, so defer.
      setTimeout(() => apply(session), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [apply]);

  const refresh = useCallback(() => apply(sessionRef.current), [apply]);

  return <AuthContext.Provider value={{ ...state, refresh }}>{children}</AuthContext.Provider>;
}

/** Also forgets the join link, so the next person to sign in on this phone isn't enrolled from it. */
export async function signOut() {
  await clearArrival();
  await supabase?.auth.signOut();
}
