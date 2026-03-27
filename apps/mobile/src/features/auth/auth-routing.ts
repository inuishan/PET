import type { AuthStatus } from './auth-service';
import type { HouseholdStatus } from '@/features/household/household-session';

export type RouteGroup = 'auth' | 'onboarding' | 'tabs';
export type AppHref = '/(auth)/sign-in' | '/(onboarding)/household' | '/(tabs)';

type ProtectedRedirectInput = {
  authStatus: AuthStatus;
  group: RouteGroup;
  householdStatus: HouseholdStatus;
};

type DefaultHrefInput = {
  authStatus: AuthStatus;
  householdStatus: HouseholdStatus;
};

export function getProtectedRedirect({
  authStatus,
  group,
  householdStatus,
}: ProtectedRedirectInput): AppHref | null {
  if (authStatus === 'loading' || (authStatus === 'signed_in' && householdStatus === 'loading')) {
    return null;
  }

  if (authStatus === 'signed_out') {
    return group === 'auth' ? null : '/(auth)/sign-in';
  }

  if (householdStatus === 'needs_household') {
    return group === 'onboarding' ? null : '/(onboarding)/household';
  }

  return group === 'tabs' ? null : '/(tabs)';
}

export function getDefaultAuthenticatedHref({
  authStatus,
  householdStatus,
}: DefaultHrefInput): AppHref | null {
  if (authStatus === 'loading' || (authStatus === 'signed_in' && householdStatus === 'loading')) {
    return null;
  }

  if (authStatus === 'signed_out') {
    return '/(auth)/sign-in';
  }

  return householdStatus === 'ready' ? '/(tabs)' : '/(onboarding)/household';
}
