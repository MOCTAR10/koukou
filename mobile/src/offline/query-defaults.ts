// Default options of the app's QueryClient, kept apart from the layout so the
// rules can be tested (query-defaults.test.ts).
import { onlineManager, type DefaultOptions } from '@tanstack/react-query';

import { QUERY_CACHE_MAX_AGE_MS } from './query-persist';

/**
 * One retry, but not while the connection signal says the server is out of
 * reach (the failure shows at once, with the saved data still on screen).
 */
export function retryOnce(failureCount: number): boolean {
  return failureCount < 1 && onlineManager.isOnline();
}

/**
 * Queries: gcTime >= the saved copy's max age (a restored answer must still be
 * there when its screen opens); `offlineFirst`: the first attempt always goes
 * out (React Native has no online detection, and on web a paused query would
 * stay « loading »); a failed refresh keeps the data already in the cache.
 *
 * Mutations: `always`. The default (`online`) PAUSES a mutation while
 * `onlineManager` says offline: the spinner would hang and the write would fire
 * later by itself, on reconnect. Here a write must fail at once with its
 * message (Market) or go through the offline queue, which does its own sending.
 */
export const QUERY_DEFAULT_OPTIONS: DefaultOptions = {
  queries: { staleTime: 30_000, retry: retryOnce, gcTime: QUERY_CACHE_MAX_AGE_MS, networkMode: 'offlineFirst' },
  mutations: { networkMode: 'always' },
};
