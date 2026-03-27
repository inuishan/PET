import { Redirect } from 'expo-router';

import { AuthLoadingScreen } from '@/features/auth/auth-loading-screen';
import { getDefaultAuthenticatedHref } from '@/features/auth/auth-routing';
import { useAuthSession } from '@/features/auth/auth-session';

export default function IndexScreen() {
  const { session } = useAuthSession();

  if (session.status === 'loading') {
    return <AuthLoadingScreen />;
  }

  return <Redirect href={getDefaultAuthenticatedHref(session.status)} />;
}
