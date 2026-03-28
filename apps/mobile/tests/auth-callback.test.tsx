import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mockUseAuthSession = vi.fn();
const mockUseLocalSearchParams = vi.fn();
const mockUseURL = vi.fn();

vi.mock('../src/features/auth/auth-service', () => ({
  completeGoogleAuthRedirectSession: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      exchangeCodeForSession: vi.fn(),
      setSession: vi.fn(),
    },
  }),
}));

vi.mock('expo-linking', () => ({
  useURL: () => mockUseURL(),
}));

vi.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => createElement('mock-redirect', { href }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

vi.mock('react-native', () => ({
  ActivityIndicator: () => createElement('mock-activity-indicator'),
  StyleSheet: {
    create: <T,>(styles: T) => styles,
  },
  View: ({ children }: { children?: unknown }) => createElement('mock-view', null, children),
}));

vi.mock('../src/features/auth/auth-session', () => ({
  useAuthSession: () => mockUseAuthSession(),
}));

import AuthCallbackScreen from '../src/app/auth/callback';

describe('AuthCallbackScreen', () => {
  it('redirects signed-out users back to the sign-in screen', () => {
    mockUseURL.mockReturnValue(null);
    mockUseLocalSearchParams.mockReturnValue({});
    mockUseAuthSession.mockReturnValue({
      session: {
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
      },
    });

    expect(renderToStaticMarkup(createElement(AuthCallbackScreen))).toContain(
      'href="/(auth)/sign-in"',
    );
  });

  it('redirects ready signed-in users into the app tabs', () => {
    mockUseURL.mockReturnValue(null);
    mockUseLocalSearchParams.mockReturnValue({});
    mockUseAuthSession.mockReturnValue({
      session: {
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
      },
    });

    expect(renderToStaticMarkup(createElement(AuthCallbackScreen))).toContain('href="/(tabs)"');
  });
});
