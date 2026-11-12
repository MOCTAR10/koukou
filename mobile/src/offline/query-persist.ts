// Persisted copy of the TanStack Query cache, per account, so that reads
// survive a cold start without network. Writes are not concerned: they go
// through the offline queue (`engine.ts`).
import { AppState } from 'react-native';
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';

import { loadSession } from '@/api/token';

import { storage } from './storage';

/** Bump to ignore every copy saved by an older shape of the cache. */
export const QUERY_CACHE_VERSION = 1;
/** A saved copy older than this is ignored (and removed). */
export const QUERY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Above this size the oldest queries are left out of the saved copy. */
export const QUERY_CACHE_MAX_BYTES = 4 * 1024 * 1024;
const SAVE_DEBOUNCE_MS = 2_000;
const PREFIX = 'koukou.qcache.';

interface Envelope {
  v: number;
  userId: string;
  savedAt: string;
  state: DehydratedState;
}

function storageKey(userId: string): string {
  return `${PREFIX}${userId}`;
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingSave(): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
}

/** Removes an account's saved copy (logout) and any save still waiting. */
export function clearQueryCache(userId: string | undefined): void {
  cancelPendingSave();
  if (!userId) return;
  try {
    storage.removeItem(storageKey(userId));
  } catch {
    // Nothing readable to forget.
  }
}

/** Saves the successful queries of `client` for `userId`. Never throws. */
export function saveQueryCache(client: QueryClient, userId: string, now = new Date()): void {
  try {
    const state = dehydrate(client, { shouldDehydrateQuery: (q) => q.state.status === 'success' });
    // An empty cache (after queryClient.clear()) must not erase a good copy.
    if (state.queries.length === 0) return;
    // Newest first; each query is measured once, the oldest are dropped past the budget.
    const sorted = [...state.queries].sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
    const kept: DehydratedState['queries'] = [];
    let bytes = 512;
    for (const q of sorted) {
      const size = JSON.stringify(q).length;
      if (bytes + size > QUERY_CACHE_MAX_BYTES) continue;
      bytes += size;
      kept.push(q);
    }
    if (kept.length === 0) return;
    const envelope: Envelope = {
      v: QUERY_CACHE_VERSION,
      userId,
      savedAt: now.toISOString(),
      state: { mutations: [], queries: kept },
    };
    storage.setItem(storageKey(userId), JSON.stringify(envelope));
  } catch {
    // A full disk or a non-serialisable answer must not break a screen.
  }
}

/**
 * Loads the saved copy of `userId` into `client`. Another account's copy, an
 * expired one, one of another version or a corrupt one is never loaded (the
 * last two are removed). Returns whether something was restored.
 */
export function restoreQueryCache(client: QueryClient, userId: string | undefined, now = new Date()): boolean {
  if (!userId) return false;
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return false;
    let envelope: Envelope;
    try {
      envelope = JSON.parse(raw) as Envelope;
    } catch {
      storage.removeItem(storageKey(userId));
      return false;
    }
    const savedMs = Date.parse(envelope?.savedAt ?? '');
    const valid =
      envelope &&
      typeof envelope === 'object' &&
      envelope.v === QUERY_CACHE_VERSION &&
      envelope.userId === userId &&
      Array.isArray(envelope.state?.queries) &&
      Number.isFinite(savedMs);
    if (!valid || now.getTime() - savedMs > QUERY_CACHE_MAX_AGE_MS) {
      storage.removeItem(storageKey(userId));
      return false;
    }
    hydrate(client, envelope.state);
    return true;
  } catch {
    return false;
  }
}

/**
 * Restores the signed-in account's copy now, then keeps it saved: debounced
 * after each cache change, and at once when the app leaves the foreground.
 * Returns the unsubscribe function.
 */
export function startQueryPersist(client: QueryClient): () => void {
  restoreQueryCache(client, loadSession()?.user?.id);

  const saveNow = () => {
    cancelPendingSave();
    const userId = loadSession()?.user?.id;
    if (userId) saveQueryCache(client, userId);
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' && event.type !== 'added' && event.type !== 'removed') return;
    if (!loadSession()?.token) return;
    cancelPendingSave();
    pendingTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state !== 'active') saveNow();
  });
  return () => {
    unsubscribe();
    appState.remove();
    cancelPendingSave();
  };
}
