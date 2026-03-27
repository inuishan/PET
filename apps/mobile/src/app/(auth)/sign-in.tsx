import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';

export default function SignInScreen() {
  const { session, startGoogleSignIn } = useAuthSession();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const isHydrating = session.status === 'loading';

  async function handleGooglePress() {
    setStatusMessage(null);
    const result = await startGoogleSignIn();

    if (!result.ok) {
      setStatusMessage(result.message);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Phase 1 Foundation</Text>
      <Text style={styles.title}>Expense Tracking</Text>
      <Text style={styles.description}>
        Use Google Sign-In to restore your Supabase session, then connect to your shared household
        workspace before the dashboard unlocks.
      </Text>

      <Pressable disabled={isHydrating} onPress={handleGooglePress} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>
          {isHydrating ? 'Restoring Session...' : 'Continue With Google'}
        </Text>
      </Pressable>

      <Text style={styles.helperText}>
        Separate Google accounts map into one household, so every user signs in individually before
        joining the shared ledger.
      </Text>

      {session.errorMessage ? <Text style={styles.statusMessage}>{session.errorMessage}</Text> : null}
      {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f2ea',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  eyebrow: {
    color: '#7a6e5d',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#182026',
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 44,
  },
  description: {
    color: '#4f5b66',
    fontSize: 16,
    lineHeight: 24,
  },
  helperText: {
    color: '#7a6e5d',
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#182026',
    borderRadius: 16,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#f6f2ea',
    fontSize: 16,
    fontWeight: '700',
  },
  statusMessage: {
    color: '#9b3d2d',
    fontSize: 14,
    lineHeight: 20,
  },
});
