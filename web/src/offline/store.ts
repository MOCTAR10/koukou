// Writes waiting for the connection, in localStorage (shared by the browser's tabs).
export type OfflineKind =
  | 'daily-entry'
  | 'sale'
  | 'feed-input'
  | 'stock-loss'
  | 'order-create'
  | 'order-payment'
  | 'order-deliver'
  | 'order-cancel'
  | 'customer-payment'
  | 'pdv-create'
  | 'pdv-update'
  | 'pdv-delete'
  | 'stock-transfer-create'
  | 'stock-transfer-cancel'
  // Web only for now (POUFA L5): a sanitary declaration, with its clinical signs and suspicion.
  | 'health-event'
  // POUFA: the farmer's input-delivery confirmation and a band sortie (both keyed).
  | 'delivery-confirm'
  | 'band-sortie';

export interface OfflineOp {
  /** Unique across devices; also the idempotency key of the creations. */
  id: string;
  kind: OfflineKind;
  farmId: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /** What the user did, in French, shown in the sync centre. */
  label: string;
  /** Cash collected by this op; 0 or absent when it moves no money. */
  cashFcfa?: number;
  createdAt: string;
  /** Account that queued it: never replayed under another user's session. */
  userId?: string;
  /** Server errors (5xx) met so far, see MAX_SERVER_ATTEMPTS. */
  attempts?: number;
  /** Cash waiting for a session: the caisse was closed after it was collected. */
  heldByClosedCaisse?: boolean;
}

export interface RejectedOp extends OfflineOp {
  rejectedAt: string;
  /** French server message (why it was refused). */
  reason: string;
}

const KEY = 'koukou.offline.queue';
const REJECTED_KEY = 'koukou.offline.rejected';

let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version += 1;
  listeners.forEach((l) => l());
}

// Another tab changed the queue.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === REJECTED_KEY) notify();
  });
}

export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getQueueVersion(): number {
  return version;
}

/** A corrupt payload is moved to a backup key, never deleted: it may hold cash. */
export function loadOps(): OfflineOp[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (Array.isArray(parsed)) return parsed as OfflineOp[];
  localStorage.setItem(`${KEY}.corrupt.${Date.now()}`, raw);
  localStorage.setItem(KEY, '[]');
  return [];
}

function persist(ops: OfflineOp[]): void {
  localStorage.setItem(KEY, JSON.stringify(ops));
}

export function enqueueOp(op: OfflineOp): void {
  const ops = loadOps();
  ops.push(op);
  persist(ops);
  notify();
}

export function removeOp(id: string): void {
  persist(loadOps().filter((op) => op.id !== id));
  notify();
}

/** Counts one more server error for an op; returns the new count. */
export function bumpAttempts(id: string): number {
  const ops = loadOps();
  const op = ops.find((o) => o.id === id);
  if (!op) return 0;
  op.attempts = (op.attempts ?? 0) + 1;
  persist(ops);
  return op.attempts;
}

export function setHeldByClosedCaisse(id: string, held: boolean): void {
  const ops = loadOps();
  const op = ops.find((o) => o.id === id);
  if (!op || !!op.heldByClosedCaisse === held) return;
  op.heldByClosedCaisse = held;
  persist(ops);
  notify();
}

export function loadRejected(): RejectedOp[] {
  const raw = localStorage.getItem(REJECTED_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RejectedOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Moves an op from the queue to the rejected list. */
export function rejectOp(op: OfflineOp, reason: string): void {
  const rejected = loadRejected();
  rejected.push({ ...op, rejectedAt: new Date().toISOString(), reason });
  localStorage.setItem(REJECTED_KEY, JSON.stringify(rejected));
  persist(loadOps().filter((o) => o.id !== op.id));
  notify();
}

export function dismissRejected(id: string): void {
  localStorage.setItem(REJECTED_KEY, JSON.stringify(loadRejected().filter((o) => o.id !== id)));
  notify();
}

/** Sign-out: the next user must not see, or act on, our ops. */
export function clearOfflineOps(): void {
  persist([]);
  localStorage.setItem(REJECTED_KEY, '[]');
  notify();
}
