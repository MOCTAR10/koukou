// Last server answer of every GET, per account, in IndexedDB. Pages keep working
// from it with no connection. Reached only through api.get (see api/client.ts).
const DB_NAME = 'koukou-offline';
const STORE = 'responses';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

export interface CachedResponse {
  data: unknown;
  savedAt: number;
}

interface Row extends CachedResponse {
  key: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // A failed open (private mode, full disk) must be retried, not remembered.
  opening.catch(() => {
    dbPromise = null;
  });
  dbPromise = opening;
  return opening;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = work(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function keyOf(userId: string, path: string): string {
  return `${userId}|${path}`;
}

let oldestShown: number | null = null;
const listeners = new Set<() => void>();

/** Age of the data on screen: the oldest saved answer shown since going offline. */
export function oldestShownDate(): number | null {
  return oldestShown;
}

export function subscribeShownDate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetShownDate(): void {
  oldestShown = null;
  listeners.forEach((l) => l());
}

/** Never throws: without a cache the app simply has nothing to show offline. */
export async function readCached(userId: string, path: string): Promise<CachedResponse | null> {
  try {
    const row = await run<Row | undefined>('readonly', (s) => s.get(keyOf(userId, path)));
    if (!row) return null;
    if (oldestShown == null || row.savedAt < oldestShown) {
      oldestShown = row.savedAt;
      listeners.forEach((l) => l());
    }
    return row;
  } catch {
    return null;
  }
}

export async function writeCached(userId: string, path: string, data: unknown): Promise<void> {
  try {
    const row: Row = { key: keyOf(userId, path), data, savedAt: Date.now() };
    await run('readwrite', (s) => s.put(row));
  } catch {
    // Quota or private mode: live data still works.
  }
}

export async function clearReadCache(): Promise<void> {
  try {
    await run('readwrite', (s) => s.clear());
  } catch {
    // Nothing stored.
  }
}

/** Drops answers too old to be useful, so the cache does not grow forever. */
export async function pruneReadCache(): Promise<void> {
  try {
    const db = await openDb();
    const cutoff = Date.now() - MAX_AGE_MS;
    const cursorReq = db.transaction(STORE, 'readwrite').objectStore(STORE).openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      if ((cursor.value as Row).savedAt < cutoff) cursor.delete();
      cursor.continue();
    };
  } catch {
    // Nothing stored.
  }
}
