import { Redirect, Stack } from 'expo-router';

import { getProtectedRedirect } from '@/features/auth/auth-routing';
import { useAuthSession } from '@/features/auth/auth-session';

export default function AuthLayout() {
  const { session } = useAuthSession();
  const redirectHref = getProtectedRedirect({
    authStatus: session.status,
    group: 'auth',
  });

  if (redirectHref) {
    return <Redirect href={redirectHref} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
