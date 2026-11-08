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

/** Staging file of an atomic write (complete content, not yet moved into place). */
function tmpFor(key: string): File {
  return new File(dir, `${encodeURIComponent(key)}.json.tmp`);
}

export const persistentKv: KvStore = {
  getItem(key) {
    // A read error is thrown, not turned into "empty": the offline queue would
    // otherwise be overwritten by the next enqueue, losing unsynced cash.
    const file = fileFor(key);
    if (file.exists) return file.textSync();
    // Interrupted between the delete and the move of an atomic write: the
    // staged copy is complete (the target is only deleted once it is written).
    const staged = tmpFor(key);
    return staged.exists ? staged.textSync() : null;
  },
  setItem(key, value) {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    // Atomic: write the whole content to a staging file, then move it over the
    // target, so a kill mid-write never leaves a truncated queue.
    const staged = tmpFor(key);
    if (!staged.exists) staged.create();
    staged.write(value);
    const file = fileFor(key);
    if (file.exists) file.delete();
    staged.move(file);
  },
  removeItem(key) {
    try {
      const file = fileFor(key);
      if (file.exists) file.delete();
      const staged = tmpFor(key);
      if (staged.exists) staged.delete();
    } catch {
      // Already gone: nothing to remove.
    }
  },
};
