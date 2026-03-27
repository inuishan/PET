import { describe, expect, it, vi } from 'vitest';

import {
  buildAppSessionFromAuthSession,
  createGoogleAuthRedirectUrl,
  createLoadingAppSession,
  createSignedOutAppSession,
  GOOGLE_SIGN_IN_CANCELLED_MESSAGE,
  GOOGLE_SIGN_IN_MISSING_CODE_MESSAGE,
  GOOGLE_SIGN_IN_MISSING_URL_MESSAGE,
  startGoogleOAuthSignIn,
} from './auth-service';

describe('createLoadingAppSession', () => {
  it('starts in a loading state while auth is restored', () => {
    expect(createLoadingAppSession()).toEqual({
      errorMessage: null,
      household: {
        displayName: null,
        householdId: null,
        householdName: null,
        inviteCode: null,
        inviteExpiresAt: null,
        role: null,
        status: 'loading',
      },
      status: 'loading',
      userEmail: null,
      userId: null,
    });
  });
});

describe('createSignedOutAppSession', () => {
  it('creates the default signed-out app state', () => {
    expect(createSignedOutAppSession()).toEqual({
      errorMessage: null,
      household: {
        displayName: null,
        householdId: null,
        householdName: null,
        inviteCode: null,
        inviteExpiresAt: null,
        role: null,
        status: 'needs_household',
      },
      status: 'signed_out',
      userEmail: null,
      userId: null,
    });
  });
});

describe('createGoogleAuthRedirectUrl', () => {
  it('builds the callback route used for Expo deep linking', () => {
    expect(createGoogleAuthRedirectUrl((path) => `mobile://${path}`)).toBe('mobile:///auth/callback');
  });
});

describe('buildAppSessionFromAuthSession', () => {
  it('returns a signed-out session when Supabase has no active session', async () => {
    await expect(
      buildAppSessionFromAuthSession(null, vi.fn().mockResolvedValue(undefined))
    ).resolves.toEqual(createSignedOutAppSession());
  });

  it('hydrates the signed-in household state after session restoration', async () => {
    const loadHouseholdState = vi.fn().mockResolvedValue({
      displayName: 'Ishan',
      householdId: '9f0e1cdb-31b6-44e2-a56e-0dd8303ff2b8',
      householdName: 'Sharma Household',
      inviteCode: 'AB12CD34EF56',
      inviteExpiresAt: '2026-04-03T10:00:00.000Z',
      role: 'owner',
      status: 'ready',
    });

    await expect(
      buildAppSessionFromAuthSession(
        {
          user: {
            email: 'ishan@example.com',
            id: '6d89bfa7-ec67-4ed7-b72f-4aa1fcd0e6e9',
          },
        },
        loadHouseholdState
      )
    ).resolves.toEqual({
      errorMessage: null,
      household: {
        displayName: 'Ishan',
        householdId: '9f0e1cdb-31b6-44e2-a56e-0dd8303ff2b8',
        householdName: 'Sharma Household',
        inviteCode: 'AB12CD34EF56',
        inviteExpiresAt: '2026-04-03T10:00:00.000Z',
        role: 'owner',
        status: 'ready',
      },
      status: 'signed_in',
      userEmail: 'ishan@example.com',
      userId: '6d89bfa7-ec67-4ed7-b72f-4aa1fcd0e6e9',
    });
  });

  it('keeps the user signed in and surfaces household bootstrap errors', async () => {
    await expect(
      buildAppSessionFromAuthSession(
        {
          user: {
            email: 'ishan@example.com',
            id: '6d89bfa7-ec67-4ed7-b72f-4aa1fcd0e6e9',
          },
        },
        vi.fn().mockRejectedValue(new Error('Unable to load household membership'))
      )
    ).resolves.toEqual({
      errorMessage: 'Unable to load household membership',
      household: {
        displayName: null,
        householdId: null,
        householdName: null,
        inviteCode: null,
        inviteExpiresAt: null,
        role: null,
        status: 'needs_household',
      },
      status: 'signed_in',
      userEmail: 'ishan@example.com',
      userId: '6d89bfa7-ec67-4ed7-b72f-4aa1fcd0e6e9',
    });
  });
});

describe('startGoogleOAuthSignIn', () => {
  it('starts the Supabase OAuth flow, opens the auth session, and exchanges the auth code', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: {
        url: 'https://supabase.example.com/auth?provider=google',
      },
      error: null,
    });
    const openAuthSession = vi.fn().mockResolvedValue({
      type: 'success',
      url: 'mobile://auth/callback?code=pkce-code',
    });
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      error: null,
    });

    await expect(
      startGoogleOAuthSignIn({
        createRedirectUrl: () => 'mobile://auth/callback',
        exchangeCodeForSession,
        openAuthSession,
        signInWithOAuth,
      })
    ).resolves.toEqual({ ok: true });

    expect(signInWithOAuth).toHaveBeenCalledWith({
      options: {
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        redirectTo: 'mobile://auth/callback',
        skipBrowserRedirect: true,
      },
      provider: 'google',
    });
    expect(openAuthSession).toHaveBeenCalledWith(
      'https://supabase.example.com/auth?provider=google',
      'mobile://auth/callback'
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
  });

  it('returns a clear error when Supabase does not return an auth URL', async () => {
    await expect(
      startGoogleOAuthSignIn({
        exchangeCodeForSession: vi.fn(),
        openAuthSession: vi.fn(),
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: {
            url: null,
          },
          error: null,
        }),
      })
    ).resolves.toEqual({
      message: GOOGLE_SIGN_IN_MISSING_URL_MESSAGE,
      ok: false,
    });
  });

  it('returns a cancellation message when the browser flow does not finish successfully', async () => {
    await expect(
      startGoogleOAuthSignIn({
        exchangeCodeForSession: vi.fn(),
        openAuthSession: vi.fn().mockResolvedValue({
          type: 'cancel',
          url: null,
        }),
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: {
            url: 'https://supabase.example.com/auth?provider=google',
          },
          error: null,
        }),
      })
    ).resolves.toEqual({
      message: GOOGLE_SIGN_IN_CANCELLED_MESSAGE,
      ok: false,
    });
  });

  it('fails when the callback URL does not include an authorization code', async () => {
    await expect(
      startGoogleOAuthSignIn({
        exchangeCodeForSession: vi.fn(),
        openAuthSession: vi.fn().mockResolvedValue({
          type: 'success',
          url: 'mobile://auth/callback',
        }),
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: {
            url: 'https://supabase.example.com/auth?provider=google',
          },
          error: null,
        }),
      })
    ).resolves.toEqual({
      message: GOOGLE_SIGN_IN_MISSING_CODE_MESSAGE,
      ok: false,
    });
  });
});
