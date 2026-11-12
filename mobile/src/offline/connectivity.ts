// The app's single connection signal (see connectivity-core.ts), wired to the
// API client, to TanStack Query's onlineManager and to the foreground state.
import { AppState } from 'react-native';
import { onlineManager } from '@tanstack/react-query';

import { createConnectivity } from './connectivity-core';

const PROBE_TIMEOUT_MS = 5_000;
let probeUrl: string | null = null;

export const connectivity = createConnectivity({
  async probe() {
    if (!probeUrl) return true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      // Any answer, even an error status, proves the server is reachable.
      await fetch(probeUrl, { method: 'GET', cache: 'no-store', signal: controller.signal });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  },
});

let started = false;

/** Starts the probe loop once (called from OfflineAutoSync, always mounted). */
export function startConnectivity(apiBaseUrl: string): void {
  probeUrl = apiBaseUrl;
  if (started) return;
  started = true;
  connectivity.subscribe(() => onlineManager.setOnline(connectivity.isOnline()));
  // Back in the foreground: probe at once, the network may have changed meanwhile.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void connectivity.check();
  });
  connectivity.start();
  void connectivity.check();
}

/** For the API client: an answer proves we are online; a network failure triggers a probe. */
export function reportApiReachable(): void {
  connectivity.reportReachable();
}
export function reportApiFailure(): void {
  void connectivity.suspectOffline();
}
