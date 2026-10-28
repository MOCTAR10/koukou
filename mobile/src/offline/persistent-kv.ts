/** Synchronous key/value store that survives an app restart. */
export interface KvStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Web and unit tests (node): no disk store here. Web uses `localStorage`
 * instead; tests use an in-memory map. iOS/Android resolve
 * `persistent-kv.native.ts` (Metro platform extension) instead of this file.
 */
export const persistentKv: KvStore | null = null;
