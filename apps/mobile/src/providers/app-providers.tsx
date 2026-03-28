import { QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/features/auth/auth-session';
import { Phase1PushRegistrationBoundary } from '@/features/notifications/push-registration-boundary';
import { createAppQueryClient } from '@/lib/query-client';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => createAppQueryClient());

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Phase1PushRegistrationBoundary />
            {children}
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
