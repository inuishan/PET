import * as Linking from 'expo-linking';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getDefaultAuthenticatedHref } from '@/features/auth/auth-routing';
import { completeGoogleAuthRedirectSession, type SignInResult } from '@/features/auth/auth-service';
import { useAuthSession } from '@/features/auth/auth-session';
import { getSupabaseClient } from '@/lib/supabase';

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default function AuthCallbackScreen() {
  const { session } = useAuthSession();
  const [supabase] = useState(() => getSupabaseClient());
  const [exchangeResult, setExchangeResult] = useState<SignInResult | null>(null);
  const callbackUrl = Linking.useURL();
  const params = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();
  const code = readSearchParam(params.code);
  const providerError = readSearchParam(params.error_description) ?? readSearchParam(params.error);
  const redirectHref = getDefaultAuthenticatedHref({
    authStatus: session.status,
    householdStatus: session.household.status,
  });
  const isSessionHydrating =
    session.status === 'loading' || (session.status === 'signed_in' && session.household.status === 'loading');

  useEffect(() => {
    console.log('[auth-callback] route params', {
      callbackUrl,
      code,
      providerError,
      redirectHref,
      sessionStatus: session.status,
      householdStatus: session.household.status,
    });
  }, [callbackUrl, code, providerError, redirectHref, session.household.status, session.status]);

  useEffect(() => {
    let isActive = true;
    const authResultUrl = callbackUrl ?? (code ? `mobile://auth/callback?code=${encodeURIComponent(code)}` : null);

    if (!authResultUrl) {
      console.warn('[auth-callback] missing auth result URL');
      setExchangeResult(null);
      return () => {
        isActive = false;
      };
    }

    void completeGoogleAuthRedirectSession(authResultUrl, {
      exchangeCodeForSession: (nextCode) => supabase.auth.exchangeCodeForSession(nextCode),
      setSession: (input) => supabase.auth.setSession(input),
    })
      .then((result) => {
        console.log('[auth-callback] code exchange result', result);
        if (isActive) {
          setExchangeResult(result);
        }
      })
      .catch((error) => {
        console.warn('[auth-callback] code exchange threw', {
          message: error instanceof Error ? error.message : String(error),
        });
        if (isActive) {
          setExchangeResult({
            message: error instanceof Error ? error.message : 'Unable to finish Google Sign-In.',
            ok: false,
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [callbackUrl, code, supabase]);

  const hasAuthResult = Boolean(callbackUrl || code);
  const isAwaitingSessionActivation = exchangeResult?.ok === true && session.status === 'signed_out';

  if (hasAuthResult && (exchangeResult === null || isSessionHydrating || isAwaitingSessionActivation)) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#182026" />
      </View>
    );
  }

  if (redirectHref) {
    return <Redirect href={redirectHref} />;
  }

  if (providerError || (exchangeResult && !exchangeResult.ok)) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>{providerError ?? exchangeResult.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#182026" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#f6f2ea',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  message: {
    color: '#9b3d2d',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
});
