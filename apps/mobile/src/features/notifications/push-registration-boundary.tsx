import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';
import {
  createNotificationPreferencesQueryKey,
  loadNotificationPreferences,
} from '@/features/settings/settings-service';
import {
  resetLivePhase1PushRegistration,
  syncLivePhase1PushRegistration,
} from '@/features/notifications/push-registration';
import { getPublicEnv } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';

export function Phase1PushRegistrationBoundary() {
  const { session } = useAuthSession();
  const [supabase] = useState(() => getSupabaseClient());
  const [env] = useState(() => getPublicEnv());
  const platformOs = Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';
  const householdId =
    session.status === 'signed_in' && session.household.status === 'ready' ? session.household.householdId : null;
  const userId = session.status === 'signed_in' ? session.userId : null;
  const notificationPreferencesQuery = useQuery({
    enabled: platformOs !== 'web' && householdId !== null && userId !== null,
    queryFn: async () => {
      if (!householdId || !userId) {
        throw new Error('A ready household is required to load push preferences.');
      }

      return loadNotificationPreferences(supabase, {
        householdId,
        userId,
      });
    },
    queryKey: createNotificationPreferencesQueryKey(householdId, userId),
  });

  useEffect(() => {
    if (platformOs === 'web' || session.status === 'loading' || session.household.status === 'loading') {
      return;
    }

    if (session.status !== 'signed_in' || session.household.status !== 'ready' || !userId) {
      void resetLivePhase1PushRegistration().catch((error) => {
        console.warn('Phase 1 push cleanup failed', error);
      });
      return;
    }

    if (!notificationPreferencesQuery.data) {
      return;
    }

    let cancelled = false;

    void syncLivePhase1PushRegistration({
      notificationPreferences: notificationPreferencesQuery.data,
      platformOs,
      pushTopicPrefix: env.phase1AlertPushTopicPrefix,
      userId,
    }).catch((error) => {
      if (!cancelled) {
        console.warn('Phase 1 push registration failed', error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    env.phase1AlertPushTopicPrefix,
    notificationPreferencesQuery.data,
    platformOs,
    session.household.status,
    session.status,
    userId,
  ]);

  return null;
}
