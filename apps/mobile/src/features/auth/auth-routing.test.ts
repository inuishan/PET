import { describe, expect, it } from 'vitest';

import { getDefaultAuthenticatedHref, getProtectedRedirect } from './auth-routing';

describe('getProtectedRedirect', () => {
  it('keeps loading sessions on their current route until hydration finishes', () => {
    expect(
      getProtectedRedirect({
        authStatus: 'loading',
        group: 'auth',
        householdStatus: 'loading',
      })
    ).toBeNull();
  });

  it('redirects signed-out users away from tabs', () => {
    expect(
      getProtectedRedirect({
        authStatus: 'signed_out',
        group: 'tabs',
        householdStatus: 'needs_household',
      })
    ).toBe('/(auth)/sign-in');
  });

  it('redirects signed-in users without a household to onboarding', () => {
    expect(
      getProtectedRedirect({
        authStatus: 'signed_in',
        group: 'tabs',
        householdStatus: 'needs_household',
      })
    ).toBe('/(onboarding)/household');
  });

  it('allows signed-in users without a household to remain on onboarding', () => {
    expect(
      getProtectedRedirect({
        authStatus: 'signed_in',
        group: 'onboarding',
        householdStatus: 'needs_household',
      })
    ).toBeNull();
  });

  it('redirects fully-ready users away from auth routes', () => {
    expect(
      getProtectedRedirect({
        authStatus: 'signed_in',
        group: 'auth',
        householdStatus: 'ready',
      })
    ).toBe('/(tabs)');
  });
});

describe('getDefaultAuthenticatedHref', () => {
  it('sends signed-out users to the sign-in screen', () => {
    expect(
      getDefaultAuthenticatedHref({
        authStatus: 'signed_out',
        householdStatus: 'needs_household',
      })
    ).toBe('/(auth)/sign-in');
  });

  it('sends signed-in users without a household to onboarding', () => {
    expect(
      getDefaultAuthenticatedHref({
        authStatus: 'signed_in',
        householdStatus: 'needs_household',
      })
    ).toBe('/(onboarding)/household');
  });

  it('sends ready signed-in users to the app tabs', () => {
    expect(
      getDefaultAuthenticatedHref({
        authStatus: 'signed_in',
        householdStatus: 'ready',
      })
    ).toBe('/(tabs)');
  });
});
