import { type ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';
import type { SettingsNotificationType, SettingsSnapshot } from '@/features/settings/settings-model';
import {
  createSettingsQueryKey,
  loadSettingsSnapshot,
  saveNotificationPreference,
} from '@/features/settings/settings-service';
import { getSupabaseClient } from '@/lib/supabase';

const settingsIntro =
  'Keep parser operations visible, tune categories, and decide how the household hears about ingestion trouble.';

export default function SettingsScreen() {
  const { session } = useAuthSession();
  const [supabase] = useState(() => getSupabaseClient());
  const queryClient = useQueryClient();
  const householdId =
    session.status === 'signed_in' && session.household.status === 'ready' ? session.household.householdId : null;
  const userId = session.status === 'signed_in' ? session.userId : null;
  const settingsQueryKey = createSettingsQueryKey(householdId, userId);
  const settingsQuery = useQuery({
    enabled: householdId !== null && userId !== null,
    queryFn: async () => {
      if (!householdId || !userId) {
        throw new Error('A ready household is required to load settings.');
      }

      return loadSettingsSnapshot(supabase, {
        householdId,
        userId,
      });
    },
    queryKey: settingsQueryKey,
  });
  const toggleNotificationPreferenceMutation = useMutation<
    Awaited<ReturnType<typeof saveNotificationPreference>>,
    Error,
    {
      channel: 'email' | 'push';
      enabled: boolean;
      notificationType: SettingsNotificationType;
    },
    {
      previousSettings: SettingsSnapshot | undefined;
    }
  >({
    mutationFn: (input: {
      channel: 'email' | 'push';
      enabled: boolean;
      notificationType: SettingsNotificationType;
    }) => {
      if (!householdId) {
        throw new Error('A ready household is required to update notification preferences.');
      }

      return saveNotificationPreference(supabase, {
        ...input,
        householdId,
      });
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKey });
      const previousSettings = queryClient.getQueryData<SettingsSnapshot>(settingsQueryKey);

      queryClient.setQueryData<SettingsSnapshot | undefined>(settingsQueryKey, (currentSettings) => {
        if (!currentSettings) {
          return currentSettings;
        }

        return {
          ...currentSettings,
          notificationPreferences: currentSettings.notificationPreferences.map((preference) => {
            if (
              preference.channel !== variables.channel ||
              preference.notificationType !== variables.notificationType
            ) {
              return preference;
            }

            return {
              ...preference,
              enabled: variables.enabled,
            };
          }),
        };
      });

      return {
        previousSettings,
      };
    },
    onError: (_error, _variables, context) => {
      if (!context?.previousSettings) {
        return;
      }

      queryClient.setQueryData(settingsQueryKey, context.previousSettings);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
    },
  });

  if (session.status === 'loading' || session.household.status === 'loading') {
    return (
      <SettingsFrame>
        <SettingsStatusCard
          body="Pulling the current household profile, sync state, and notification preferences."
          title="Loading settings"
        />
      </SettingsFrame>
    );
  }

  if (!householdId || !userId) {
    return (
      <SettingsFrame>
        <SettingsStatusCard
          body="Create or join a household before managing operational settings."
          title="Finish household setup"
        />
      </SettingsFrame>
    );
  }

  if (settingsQuery.isPending) {
    return (
      <SettingsFrame>
        <SettingsStatusCard
          body="Pulling the current household profile, sync state, and notification preferences."
          title="Loading settings"
        />
      </SettingsFrame>
    );
  }

  if (settingsQuery.isError) {
    return (
      <SettingsFrame>
        <SettingsStatusCard
          action={
            <Pressable accessibilityRole="button" onPress={() => void settingsQuery.refetch()} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          }
          body={
            settingsQuery.error instanceof Error
              ? settingsQuery.error.message
              : 'The settings view could not be loaded.'
          }
          title="Unable to load settings"
        />
      </SettingsFrame>
    );
  }

  if (!settingsQuery.data) {
    return null;
  }

  const settingsSnapshot = settingsQuery.data;

  function toggleNotificationPreference(preferenceId: string) {
    const preference = settingsSnapshot.notificationPreferences.find((currentPreference) => currentPreference.id === preferenceId);

    if (!preference || toggleNotificationPreferenceMutation.isPending) {
      return;
    }

    toggleNotificationPreferenceMutation.mutate({
      channel: preference.channel,
      enabled: !preference.enabled,
      notificationType: preference.notificationType,
    });
  }

  return (
    <SettingsFrame>

      {session.household.status === 'ready' ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Household</Text>
          <Text style={styles.cardTitle}>{session.household.householdName}</Text>
          <Text style={styles.cardBody}>
            {session.household.role === 'owner'
              ? 'Share the invite code below with the second household member.'
              : 'This account is already attached to the shared household workspace.'}
          </Text>

          {session.household.inviteCode ? (
            <View style={styles.inviteCodePill}>
              <Text style={styles.inviteCodeText}>{session.household.inviteCode}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.cardLabel}>Sync health</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{settingsSnapshot.syncHealth.status}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle}>{settingsSnapshot.syncHealth.lastSuccessfulSyncLabel}</Text>
        <Text style={styles.cardBody}>{describeSyncHealth(settingsSnapshot)}</Text>
        {settingsSnapshot.syncHealth.lastError ? (
          <Text style={styles.errorText}>{settingsSnapshot.syncHealth.lastError}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Parser profiles</Text>
        {settingsSnapshot.parserProfiles.length > 0 ? (
          settingsSnapshot.parserProfiles.map((profile) => (
            <View key={profile.id} style={styles.listRow}>
              <View style={styles.listMeta}>
                <Text style={styles.listTitle}>{profile.name}</Text>
                <Text style={styles.listBody}>
                  {profile.issuer} · {profile.successRate}% success rate
                </Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{profile.status.replace('_', ' ')}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.cardBody}>Parser profiles will appear after the household syncs its first statement.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Categories</Text>
        {settingsSnapshot.categories.length > 0 ? (
          settingsSnapshot.categories.map((category) => (
            <View key={category.id} style={styles.listRow}>
              <View style={styles.listMeta}>
                <Text style={styles.listTitle}>{category.name}</Text>
                <Text style={styles.listBody}>
                  {category.transactionCount} transactions · {category.reviewCount} flagged
                </Text>
              </View>
              <Text style={styles.totalText}>₹{category.totalAmount.toLocaleString('en-IN')}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.cardBody}>Category rollups will appear once transactions have been classified for this month.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Notification preferences</Text>
        {settingsSnapshot.notificationPreferences.length > 0 ? (
          settingsSnapshot.notificationPreferences.map((preference) => (
            <View key={preference.id} style={styles.listRow}>
              <View style={styles.listMeta}>
                <Text style={styles.listTitle}>{preference.label}</Text>
                <Text style={styles.listBody}>
                  {preference.channel.toUpperCase()} · {preference.description}
                </Text>
              </View>
              <Switch
                disabled={toggleNotificationPreferenceMutation.isPending}
                onValueChange={() => toggleNotificationPreference(preference.id)}
                trackColor={{ false: '#d8c2a5', true: '#182026' }}
                value={preference.enabled}
              />
            </View>
          ))
        ) : (
          <Text style={styles.cardBody}>No notification channels are configured for this account yet.</Text>
        )}
        {toggleNotificationPreferenceMutation.error instanceof Error ? (
          <Text style={styles.errorText}>{toggleNotificationPreferenceMutation.error.message}</Text>
        ) : null}
      </View>
    </SettingsFrame>
  );
}

function SettingsFrame({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.body}>{settingsIntro}</Text>
      {children}
    </ScrollView>
  );
}

function SettingsStatusCard({
  action,
  body,
  title,
}: {
  action?: ReactNode;
  body: string;
  title: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
      {action ?? null}
    </View>
  );
}

function describeSyncHealth(settingsSnapshot: SettingsSnapshot) {
  const { lastAttemptLabel, lastSuccessfulSyncLabel, pendingStatementCount, status } = settingsSnapshot.syncHealth;

  if (lastSuccessfulSyncLabel === 'No statements synced yet') {
    if (lastAttemptLabel === 'No sync attempts yet') {
      return 'No statements have been uploaded for this household yet.';
    }

    return `The latest sync attempt was ${lastAttemptLabel}. The first successful statement sync has not landed yet.`;
  }

  if (status === 'failing') {
    return `The latest successful sync was ${lastSuccessfulSyncLabel}, but a newer statement sync has failed and needs attention.`;
  }

  if (pendingStatementCount > 0) {
    return `Last attempt was ${lastAttemptLabel} with ${pendingStatementCount} statement still waiting for parser recovery.`;
  }

  return `Last attempt was ${lastAttemptLabel}. The statement pipeline is clear for this household.`;
}

const styles = StyleSheet.create({
  body: {
    color: '#5d5346',
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#fffaf2',
    borderColor: '#ead5b9',
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    padding: 20,
  },
  cardBody: {
    color: '#5d5346',
    fontSize: 14,
    lineHeight: 21,
  },
  cardLabel: {
    color: '#7a6e5d',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: '#182026',
    fontSize: 24,
    fontWeight: '700',
  },
  content: {
    backgroundColor: '#f4eadc',
    gap: 18,
    padding: 20,
    paddingBottom: 36,
  },
  errorText: {
    color: '#8f3d1f',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },
  inviteCodePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#182026',
    borderRadius: 999,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inviteCodeText: {
    color: '#fffaf2',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  listBody: {
    color: '#7b6448',
    fontSize: 13,
    lineHeight: 20,
  },
  listMeta: {
    flex: 1,
    gap: 3,
  },
  listRow: {
    alignItems: 'center',
    borderTopColor: '#f0e4d1',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  listTitle: {
    color: '#182026',
    fontSize: 15,
    fontWeight: '700',
  },
  pill: {
    backgroundColor: '#efe1cc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillText: {
    color: '#7b6448',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#182026',
    borderRadius: 999,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#fffaf2',
    fontSize: 14,
    fontWeight: '700',
  },
  screen: {
    backgroundColor: '#f4eadc',
    flex: 1,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: '#182026',
    fontSize: 32,
    fontWeight: '800',
  },
  totalText: {
    color: '#182026',
    fontSize: 15,
    fontWeight: '800',
  },
});
