import * as SecureStore from 'expo-secure-store';
import type { SecureTokenStore } from './secure-token';

const KEY = 'koukou.token';

/**
 * iOS Keychain / Android Keystore. The sync API keeps `loadSession()`
 * synchronous (it is read on every request). There is no sync delete, so
 * `remove()` blanks the value. Not deleteItemAsync: it could land after a
 * quick re-login and wipe the new token.
 */
export const secureToken: SecureTokenStore = {
  get() {
    try {
      return SecureStore.getItem(KEY) || null;
    } catch {
      // Unreadable (e.g. Android backup restored without its Keystore key).
      return null;
    }
  },
  set(token) {
    SecureStore.setItem(KEY, token);
  },
  remove() {
    try {
      SecureStore.setItem(KEY, '');
    } catch {
      // Nothing readable to blank.
    }
  },
};
