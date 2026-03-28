import { afterEach, describe, expect, it, vi } from 'vitest';

import { parsePublicEnv } from './env';

describe('parsePublicEnv', () => {
  it('returns the required public env values', () => {
    expect(
      parsePublicEnv({
        EXPO_PUBLIC_PHASE1_ALERT_PUSH_TOPIC_PREFIX: 'phase1-user',
        EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      })
    ).toEqual({
      phase1AlertPushTopicPrefix: 'phase1-user',
      supabaseAnonKey: 'anon-key',
      supabaseUrl: 'https://example.supabase.co',
    });
  });

  it('throws when the Supabase URL is missing', () => {
    expect(() =>
      parsePublicEnv({
        EXPO_PUBLIC_PHASE1_ALERT_PUSH_TOPIC_PREFIX: 'phase1-user',
        EXPO_PUBLIC_SUPABASE_URL: '',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      })
    ).toThrow('EXPO_PUBLIC_SUPABASE_URL');
  });

  it('throws when the anon key is missing', () => {
    expect(() =>
      parsePublicEnv({
        EXPO_PUBLIC_PHASE1_ALERT_PUSH_TOPIC_PREFIX: 'phase1-user',
        EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: '',
      })
    ).toThrow('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('throws when the Phase 1 alert topic prefix is missing', () => {
    expect(() =>
      parsePublicEnv({
        EXPO_PUBLIC_PHASE1_ALERT_PUSH_TOPIC_PREFIX: '',
        EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      })
    ).toThrow('EXPO_PUBLIC_PHASE1_ALERT_PUSH_TOPIC_PREFIX');
  });
});

describe('getPublicEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the required public env values from process.env', async () => {
    vi.stubEnv('EXPO_PUBLIC_PHASE1_ALERT_PUSH_TOPIC_PREFIX', 'phase1-user');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

    const { getPublicEnv } = await import('./env');

    expect(getPublicEnv()).toEqual({
      phase1AlertPushTopicPrefix: 'phase1-user',
      supabaseAnonKey: 'anon-key',
      supabaseUrl: 'https://example.supabase.co',
    });
  });
});
