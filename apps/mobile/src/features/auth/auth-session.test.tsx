import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuthProvider, useAuthSession } from './auth-session';

describe('AuthProvider', () => {
  it('provides the initial loading session state before the client restores auth', () => {
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
