import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { getProtectedRedirect } from '@/features/auth/auth-routing';
import { useAuthSession } from '@/features/auth/auth-session';

export default function TabLayout() {
  const { session } = useAuthSession();
  const isLoading =
    session.status === 'loading' || (session.status === 'signed_in' && session.household.status === 'loading');
  const redirectHref = getProtectedRedirect({
    authStatus: session.status,
    group: 'tabs',
    householdStatus: session.household.status,
  });

  if (isLoading) {
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: '#fffaf2',
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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#182026',
        tabBarInactiveTintColor: '#7a6e5d',
        tabBarStyle: {
          backgroundColor: '#fffaf2',
          borderTopColor: '#e7dcc9',
        },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
