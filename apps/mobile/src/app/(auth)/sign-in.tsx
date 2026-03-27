import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';

export default function SignInScreen() {
  const { startGoogleSignIn } = useAuthSession();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handleGooglePress() {
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
        Google Sign-In, shared household access, and statement ingestion arrive next. This screen is
        the auth shell for the Phase 1 build.
      </Text>

      <Pressable onPress={handleGooglePress} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Continue With Google</Text>
      </Pressable>

      <Text style={styles.helperText}>
        New Google sign-ins are still blocked, but previously saved Supabase sessions restore
        automatically.
      </Text>

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
