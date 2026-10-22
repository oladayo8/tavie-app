import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { getArrival, type Role } from '@/lib/arrival';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  role: Role | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, role: null, loading: true });

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Tracks the Supabase session and the user's role.
 * The role lives in user metadata; on first sign-in it comes from how the person arrived.
 * Session and role are set together so route guards never see one without the other.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, role: null, loading: !!supabase });

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;

    const apply = async (session: Session | null) => {
      if (!session) {
        if (active) setState({ session: null, role: null, loading: false });
        return;
      }
      let role = session.user.user_metadata?.role as Role | undefined;
      if (!role) {
        // Opening the app with no link only offers "I'm a creator", so that is the default.
        role = (await getArrival())?.role ?? 'creator';
        // Supabase warns against awaiting auth calls inside onAuthStateChange, so defer it.
        setTimeout(() => {
          client.auth.updateUser({ data: { role } });
        }, 0);
      }
      if (active) setState({ session, role, loading: false });
    };

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      apply(session);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export async function signOut() {
  await supabase?.auth.signOut();
}
