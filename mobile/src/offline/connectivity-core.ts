// Whether the server can be reached. React Native has no dependable online
// flag (and no NetInfo here), so the signal is: the result of the last API
// call, plus a light probe to the API. Pure and timer-free apart from `start`.

export interface ConnectivityOptions {
  /** True when the server answered (any status), false when unreachable. */
  probe: () => Promise<boolean>;
  /** Probe cadence while the server answers. */
  onlineEveryMs?: number;
  /** Probe cadence while it does not (comes back faster). */
  offlineEveryMs?: number;
}

export interface Connectivity {
  isOnline(): boolean;
  subscribe(listener: () => void): () => void;
  /** Called each time the server becomes reachable again. */
  onReconnect(listener: () => void): () => void;
  /** An API call answered: reachable. */
  reportReachable(): void;
  /** An API call failed at network level: the probe decides. */
  suspectOffline(): Promise<void>;
  /** Probes now. */
  check(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createConnectivity(options: ConnectivityOptions, initial = true): Connectivity {
  const onlineEveryMs = options.onlineEveryMs ?? 15_000;
  const offlineEveryMs = options.offlineEveryMs ?? 8_000;
  let online = initial;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let probing: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const reconnectListeners = new Set<() => void>();

  function set(next: boolean): void {
    if (next === online) return;
    online = next;
    listeners.forEach((l) => l());
    if (next) reconnectListeners.forEach((l) => l());
  }

  function probeOnce(): Promise<void> {
    // One probe at a time: a burst of failed calls shares it.
    if (probing) return probing;
    probing = options
      .probe()
      .catch(() => false)
      .then((ok) => set(ok))
      .finally(() => {
        probing = null;
      });
    return probing;
  }

  function schedule(): void {
    if (!running) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void probeOnce().finally(schedule);
    }, online ? onlineEveryMs : offlineEveryMs);
  }

  return {
    isOnline: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onReconnect(listener) {
      reconnectListeners.add(listener);
      return () => void reconnectListeners.delete(listener);
    },
    reportReachable() {
      set(true);
    },
    suspectOffline() {
      return probeOnce();
    },
    check() {
      return probeOnce().finally(schedule);
    },
    start() {
      running = true;
      schedule();
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
