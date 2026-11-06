import { storage } from './storage';

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
  // POUFA field work (mobile M2): idempotent creations.
  | 'health-event'
  | 'delivery-confirm'
  | 'sortie'
  | 'farm-gps';

export interface OfflineOp {
  id: string;
  kind: OfflineKind;
  farmId: string;
  batchId?: string;
  payload: unknown;
  createdAt: string;
  /** Account that queued it: never replayed under another user's session. */
  userId?: string;
  /** Server errors (5xx) met so far, see MAX_SERVER_ATTEMPTS. */
  attempts?: number;
  /** Cash waiting for a session: the caisse was closed after it was collected. */
  heldByClosedCaisse?: boolean;
}

const KEY = 'koukou.offline.queue';

let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getQueueVersion(): number {
  return version;
}

/**
 * Reads the queue. A read error is thrown (callers that write must not
 * overwrite a queue they could not read: it may hold unsynced cash). A
 * corrupt payload is moved to a backup key, never deleted.
 */
function readOps(): OfflineOp[] {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (Array.isArray(parsed)) return parsed as OfflineOp[];
  storage.setItem(`${KEY}.corrupt.${Date.now()}`, raw);
  storage.setItem(KEY, '[]');
  return [];
}

/** Display-safe read: an unreadable queue shows as empty (nothing is written). */
export function loadOps(): OfflineOp[] {
  try {
    return readOps();
  } catch {
    return [];
  }
}

function persist(ops: OfflineOp[]): void {
  storage.setItem(KEY, JSON.stringify(ops));
}

export function enqueueOp(op: OfflineOp): void {
  const ops = readOps();
  ops.push(op);
  persist(ops);
  notify();
}

export function removeOp(id: string): void {
  const next = readOps().filter((op) => op.id !== id);
  persist(next);
  notify();
}

/** Counts one more server error for an op; returns the new count. */
export function bumpAttempts(id: string): number {
  const ops = readOps();
  const op = ops.find((o) => o.id === id);
  if (!op) return 0;
  op.attempts = (op.attempts ?? 0) + 1;
  persist(ops);
  return op.attempts;
}

/** Marks an op as waiting for the caisse to be opened (shown to the user). */
export function setHeldByClosedCaisse(id: string, held: boolean): void {
  const ops = readOps();
  const op = ops.find((o) => o.id === id);
  if (!op || !!op.heldByClosedCaisse === held) return;
  op.heldByClosedCaisse = held;
  persist(ops);
  notify();
}

export function clearQueue(): void {
  persist([]);
  notify();
}

/* ── Rejected ops: refused by the server but kept (cash must never vanish) ── */

export interface RejectedOp extends OfflineOp {
  rejectedAt: string;
  /** French server message (why it was refused). */
  reason: string;
}

const REJECTED_KEY = 'koukou.offline.rejected';

export function loadRejected(): RejectedOp[] {
  const raw = storage.getItem(REJECTED_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RejectedOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Moves an op from the queue to the rejected list (single notify). */
export function rejectOp(op: OfflineOp, reason: string): void {
  const rejected = loadRejected();
  rejected.push({ ...op, rejectedAt: new Date().toISOString(), reason });
  storage.setItem(REJECTED_KEY, JSON.stringify(rejected));
  persist(readOps().filter((o) => o.id !== op.id));
  notify();
}

/** Sign-out: the next user must not see (or act on) our refused ops. */
export function clearRejected(): void {
  storage.setItem(REJECTED_KEY, '[]');
  notify();
}

export function dismissRejected(id: string): void {
  storage.setItem(
    REJECTED_KEY,
    JSON.stringify(loadRejected().filter((o) => o.id !== id)),
  );
  notify();
}