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