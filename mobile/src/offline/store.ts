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
  | 'stock-transfer-cancel';

export interface OfflineOp {
  id: string;
  kind: OfflineKind;
  farmId: string;
  batchId?: string;
  payload: unknown;
  createdAt: string;
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

export function loadOps(): OfflineOp[] {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OfflineOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    storage.removeItem(KEY);
    return [];
  }
}

function persist(ops: OfflineOp[]): void {
  storage.setItem(KEY, JSON.stringify(ops));
}

export function enqueueOp(op: OfflineOp): void {
  const ops = loadOps();
  ops.push(op);
  persist(ops);
  notify();
}

export function removeOp(id: string): void {
  const next = loadOps().filter((op) => op.id !== id);
  persist(next);
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
  persist(loadOps().filter((o) => o.id !== op.id));
  notify();
}

export function dismissRejected(id: string): void {
  storage.setItem(
    REJECTED_KEY,
    JSON.stringify(loadRejected().filter((o) => o.id !== id)),
  );
  notify();
}