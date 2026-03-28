import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import {
  createLoadingHouseholdState,
  createNeedsHouseholdState,
  type HouseholdState,
} from '@/features/household/household-session';

WebBrowser.maybeCompleteAuthSession();

export const GOOGLE_SIGN_IN_CANCELLED_MESSAGE =
  'Google Sign-In was canceled before the session could be created.';
export const GOOGLE_SIGN_IN_MISSING_CODE_MESSAGE =
  'Google Sign-In completed without an authorization code.';
export const GOOGLE_SIGN_IN_MISSING_URL_MESSAGE =
  'Supabase did not return a Google Sign-In URL.';

export type AuthStatus = 'loading' | 'signed_in' | 'signed_out';

export type AppSession = {
  errorMessage: string | null;
  household: HouseholdState;
  status: AuthStatus;
  userEmail: string | null;
  userId: string | null;
};

export type SignInResult =
  | { ok: true }
  | {
      message: string;
      ok: false;
    };

type AuthSessionLike = {
  user: {
    email?: string | null;
    id: string;
  };
} | null;

type ErrorLike = {
  message: string;
} | null;

type GoogleOAuthResponse = Promise<{
  data: {
    url?: string | null;
  } | null;
  error: ErrorLike;
}>;

type ExchangeCodeResponse = Promise<{
  error: ErrorLike;
}>;
type SetSessionResponse = Promise<{
  error: ErrorLike;
}>;

type AuthSessionResult = Promise<AppSession>;
type ExchangeCodeForSession = (code: string) => ExchangeCodeResponse;
type SetSession = (input: {
  access_token: string;
  refresh_token: string;
}) => SetSessionResponse;

export type GoogleSignInDependencies = {
  createRedirectUrl?: () => string;
  exchangeCodeForSession: (code: string) => ExchangeCodeResponse;
  openAuthSession: (startUrl: string, returnUrl: string) => Promise<{
    type: 'cancel' | 'dismiss' | 'locked' | 'opened' | 'success';
    url?: string | null;
  }>;
  signInWithOAuth: (input: {
    options: {
      queryParams: Record<string, string>;
      redirectTo: string;
      skipBrowserRedirect: true;
    };
    provider: 'google';
  }) => GoogleOAuthResponse;
  setSession: SetSession;
};

export function createLoadingAppSession(): AppSession {
  return {
    errorMessage: null,
    household: createLoadingHouseholdState(),
    status: 'loading',
    userEmail: null,
    userId: null,
  };
}

export function createSignedOutAppSession(errorMessage: string | null = null): AppSession {
  return {
    errorMessage,
    household: createNeedsHouseholdState(),
    status: 'signed_out',
    userEmail: null,
    userId: null,
  };
}

export function createGoogleAuthRedirectUrl(createUrl: (path: string) => string = Linking.createURL) {
  return createUrl('/auth/callback');
}

export function extractGoogleAuthCode(authResultUrl: string) {
  return new URL(authResultUrl).searchParams.get('code');
}

export function extractGoogleAuthTokens(authResultUrl: string) {
  const hashParams = new URLSearchParams(new URL(authResultUrl).hash.replace(/^#/, ''));

  return {
    accessToken: hashParams.get('access_token'),
    refreshToken: hashParams.get('refresh_token'),
  };
}

export async function completeGoogleAuthCodeExchange(
  code: string | null | undefined,
  exchangeCodeForSession: ExchangeCodeForSession
): Promise<SignInResult> {
  if (!code) {
    return {
      message: GOOGLE_SIGN_IN_MISSING_CODE_MESSAGE,
      ok: false,
    };
  }

  const exchangeResponse = await exchangeCodeForSession(code);

  if (exchangeResponse.error) {
    return {
      message: exchangeResponse.error.message,
      ok: false,
    };
  }

  return { ok: true };
}

export async function completeGoogleAuthRedirectSession(
  authResultUrl: string,
  dependencies: {
    exchangeCodeForSession: ExchangeCodeForSession;
    setSession: SetSession;
  }
): Promise<SignInResult> {
  const code = extractGoogleAuthCode(authResultUrl);

  if (code) {
    return completeGoogleAuthCodeExchange(code, dependencies.exchangeCodeForSession);
  }

  const tokens = extractGoogleAuthTokens(authResultUrl);

  if (!tokens.accessToken || !tokens.refreshToken) {
    return {
      message: GOOGLE_SIGN_IN_MISSING_CODE_MESSAGE,
      ok: false,
    };
  }

  const sessionResponse = await dependencies.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  if (sessionResponse.error) {
    return {
      message: sessionResponse.error.message,
      ok: false,
    };
  }

  return { ok: true };
}

export async function buildAppSessionFromAuthSession(
  authSession: AuthSessionLike,
  loadHouseholdState: (userId: string) => Promise<HouseholdState>
): AuthSessionResult {
  if (!authSession) {
    return createSignedOutAppSession();
  }

  try {
    const household = await loadHouseholdState(authSession.user.id);

    return {
      errorMessage: null,
      household,
      status: 'signed_in',
      userEmail: authSession.user.email ?? null,
      userId: authSession.user.id,
    };
  } catch (error) {
    return {
      errorMessage: getErrorMessage(error),
      household: createNeedsHouseholdState(),
      status: 'signed_in',
      userEmail: authSession.user.email ?? null,
      userId: authSession.user.id,
    };
  }
}

export async function startGoogleOAuthSignIn(
  dependencies: GoogleSignInDependencies
): Promise<SignInResult> {
  const redirectTo = (dependencies.createRedirectUrl ?? createGoogleAuthRedirectUrl)();
  console.log('[auth-service] starting Google OAuth', { redirectTo });
  const { data, error } = await dependencies.signInWithOAuth({
    options: {
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
      redirectTo,
      skipBrowserRedirect: true,
    },
    provider: 'google',
  });

  if (error) {
    console.warn('[auth-service] signInWithOAuth failed', { message: error.message });
    return {
      message: error.message,
      ok: false,
    };
  }

  if (!data?.url) {
    console.warn('[auth-service] signInWithOAuth returned no URL');
    return {
      message: GOOGLE_SIGN_IN_MISSING_URL_MESSAGE,
      ok: false,
    };
  }

  const authSessionResult = await dependencies.openAuthSession(data.url, redirectTo);
  console.log('[auth-service] auth session result', {
    type: authSessionResult.type,
    url: authSessionResult.url ?? null,
  });

  if (authSessionResult.type !== 'success' || !authSessionResult.url) {
    return {
      message: GOOGLE_SIGN_IN_CANCELLED_MESSAGE,
      ok: false,
    };
  }

  return completeGoogleAuthRedirectSession(authSessionResult.url, {
    exchangeCodeForSession: dependencies.exchangeCodeForSession,
    setSession: dependencies.setSession,
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected authentication error occurred.';
}
