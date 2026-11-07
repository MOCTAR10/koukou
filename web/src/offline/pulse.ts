// What the connection indicator shows, and the little state shared between it and the sync centre (OfflineBar).

export type PulseTone = 'online' | 'offline' | 'syncing';

export interface PulseState {
  tone: PulseTone;
  label: string;
}

/** Pure: connection + queued writes + a flush in progress → tone and French label. */
export function pulseState(online: boolean, pending: number, syncing: boolean): PulseState {
  if (syncing) return { tone: 'syncing', label: 'Synchronisation…' };
  if (!online) return { tone: 'offline', label: pending > 0 ? `Hors ligne · ${pending} en attente` : 'Hors ligne' };
  if (pending > 0) return { tone: 'online', label: `En ligne · ${pending} en attente` };
  return { tone: 'online', label: 'En ligne' };
}

let syncing = false;
const syncListeners = new Set<() => void>();
const openListeners = new Set<() => void>();

export function setSyncing(value: boolean): void {
  if (syncing === value) return;
  syncing = value;
  syncListeners.forEach((l) => l());
}
export function isSyncing(): boolean {
  return syncing;
}
export function subscribeSyncing(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => void syncListeners.delete(listener);
}

/** Asks the mounted OfflineBar to open the sync centre. */
export function requestSyncCentre(): void {
  openListeners.forEach((l) => l());
}
export function onSyncCentreRequest(listener: () => void): () => void {
  openListeners.add(listener);
  return () => void openListeners.delete(listener);
}
