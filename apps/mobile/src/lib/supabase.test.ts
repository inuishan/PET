import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn(() => ({ mock: true }));
const secureStoreStorageMock = {
  getItem: vi.fn(),
  removeItem: vi.fn(),
  setItem: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

vi.mock('./secure-store-storage', () => ({
  secureStoreStorage: secureStoreStorageMock,
}));

vi.mock('react-native-url-polyfill/auto', () => ({}));

describe('createSupabaseClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    createClientMock.mockReset();
    createClientMock.mockImplementation(() => ({ mock: true }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates a Supabase client with persisted auth storage', async () => {
    const { createSupabaseClient } = await import('./supabase');

    createSupabaseClient({
      supabaseAnonKey: 'anon-key',
      supabaseUrl: 'https://example.supabase.co',
    });

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: true,
          persistSession: true,
          storage: secureStoreStorageMock,
        }),
      })
    );
  });

  it('memoizes the shared Supabase client instance', async () => {
    const sharedClient = { mock: 'shared-client' };

    createClientMock.mockReturnValue(sharedClient);
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

    const { getSupabaseClient } = await import('./supabase');

    expect(getSupabaseClient()).toBe(sharedClient);
    expect(getSupabaseClient()).toBe(sharedClient);
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });
});
