import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    createClientMock.mockClear();
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
});
