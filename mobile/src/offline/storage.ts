import { persistentKv, type KvStore } from './persistent-kv';

const memory = new Map<string, string>();

function webStore(): KvStore | null {
  const g = globalThis as unknown as { localStorage?: KvStore };
  return g.localStorage ?? null;
}

/** Durable store: `localStorage` on web, document-dir files on native; null in tests. */
function durable(): KvStore | null {
  return webStore() ?? persistentKv;
}

/**
 * Clé/valeur : `localStorage` sur web, fichiers persistants sur natif (la file
 * hors-ligne survit à un redémarrage), mémoire en tests.
 */
export const storage: KvStore = {
  getItem(key) {
    const store = durable();
    if (store) return store.getItem(key);
    return memory.get(key) ?? null;
  },
  setItem(key, value) {
    const store = durable();
    if (store) store.setItem(key, value);
    else memory.set(key, value);
  },
  removeItem(key) {
    const store = durable();
    if (store) store.removeItem(key);
    else memory.delete(key);
  },
};
