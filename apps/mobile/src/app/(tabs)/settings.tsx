import { type ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';
import type { SettingsNotificationType, SettingsSnapshot } from '@/features/settings/settings-model';
import {
  createNotificationPreferencesQueryKey,
  createSettingsQueryKey,
  loadNotificationPreferences,
  loadSettingsSnapshot,
  revokeApprovedParticipant,
  saveApprovedParticipant,
  saveNotificationPreference,
} from '@/features/settings/settings-service';
import { getSupabaseClient } from '@/lib/supabase';

const settingsIntro =
  'Keep parser operations visible, tune categories, and decide how the household hears about ingestion trouble.';

export default function SettingsScreen() {
  const { session } = useAuthSession();
  const [participantDisplayName, setParticipantDisplayName] = useState('');
  const [participantPhoneE164, setParticipantPhoneE164] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [supabase] = useState(() => getSupabaseClient());
  const queryClient = useQueryClient();
  const householdId =
    session.status === 'signed_in' && session.household.status === 'ready' ? session.household.householdId : null;
  const userId = session.status === 'signed_in' ? session.userId : null;
  const settingsQueryKey = createSettingsQueryKey(householdId, userId);
  const notificationPreferencesQueryKey = createNotificationPreferencesQueryKey(householdId, userId);
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
      previousNotificationPreferences:
        | Awaited<ReturnType<typeof loadNotificationPreferences>>
        | undefined;
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
      await queryClient.cancelQueries({ queryKey: notificationPreferencesQueryKey });
      const previousSettings = queryClient.getQueryData<SettingsSnapshot>(settingsQueryKey);
      const previousNotificationPreferences = queryClient.getQueryData<
        Awaited<ReturnType<typeof loadNotificationPreferences>>
      >(notificationPreferencesQueryKey);

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
      queryClient.setQueryData<
        Awaited<ReturnType<typeof loadNotificationPreferences>> | undefined
      >(notificationPreferencesQueryKey, (currentPreferences) => {
        if (!currentPreferences) {
          return currentPreferences;
        }

        return currentPreferences.map((preference) => {
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
        });
      });

      return {
        previousNotificationPreferences,
        previousSettings,
      };
    },
    onError: (_error, _variables, context) => {
      if (!context?.previousSettings) {
        if (context?.previousNotificationPreferences) {
          queryClient.setQueryData(notificationPreferencesQueryKey, context.previousNotificationPreferences);
        }

        return;
      }

      queryClient.setQueryData(settingsQueryKey, context.previousSettings);
      if (context.previousNotificationPreferences) {
        queryClient.setQueryData(notificationPreferencesQueryKey, context.previousNotificationPreferences);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      await queryClient.invalidateQueries({ queryKey: notificationPreferencesQueryKey });
    },
  });
  const saveApprovedParticipantMutation = useMutation({
    mutationFn: async () => {
      if (!householdId) {
        throw new Error('A ready household is required to approve participants.');
      }

      return saveApprovedParticipant(supabase, {
        displayName: participantDisplayName,
        householdId,
        memberId: selectedMemberId,
        phoneE164: participantPhoneE164,
      });
    },
    onSuccess: async () => {
      setParticipantDisplayName('');
      setParticipantPhoneE164('');
      setSelectedMemberId(null);
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
    },
  });
  const revokeApprovedParticipantMutation = useMutation({
    mutationFn: async (phoneE164: string) => {
      if (!householdId) {
        throw new Error('A ready household is required to revoke participants.');
      }

      return revokeApprovedParticipant(supabase, {
        householdId,
        phoneE164,
      });
    },
    onSuccess: async () => {
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
  const canManageParticipants = session.household.status === 'ready' && session.household.role === 'owner';

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

  function submitParticipantApproval() {
    if (
      saveApprovedParticipantMutation.isPending ||
      participantPhoneE164.trim().length === 0
    ) {
      return;
    }

    saveApprovedParticipantMutation.mutate();
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
        <View style={styles.sectionHeader}>
          <Text style={styles.cardLabel}>WhatsApp UPI source</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{settingsSnapshot.whatsappSource.status}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle}>{settingsSnapshot.whatsappSource.setupLabel}</Text>
        <Text style={styles.cardBody}>{settingsSnapshot.whatsappSource.healthBody}</Text>
        <View style={styles.listRow}>
          <View style={styles.listMeta}>
            <Text style={styles.listTitle}>Last approved capture</Text>
            <Text style={styles.listBody}>{settingsSnapshot.whatsappSource.lastCaptureLabel}</Text>
          </View>
          <Text style={styles.totalText}>{settingsSnapshot.whatsappSource.reviewCaptureCount} in review</Text>
        </View>
        <View style={styles.listRow}>
          <View style={styles.listMeta}>
            <Text style={styles.listTitle}>Acknowledgements</Text>
            <Text style={styles.listBody}>
              Optional replies remain off until the Phase 2E runtime path is configured.
            </Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{settingsSnapshot.whatsappSource.acknowledgementStatusLabel}</Text>
          </View>
        </View>
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
        <Text style={styles.cardLabel}>Approved participants</Text>
        {canManageParticipants ? (
          <View style={styles.formSection}>
            <TextInput
              autoCapitalize="words"
              onChangeText={setParticipantDisplayName}
              placeholder="Display name"
              placeholderTextColor="#8c7a65"
              style={styles.input}
              value={participantDisplayName}
            />
            <TextInput
              autoCapitalize="none"
              keyboardType="phone-pad"
              onChangeText={setParticipantPhoneE164}
              placeholder="+91..."
              placeholderTextColor="#8c7a65"
              style={styles.input}
              value={participantPhoneE164}
            />
            <View style={styles.chipRow}>
              {settingsSnapshot.householdMembers.map((member) => {
                const isActive = selectedMemberId === member.id;

                return (
                  <Pressable
                    key={member.id}
                    accessibilityRole="button"
                    onPress={() => setSelectedMemberId(isActive ? null : member.id)}
                    style={[styles.memberChip, isActive ? styles.memberChipActive : null]}>
                    <Text style={[styles.memberChipText, isActive ? styles.memberChipTextActive : null]}>
                      {member.displayName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={submitParticipantApproval}
              style={[
                styles.primaryButton,
                saveApprovedParticipantMutation.isPending ? styles.primaryButtonDisabled : null,
              ]}>
              <Text style={styles.primaryButtonText}>Approve participant</Text>
            </Pressable>
            {saveApprovedParticipantMutation.error instanceof Error ? (
              <Text style={styles.errorText}>{saveApprovedParticipantMutation.error.message}</Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.cardBody}>
            Only the household owner can approve or revoke WhatsApp participants for the Meta test number.
          </Text>
        )}
        {settingsSnapshot.whatsappParticipants.length > 0 ? (
          settingsSnapshot.whatsappParticipants.map((participant) => (
            <View key={participant.id} style={styles.listRow}>
              <View style={styles.listMeta}>
                <Text style={styles.listTitle}>{participant.displayName}</Text>
                <Text style={styles.listBody}>
                  {participant.phoneE164}
                  {participant.memberDisplayName ? ` · ${participant.memberDisplayName}` : ''}
                  {` · approved ${participant.approvedAtLabel}`}
                </Text>
              </View>
              {canManageParticipants ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => revokeApprovedParticipantMutation.mutate(participant.phoneE164)}
                  style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Revoke</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={styles.cardBody}>No approved WhatsApp participants have been added yet.</Text>
        )}
        {revokeApprovedParticipantMutation.error instanceof Error ? (
          <Text style={styles.errorText}>{revokeApprovedParticipantMutation.error.message}</Text>
        ) : null}
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  errorText: {
    color: '#8f3d1f',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },
  formSection: {
    gap: 10,
  },
  input: {
    backgroundColor: '#f4eadc',
    borderColor: '#e3ccb0',
    borderRadius: 16,
    borderWidth: 1,
    color: '#182026',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  memberChip: {
    backgroundColor: '#f4eadc',
    borderColor: '#e3ccb0',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  memberChipActive: {
    backgroundColor: '#182026',
    borderColor: '#182026',
  },
  memberChipText: {
    color: '#7b6448',
    fontSize: 13,
    fontWeight: '700',
  },
  memberChipTextActive: {
    color: '#fffaf2',
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
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#182026',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fffaf2',
    fontSize: 14,
    fontWeight: '700',
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
  secondaryButton: {
    borderColor: '#d8c2a5',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#7b6448',
    fontSize: 13,
    fontWeight: '700',
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
