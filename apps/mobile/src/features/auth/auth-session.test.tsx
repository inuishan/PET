import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();
const unsubscribeMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: unsubscribeMock,
          },
        },
      }),
    },
  }),
}));

import {
  AuthProvider,
  GOOGLE_SIGN_IN_PENDING_MESSAGE,
  getAuthSessionFromSupabaseSession,
  useAuthSession,
} from './auth-session';

describe('AuthProvider', () => {
  it('provides the initial loading state before session restoration completes', () => {
    let capturedSession: ReturnType<typeof useAuthSession> | null = null;

    function SessionReader() {
      capturedSession = useAuthSession();
      return createElement('div', null, capturedSession.session.status);
    }

    expect(() =>
      renderToStaticMarkup(createElement(AuthProvider, null, createElement(SessionReader)))
    ).not.toThrow();

    expect(capturedSession).not.toBeNull();
    expect(capturedSession?.session).toEqual({
      status: 'loading',
      userId: null,
    });
  });

  it('returns the placeholder Google sign-in result until OAuth is wired', async () => {
    let capturedSession: ReturnType<typeof useAuthSession> | null = null;

    function SessionReader() {
      capturedSession = useAuthSession();
      return createElement('div');
    }

    renderToStaticMarkup(createElement(AuthProvider, null, createElement(SessionReader)));

    await expect(capturedSession?.startGoogleSignIn()).resolves.toEqual({
      message: GOOGLE_SIGN_IN_PENDING_MESSAGE,
      ok: false,
    });
  });
});

describe('getAuthSessionFromSupabaseSession', () => {
  it('returns a signed-out session when Supabase has no active user', () => {
    expect(getAuthSessionFromSupabaseSession(null)).toEqual({
      status: 'signed_out',
      userId: null,
    });
  });

  it('returns a signed-in session when Supabase provides a user id', () => {
    expect(
      getAuthSessionFromSupabaseSession({
        user: {
          id: 'user-123',
        },
      })
    ).toEqual({
      status: 'signed_in',
      userId: 'user-123',
    });
  });
});

describe('useAuthSession', () => {
  it('throws when used outside the auth provider', () => {
    function SessionReader() {
      useAuthSession();
      return createElement('div');
    }

    expect(() => renderToStaticMarkup(createElement(SessionReader))).toThrow(
      'useAuthSession must be used within an AuthProvider'
    );
  });
});
