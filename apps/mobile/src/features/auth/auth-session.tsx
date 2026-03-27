import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';

import { getSupabaseClient } from '@/lib/supabase';

import type { AuthStatus } from './auth-routing';

export const GOOGLE_SIGN_IN_PENDING_MESSAGE =
  'Google Sign-In is not wired yet. Saved Supabase sessions still restore automatically, but new OAuth sign-ins remain blocked until the mobile flow is connected.';

type SignInResult =
  | { ok: true }
  | {
      message: string;
      ok: false;
    };

type AuthSession = {
  status: AuthStatus;
  userId: string | null;
};

type SupabaseSessionSnapshot = {
  user: {
    id: string;
  } | null;
} | null;

type AuthContextValue = {
  session: AuthSession;
  startGoogleSignIn: () => Promise<SignInResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function getAuthSessionFromSupabaseSession(
  session: SupabaseSessionSnapshot
): AuthSession {
  if (session?.user?.id) {
    return {
      status: 'signed_in',
      userId: session.user.id,
    };
  }

  return {
    status: 'signed_out',
    userId: null,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession>({
    status: 'loading',
    userId: null,
  });

  useEffect(() => {
    let isMounted = true;
    const supabaseClient = getSupabaseClient();
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(getAuthSessionFromSupabaseSession(nextSession));
    });

    async function restoreSession() {
      const { data, error } = await supabaseClient.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error) {
        setSession({
          status: 'signed_out',
          userId: null,
        });
        return;
      }

      setSession(getAuthSessionFromSupabaseSession(data.session));
    }

    void restoreSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function startGoogleSignIn(): Promise<SignInResult> {
    return {
      message: GOOGLE_SIGN_IN_PENDING_MESSAGE,
      ok: false,
    };
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        startGoogleSignIn,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuthSession must be used within an AuthProvider');
  }

  return context;
}
