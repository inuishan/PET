import { describe, expect, it } from 'vitest';

import { parsePublicEnv } from './env';

describe('parsePublicEnv', () => {
  it('returns the required public env values', () => {
    expect(
      parsePublicEnv({
        EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      })
    ).toEqual({
      supabaseAnonKey: 'anon-key',
      supabaseUrl: 'https://example.supabase.co',
    });
  });

  it('throws when the Supabase URL is missing', () => {
    expect(() =>
      parsePublicEnv({
        EXPO_PUBLIC_SUPABASE_URL: '',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      })
    ).toThrow('EXPO_PUBLIC_SUPABASE_URL');
  });

  it('throws when the anon key is missing', () => {
    expect(() =>
      parsePublicEnv({
        EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: '',
      })
    ).toThrow('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  });
});
