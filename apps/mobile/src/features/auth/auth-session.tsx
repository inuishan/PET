import { createContext, PropsWithChildren, useContext, useState } from 'react';

import type { AuthStatus } from './auth-routing';

export const GOOGLE_SIGN_IN_PENDING_MESSAGE =
  'Google Sign-In is reserved for the next auth step. The app shell stays locked until Supabase OAuth is wired.';

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

type AuthContextValue = {
  session: AuthSession;
  startGoogleSignIn: () => Promise<SignInResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session] = useState<AuthSession>({
    status: 'signed_out',
    userId: null,
  });

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
