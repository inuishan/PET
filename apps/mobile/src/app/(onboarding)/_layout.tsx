import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { getProtectedRedirect } from '@/features/auth/auth-routing';
import { useAuthSession } from '@/features/auth/auth-session';

export default function OnboardingLayout() {
  const { session } = useAuthSession();
  const isLoading =
    session.status === 'loading' || (session.status === 'signed_in' && session.household.status === 'loading');
  const redirectHref = getProtectedRedirect({
    authStatus: session.status,
    group: 'onboarding',
    householdStatus: session.household.status,
  });

  if (isLoading) {
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: '#f6f2ea',
          flex: 1,
          justifyContent: 'center',
        }}>
        <ActivityIndicator color="#182026" />
      </View>
    );
  }

  if (redirectHref) {
    return <Redirect href={redirectHref} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
