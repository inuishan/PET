import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  AuthProvider,
  GOOGLE_SIGN_IN_PENDING_MESSAGE,
  useAuthSession,
} from './auth-session';

describe('AuthProvider', () => {
  it('provides the default signed-out session state', () => {
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
      status: 'signed_out',
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
