import { Redirect } from 'expo-router';

import { getDefaultAuthenticatedHref } from '@/features/auth/auth-routing';
import { useAuthSession } from '@/features/auth/auth-session';

export default function IndexScreen() {
  const { session } = useAuthSession();

  return <Redirect href={getDefaultAuthenticatedHref(session.status)} />;
}
