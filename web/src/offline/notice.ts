// A form that closes has nowhere left to say its write went to the queue: this
// short message outlives it, shown by OfflineBar.
export const QUEUED_MESSAGE = 'Enregistré hors ligne : sera envoyé au retour de la connexion.';

let current: { text: string } | null = null;
const listeners = new Set<() => void>();

function set(next: { text: string } | null): void {
  current = next;
  listeners.forEach((l) => l());
}

export function subscribeQueuedNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getQueuedNotice(): { text: string } | null {
  return current;
}

export function showQueuedNotice(text: string = QUEUED_MESSAGE): void {
  set({ text });
}

export function dismissQueuedNotice(): void {
  set(null);
}
