import * as SecureStore from 'expo-secure-store';

const AUTH_KEYCHAIN_SERVICE = 'expense-tracking.supabase.auth';

export const SECURE_STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: AUTH_KEYCHAIN_SERVICE,
};

type SecureStoreModule = Pick<
  typeof SecureStore,
  'deleteItemAsync' | 'getItemAsync' | 'setItemAsync'
>;

export function createSecureStoreStorage(secureStore: SecureStoreModule = SecureStore) {
  return {
    getItem(key: string) {
      return secureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
    },
    removeItem(key: string) {
      return secureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
    },
    setItem(key: string, value: string) {
      return secureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
    },
  };
}

export const secureStoreStorage = createSecureStoreStorage();
