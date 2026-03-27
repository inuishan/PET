export type AuthStatus = 'loading' | 'signed_in' | 'signed_out';
export type RouteGroup = 'auth' | 'tabs';

type ProtectedRedirectInput = {
  authStatus: AuthStatus;
  group: RouteGroup;
};

export function getProtectedRedirect({
  authStatus,
  group,
}: ProtectedRedirectInput): '/(auth)/sign-in' | '/(tabs)' | null {
  if (authStatus === 'loading') {
    return null;
  }

  if (authStatus === 'signed_out' && group === 'tabs') {
    return '/(auth)/sign-in';
  }

  if (authStatus === 'signed_in' && group === 'auth') {
    return '/(tabs)';
  }

  return null;
}

export function getDefaultAuthenticatedHref(
  authStatus: Exclude<AuthStatus, 'loading'>
): '/(auth)/sign-in' | '/(tabs)' {
  return authStatus === 'signed_in' ? '/(tabs)' : '/(auth)/sign-in';
}
