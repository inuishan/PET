import { StyleSheet, Text, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';

export default function SettingsScreen() {
  const { session } = useAuthSession();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.body}>
        Parser profiles, category taxonomy, and sync health controls will live here.
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fffaf2',
    gap: 12,
    padding: 24,
  },
  title: {
    color: '#182026',
    fontSize: 32,
    fontWeight: '800',
  },
  body: {
    color: '#4f5b66',
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: '#f5ede0',
    borderRadius: 20,
    gap: 8,
    marginTop: 8,
    padding: 20,
  },
  cardBody: {
    color: '#4f5b66',
    fontSize: 14,
    lineHeight: 22,
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
});
