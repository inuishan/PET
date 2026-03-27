import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';

type Mode = 'create' | 'join';

export default function HouseholdSetupScreen() {
  const { createHousehold, joinHousehold, session } = useAuthSession();
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [mode, setMode] = useState<Mode>('create');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handleSubmit() {
    setStatusMessage(null);

    const result =
      mode === 'create'
        ? await createHousehold({
            displayName,
            householdName,
          })
        : await joinHousehold({
            displayName,
            inviteCode,
          });

    if (!result.ok) {
      setStatusMessage(result.message);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Household Setup</Text>
      <Text style={styles.title}>Connect this login to the shared ledger</Text>
      <Text style={styles.description}>
        {session.userEmail
          ? `Signed in as ${session.userEmail}.`
          : 'Finish household setup before the dashboard unlocks.'}
      </Text>

      <View style={styles.modeRow}>
        <Pressable
          onPress={() => setMode('create')}
          style={[styles.modeButton, mode === 'create' ? styles.modeButtonActive : null]}>
          <Text style={[styles.modeButtonText, mode === 'create' ? styles.modeButtonTextActive : null]}>
            Create Household
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('join')}
          style={[styles.modeButton, mode === 'join' ? styles.modeButtonActive : null]}>
          <Text style={[styles.modeButtonText, mode === 'join' ? styles.modeButtonTextActive : null]}>
            Join With Code
          </Text>
        </Pressable>
      </View>

      <View style={styles.form}>
        <TextInput
          autoCapitalize="words"
          onChangeText={setDisplayName}
          placeholder="Your display name"
          placeholderTextColor="#8a8175"
          style={styles.input}
          value={displayName}
        />

        {mode === 'create' ? (
          <TextInput
            autoCapitalize="words"
            onChangeText={setHouseholdName}
            placeholder="Household name"
            placeholderTextColor="#8a8175"
            style={styles.input}
            value={householdName}
          />
        ) : (
          <TextInput
            autoCapitalize="characters"
            onChangeText={setInviteCode}
            placeholder="Invite code"
            placeholderTextColor="#8a8175"
            style={styles.input}
            value={inviteCode}
          />
        )}

        <Pressable onPress={handleSubmit} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>
            {mode === 'create' ? 'Create And Continue' : 'Join Household'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.helperText}>
        Owners receive an invite code in Settings after household creation. Phase 1 supports one
        shared household with two adult members.
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
    gap: 16,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  description: {
    color: '#4f5b66',
    fontSize: 16,
    lineHeight: 24,
  },
  eyebrow: {
    color: '#7a6e5d',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  form: {
    gap: 12,
    marginTop: 8,
  },
  helperText: {
    color: '#7a6e5d',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#fffaf2',
    borderColor: '#e7dcc9',
    borderRadius: 16,
    borderWidth: 1,
    color: '#182026',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  modeButton: {
    alignItems: 'center',
    borderColor: '#d1c2ab',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  modeButtonActive: {
    backgroundColor: '#182026',
    borderColor: '#182026',
  },
  modeButtonText: {
    color: '#182026',
    fontSize: 14,
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: '#f6f2ea',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 12,
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
  title: {
    color: '#182026',
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
  },
});
