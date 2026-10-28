import { Directory, File, Paths } from 'expo-file-system';
import type { KvStore } from './persistent-kv';

/**
 * iOS/Android: one file per key in the app's document directory, so the
 * offline queue (unsynced cash sales) and the session survive the OS killing
 * the app. The sync API keeps the `KvStore` contract synchronous.
 */
const dir = new Directory(Paths.document, 'koukou-kv');

function fileFor(key: string): File {
  return new File(dir, `${encodeURIComponent(key)}.json`);
}

export const persistentKv: KvStore = {
  getItem(key) {
    try {
      const file = fileFor(key);
      return file.exists ? file.textSync() : null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = fileFor(key);
    if (!file.exists) file.create();
    file.write(value);
  },
  removeItem(key) {
    try {
      const file = fileFor(key);
      if (file.exists) file.delete();
    } catch {
      // Already gone: nothing to remove.
    }
  },
};
