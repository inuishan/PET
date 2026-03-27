import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';
import { createMockCoreProductState } from '@/features/core-product/core-product-state';
import { buildSettingsSnapshot } from '@/features/settings/settings-model';

export default function SettingsScreen() {
  const { session } = useAuthSession();
  const [productState, setProductState] = useState(() => createMockCoreProductState());
  const settingsSnapshot = buildSettingsSnapshot(productState);

  function toggleNotificationPreference(preferenceId: string) {
    setProductState((currentState) => ({
      ...currentState,
      notificationPreferences: currentState.notificationPreferences.map((preference) =>
        preference.id === preferenceId ? { ...preference, enabled: !preference.enabled } : preference
      ),
    }));
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.body}>
        Keep parser operations visible, tune categories, and decide how the household hears about
        ingestion trouble.
      </Text>

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
        <Text style={styles.cardBody}>
          Last successful sync. Last attempt was {settingsSnapshot.syncHealth.lastAttemptLabel} with{' '}
          {settingsSnapshot.syncHealth.pendingStatementCount} statement still waiting.
        </Text>
        {settingsSnapshot.syncHealth.lastError ? (
          <Text style={styles.errorText}>{settingsSnapshot.syncHealth.lastError}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Parser profiles</Text>
        {settingsSnapshot.parserProfiles.map((profile) => (
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
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Categories</Text>
        {settingsSnapshot.categories.map((category) => (
          <View key={category.id} style={styles.listRow}>
            <View style={styles.listMeta}>
              <Text style={styles.listTitle}>{category.name}</Text>
              <Text style={styles.listBody}>
                {category.transactionCount} transactions · {category.reviewCount} flagged
              </Text>
            </View>
            <Text style={styles.totalText}>₹{category.totalAmount.toLocaleString('en-IN')}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Notification preferences</Text>
        {settingsSnapshot.notificationPreferences.map((preference) => (
          <View key={preference.id} style={styles.listRow}>
            <View style={styles.listMeta}>
              <Text style={styles.listTitle}>{preference.label}</Text>
              <Text style={styles.listBody}>
                {preference.channel.toUpperCase()} · {preference.description}
              </Text>
            </View>
            <Switch
              onValueChange={() => toggleNotificationPreference(preference.id)}
              trackColor={{ false: '#d8c2a5', true: '#182026' }}
              value={preference.enabled}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
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
