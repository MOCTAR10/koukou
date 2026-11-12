// What the connection indicator shows: same states and wording as the web app
// (`web/src/offline/pulse.ts`), plus « Tout est envoyé » right after a sync.

export type PulseTone = 'online' | 'offline' | 'syncing';

export interface PulseState {
  tone: PulseTone;
  label: string;
}

/** Pure: connection + queued writes + a flush in progress (+ just emptied) → tone and French label. */
export function pulseState(online: boolean, pending: number, syncing: boolean, justSynced = false): PulseState {
  if (syncing) return { tone: 'syncing', label: 'Synchronisation…' };
  if (!online) return { tone: 'offline', label: pending > 0 ? `Hors ligne · ${pending} en attente` : 'Hors ligne' };
  if (pending > 0) return { tone: 'online', label: `En ligne · ${pending} en attente` };
  if (justSynced) return { tone: 'online', label: 'Tout est envoyé' };
  return { tone: 'online', label: 'En ligne' };
}

// Shared by OfflineAutoSync (writer) and the indicator (reader).
let syncing = false;
let justSynced = false;
let justSyncedTimer: ReturnType<typeof setTimeout> | null = null;
let version = 0;
const listeners = new Set<() => void>();
const JUST_SYNCED_MS = 4_000;

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function setSyncing(value: boolean): void {
  if (syncing === value) return;
  syncing = value;
  emit();
}
/** A pass sent something and the queue is now empty: « Tout est envoyé » for a few seconds. */
export function markAllSent(): void {
  justSynced = true;
  if (justSyncedTimer) clearTimeout(justSyncedTimer);
  justSyncedTimer = setTimeout(() => {
    justSynced = false;
    emit();
  }, JUST_SYNCED_MS);
  emit();
}
export function isSyncing(): boolean {
  return syncing;
}
export function isJustSynced(): boolean {
  return justSynced;
}
/** The two flags as one number (1 = syncing, 2 = just sent): stable between changes, so a hook can subscribe to it. */
export function pulseFlags(): number {
  return (syncing ? 1 : 0) | (justSynced ? 2 : 0);
}
export function pulseVersion(): number {
  return version;
}
export function subscribePulse(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
