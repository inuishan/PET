import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStoreMock = {
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
};

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  deleteItemAsync: secureStoreMock.deleteItemAsync,
  getItemAsync: secureStoreMock.getItemAsync,
  setItemAsync: secureStoreMock.setItemAsync,
}));

describe('createSecureStoreStorage', () => {
  beforeEach(() => {
    secureStoreMock.deleteItemAsync.mockReset();
    secureStoreMock.getItemAsync.mockReset();
    secureStoreMock.setItemAsync.mockReset();
  });

  it('reads values from secure storage with the shared auth options', async () => {
    const { createSecureStoreStorage, SECURE_STORE_OPTIONS } = await import('./secure-store-storage');

    secureStoreMock.getItemAsync.mockResolvedValue('session-token');

    const storage = createSecureStoreStorage(secureStoreMock);

    await expect(storage.getItem('supabase.auth.token')).resolves.toBe('session-token');
    expect(secureStoreMock.getItemAsync).toHaveBeenCalledWith(
      'supabase.auth.token',
      SECURE_STORE_OPTIONS
    );
  });

  it('writes values to secure storage with the shared auth options', async () => {
    const { createSecureStoreStorage, SECURE_STORE_OPTIONS } = await import('./secure-store-storage');

    const storage = createSecureStoreStorage(secureStoreMock);

    await storage.setItem('supabase.auth.token', 'session-token');

    expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith(
      'supabase.auth.token',
      'session-token',
      SECURE_STORE_OPTIONS
    );
  });

  it('removes values from secure storage with the shared auth options', async () => {
    const { createSecureStoreStorage, SECURE_STORE_OPTIONS } = await import('./secure-store-storage');

    const storage = createSecureStoreStorage(secureStoreMock);

    await storage.removeItem('supabase.auth.token');

    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith(
      'supabase.auth.token',
      SECURE_STORE_OPTIONS
    );
  });
});
