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
  | 'farm-gps'
  // POUFA lot A sante: a treatment (CDC n° 23) and a care completion (n° 22), both keyed.
  | 'treatment'
  | 'prophylaxis-complete'
  // Technical visit with its biosecurity grid (CDC n° 27, n° 45): keyed creation.
  | 'farm-visit';

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
  // Unreadable queue: keep the raw copy, salvage the valid ops, and tell the
  // user (see consumeQueueRecovery) instead of silently emptying it.
  const backupKey = `${KEY}.corrupt.${Date.now()}`;
  storage.setItem(backupKey, raw);
  const salvaged = salvageOps(raw);
  storage.setItem(KEY, JSON.stringify(salvaged));
  recovery = { recovered: salvaged.length, backupKey };
  return salvaged;
}

let recovery: { recovered: number; backupKey: string } | null = null;

/** Set once after a corrupt queue was found; returns it then forgets it. */
export function consumeQueueRecovery(): { recovered: number; backupKey: string } | null {
  const r = recovery;
  recovery = null;
  return r;
}

function isOpShape(v: unknown): v is OfflineOp {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.kind === 'string' && typeof o.farmId === 'string' && typeof o.createdAt === 'string';
}

/**
 * Best-effort recovery of a truncated JSON array: scans the top-level
 * objects (brace depth, string-aware) and keeps those that parse as ops.
 */
export function salvageOps(raw: string): OfflineOp[] {
  const out: OfflineOp[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          const candidate: unknown = JSON.parse(raw.slice(start, i + 1));
          if (isOpShape(candidate)) out.push(candidate);
        } catch {
          // Damaged object: skipped.
        }
        start = -1;
      }
    }
  }
  return out;
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

/** An op queued without an account (older versions) counts as the current user's. */
function belongsTo(op: OfflineOp, userId: string | undefined): boolean {
  return op.userId == null || op.userId === userId;
}

/** Pending plus refused ops of one account (what a sign-out would lose). */
export function countUserOps(userId: string | undefined): number {
  return (
    loadOps().filter((o) => belongsTo(o, userId)).length +
    loadRejected().filter((o) => belongsTo(o, userId)).length
  );
}

/** Sign-out: removes only this account's pending ops; other accounts keep theirs. */
export function clearUserQueue(userId: string | undefined): void {
  persist(readOps().filter((o) => !belongsTo(o, userId)));
  notify();
}

/* ── Rejected ops: refused by the server but kept (cash must never vanish) ── */

export interface RejectedOp extends OfflineOp {
  rejectedAt: string;
  /** French server message (why it was refused). */
  reason: string;
  /** Machine code of the refusal (e.g. `GPS_HORS_PROVINCE`), when the server sent one. */
  code?: string;
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
export function rejectOp(op: OfflineOp, reason: string, code?: string): void {
  const rejected = loadRejected();
  rejected.push({ ...op, rejectedAt: new Date().toISOString(), reason, ...(code ? { code } : {}) });
  storage.setItem(REJECTED_KEY, JSON.stringify(rejected));
  persist(readOps().filter((o) => o.id !== op.id));
  notify();
}

/** Sign-out: the next user must not see (or act on) our refused ops. */
export function clearRejected(): void {
  storage.setItem(REJECTED_KEY, '[]');
  notify();
}

/** Sign-out: removes only this account's refused ops. */
export function clearUserRejected(userId: string | undefined): void {
  storage.setItem(
    REJECTED_KEY,
    JSON.stringify(loadRejected().filter((o) => !belongsTo(o, userId))),
  );
  notify();
}

export function dismissRejected(id: string): void {
  storage.setItem(
    REJECTED_KEY,
    JSON.stringify(loadRejected().filter((o) => o.id !== id)),
  );
  notify();
}

/** Takes an op out of the rejected list (the caller requeues a corrected copy). */
export function takeRejected(id: string): RejectedOp | null {
  const rejected = loadRejected();
  const found = rejected.find((o) => o.id === id) ?? null;
  if (!found) return null;
  storage.setItem(REJECTED_KEY, JSON.stringify(rejected.filter((o) => o.id !== id)));
  notify();
  return found;
}
