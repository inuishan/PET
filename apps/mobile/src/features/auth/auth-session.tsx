import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';

import {
  buildAppSessionFromAuthSession,
  createLoadingAppSession,
  createSignedOutAppSession,
  type AppSession,
  type SignInResult,
  startGoogleOAuthSignIn,
} from './auth-service';
import { createHouseholdSetup, joinHouseholdSetup, loadHouseholdState } from '@/features/household/household-session';
import { getSupabaseClient } from '@/lib/supabase';

type HouseholdActionResult =
  | { ok: true }
  | {
      message: string;
      ok: false;
    };

type AuthContextValue = {
  createHousehold: (input: {
    displayName: string;
    householdName: string;
  }) => Promise<HouseholdActionResult>;
  joinHousehold: (input: {
    displayName: string;
    inviteCode: string;
  }) => Promise<HouseholdActionResult>;
  session: AppSession;
  startGoogleSignIn: () => Promise<SignInResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [supabase] = useState(() => getSupabaseClient());
  const [session, setSession] = useState<AppSession>(createLoadingAppSession());

  useEffect(() => {
    let isActive = true;

    async function restoreSession() {
      const sessionResponse = await supabase.auth.getSession();

      if (!isActive) {
        return;
      }

      if (sessionResponse.error) {
        setSession(createSignedOutAppSession(sessionResponse.error.message));
        return;
      }

      const nextSession = await buildAppSessionFromAuthSession(sessionResponse.data.session, (userId) =>
        loadHouseholdState(supabase, userId)
      );

      if (isActive) {
        setSession(nextSession);
      }
    }

    void restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void buildAppSessionFromAuthSession(nextSession, (userId) => loadHouseholdState(supabase, userId)).then(
        (restoredSession) => {
          if (isActive) {
            setSession(restoredSession);
          }
        }
      );
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function startGoogleSignIn(): Promise<SignInResult> {
    return startGoogleOAuthSignIn({
      exchangeCodeForSession: (code) => supabase.auth.exchangeCodeForSession(code),
      openAuthSession: (startUrl, returnUrl) => WebBrowser.openAuthSessionAsync(startUrl, returnUrl),
      signInWithOAuth: (input) => supabase.auth.signInWithOAuth(input),
    });
  }

  async function createHousehold(input: {
    displayName: string;
    householdName: string;
  }): Promise<HouseholdActionResult> {
    if (session.status !== 'signed_in') {
      return {
        message: 'Sign in before setting up a household.',
        ok: false,
      };
    }

    try {
      const nextHousehold = await createHouseholdSetup(supabase, input);

      setSession((currentSession) => ({
        errorMessage: null,
        household: nextHousehold,
        status: currentSession.status,
        userEmail: currentSession.userEmail,
        userId: currentSession.userId,
      }));

      return { ok: true };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : 'Unable to create the household.',
        ok: false,
      };
    }
  }

  async function joinHousehold(input: {
    displayName: string;
    inviteCode: string;
  }): Promise<HouseholdActionResult> {
    if (session.status !== 'signed_in') {
      return {
        message: 'Sign in before joining a household.',
        ok: false,
      };
    }

    try {
      const nextHousehold = await joinHouseholdSetup(supabase, input);

      setSession((currentSession) => ({
        errorMessage: null,
        household: nextHousehold,
        status: currentSession.status,
        userEmail: currentSession.userEmail,
        userId: currentSession.userId,
      }));

      return { ok: true };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : 'Unable to join the household.',
        ok: false,
      };
    }
  }

  return (
    <AuthContext.Provider
      value={{
        createHousehold,
        joinHousehold,
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
