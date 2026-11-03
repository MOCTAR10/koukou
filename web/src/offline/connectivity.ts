// Whether the server can be reached. navigator.onLine alone is not enough: a
// farm's router can be up with no internet behind it, so failed requests count.
const PROBE_INTERVAL_MS = 30_000;

let online = typeof navigator === 'undefined' ? true : navigator.onLine;
let probeUrl: string | null = null;
let probeTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
const reconnectListeners = new Set<() => void>();

function set(next: boolean): void {
  if (next === online) return;
  online = next;
  listeners.forEach((l) => l());
  if (next) reconnectListeners.forEach((l) => l());
  syncProbe();
}

async function probe(): Promise<void> {
  if (!probeUrl) return;
  try {
    // Any answer, even an error status, proves the server is reachable.
    await fetch(probeUrl, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    set(true);
  } catch {
    // Still unreachable.
  }
}

function syncProbe(): void {
  if (online && probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  } else if (!online && !probeTimer && typeof window !== 'undefined') {
    probeTimer = setInterval(() => void probe(), PROBE_INTERVAL_MS);
  }
}

export function isOnline(): boolean {
  return online;
}

export function markOffline(): void {
  set(false);
}

export function markOnline(): void {
  set(true);
}

export function subscribeConnectivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called each time the server becomes reachable again. */
export function onReconnect(listener: () => void): () => void {
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}

export function startConnectivityWatch(serverUrl: string): void {
  probeUrl = serverUrl;
  window.addEventListener('online', () => void probe());
  window.addEventListener('offline', () => set(false));
  syncProbe();
}
