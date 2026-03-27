import { describe, expect, it } from 'vitest';

import { getDefaultAuthenticatedHref, getProtectedRedirect } from './auth-routing';

describe('getProtectedRedirect', () => {
  it('waits for session hydration before redirecting protected routes', () => {
    expect(getProtectedRedirect({ authStatus: 'loading', group: 'tabs' })).toBeNull();
    expect(getProtectedRedirect({ authStatus: 'loading', group: 'auth' })).toBeNull();
  });

  it('redirects signed-out users away from tab routes', () => {
    expect(getProtectedRedirect({ authStatus: 'signed_out', group: 'tabs' })).toBe(
      '/(auth)/sign-in'
    );
  });

  it('redirects signed-in users away from auth routes', () => {
    expect(getProtectedRedirect({ authStatus: 'signed_in', group: 'auth' })).toBe('/(tabs)');
  });

  it('allows signed-out users to remain on auth routes', () => {
    expect(getProtectedRedirect({ authStatus: 'signed_out', group: 'auth' })).toBeNull();
  });
});

describe('getDefaultAuthenticatedHref', () => {
  it('sends signed-out users to the sign-in screen', () => {
    expect(getDefaultAuthenticatedHref('signed_out')).toBe('/(auth)/sign-in');
  });

  it('sends signed-in users to the app tabs', () => {
    expect(getDefaultAuthenticatedHref('signed_in')).toBe('/(tabs)');
  });
});
