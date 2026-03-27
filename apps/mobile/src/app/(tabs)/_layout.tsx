import { Redirect, Tabs } from 'expo-router';

import { getProtectedRedirect } from '@/features/auth/auth-routing';
import { useAuthSession } from '@/features/auth/auth-session';

export default function TabLayout() {
  const { session } = useAuthSession();
  const redirectHref = getProtectedRedirect({
    authStatus: session.status,
    group: 'tabs',
  });

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
