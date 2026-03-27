import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { getDefaultAuthenticatedHref } from '@/features/auth/auth-routing';
import { useAuthSession } from '@/features/auth/auth-session';

export default function IndexScreen() {
  const { session } = useAuthSession();
  const defaultHref = getDefaultAuthenticatedHref({
    authStatus: session.status,
    householdStatus: session.household.status,
  });

  if (!defaultHref) {
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

  return <Redirect href={defaultHref} />;
}
