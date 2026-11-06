// Last good answer of a few reads the field screens need offline (programme
// lists, the band picker, the account's access matrix). There is no persisted
// query cache in the app: these are kept in the durable store, per account.
import { ApiError } from '@/api/client';
import { loadSession } from '@/api/token';

import { storage } from './storage';

const PREFIX = 'koukou.cache.';

interface Entry<T> {
  savedAt: string;
  value: T;
}

/** Server out of reach (network, timeout, 5xx), as opposed to a refusal. */
export function isNetworkFailure(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof ApiError && e.status >= 500);
}

function storageKey(key: string): string {
  // Per account: another user on this phone never reads our farm data.
  const userId = loadSession()?.user?.id ?? 'anonyme';
  return `${PREFIX}${userId}.${key}`;
}

export function readCached<T>(key: string): Entry<T> | null {
  try {
    const raw = storage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    return parsed && typeof parsed === 'object' && 'value' in parsed ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCached<T>(key: string, value: T, now = new Date()): void {
  try {
    storage.setItem(storageKey(key), JSON.stringify({ savedAt: now.toISOString(), value }));
  } catch {
    // A full disk must not break the screen: the live answer is still shown.
  }
}

/**
 * Live read, saved for later; offline (network failure only) the last saved
 * answer instead. A refusal (4xx) is never hidden behind stale data.
 */
export async function cachedRead<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const value = await fetcher();
    writeCached(key, value);
    return value;
  } catch (e) {
    if (isNetworkFailure(e)) {
      const cached = readCached<T>(key);
      if (cached) return cached.value;
    }
    throw e;
  }
}
