// Port of mobile/src/offline/engine.ts: same rules, keep them in step. The web
// stores the request itself, so its forms keep their own payloads.
import { api, ApiError, OfflineError, getStoredUser } from '../api/client';
import {
  bumpAttempts,
  enqueueOp,
  loadOps,
  rejectOp,
  removeOp,
  setHeldByClosedCaisse,
  type OfflineKind,
  type OfflineOp,
} from './store';
// POUFA lot A bande: offline conflict metadata of daily entries (CDC §7.2).
import { deviceId, withCaptureMeta, withSendTime } from './syncMeta';

/** Server errors in a row after which an op stops blocking the queue. */
export const MAX_SERVER_ATTEMPTS = 10;

/** Creations carry the op id as idempotency key, live and on replay. */
const KEYED_KINDS: ReadonlySet<OfflineKind> = new Set<OfflineKind>([
  'sale',
  'feed-input',
  'stock-loss',
  'order-create',
  'order-payment',
  'customer-payment',
  'pdv-create',
  'stock-transfer-create',
  // Sanitary declaration (POUFA L5): the form may bring its own key
  // (`useIdempotencyKey`), which then wins over the op id.
  'health-event',
  // POUFA (web only for now): a replayed confirmation answers `replay: true`,
  // a replayed sortie returns the existing one (unique farm + key).
  'delivery-confirm',
  'band-sortie',
  // POUFA lot A sante: a replayed treatment returns the stored one, a replayed
  // completion the care it completed (unique farm + key). A refusal is kept for
  // the user: a sanitary record is never lost silently.
  'treatment',
  'prophylaxis-complete',
  // Technical visit (CDC n° 45): a replayed visit returns the stored one (unique farm + key).
  'visit',
]);


export class CaisseClosedSinceError extends Error {}

/** The caisse can't be opened for a cash op: skip it, keep it queued. */
class CashBlockedError extends Error {}

export type SendResult<T> = { status: 'sent'; data: T } | { status: 'queued' };

export interface OfflineRequest {
  kind: OfflineKind;
  farmId: string;
  method?: OfflineOp['method'];
  path: string;
  body?: object;
  label: string;
  /** Cash collected: the caisse is opened first, as on mobile. */
  cashFcfa?: number;
}

function nextId(kind: OfflineKind): string {
  return `off-${kind}-${Date.now().toString(36)}-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function ownedByCurrentUser(op: OfflineOp): boolean {
  return op.userId == null || op.userId === getStoredUser()?.id;
}

function shouldQueue(e: unknown): boolean {
  return e instanceof OfflineError || (e instanceof ApiError && e.status >= 500);
}

/** 4xx: invalid data. Not 401: an expired token retries after the next sign-in. */
function shouldDrop(e: unknown): boolean {
  return e instanceof ApiError && !(e instanceof OfflineError) && e.status >= 400 && e.status < 500 && e.status !== 401;
}

function send<T>(op: Pick<OfflineOp, 'method' | 'path' | 'body'> & { kind?: OfflineKind }): Promise<T> {
  // POUFA lot A bande: the device clock at each sending (server clock-skew check).
  if ((op.kind === 'daily-entry' || op.kind === 'order-deliver') && op.method === 'POST') return api.post<T>(op.path, withSendTime(op.body));
  if (op.method === 'POST') return api.post<T>(op.path, op.body);
  if (op.method === 'PATCH') return api.patch<T>(op.path, op.body);
  return api.del<T>(op.path);
}

/**
 * Opens the caisse if none is open, from the last declared closing (never 0: the
 * server books only the change from it). `collectedAt` is given when replaying
 * offline cash: if the caisse has been closed since, someone counted it for the
 * evening, so coming back online must not silently reopen it.
 */
export async function ensureCashOpen(farmId: string, collectedAt?: string): Promise<void> {
  const current = await api.getFresh<unknown>(`/farms/${farmId}/caisse/current`);
  if (current) return;
  let last: { closingBalanceFcfa: number | null; closedAt?: string | null } | undefined;
  try {
    const sessions = await api.getFresh<Array<{ closingBalanceFcfa: number | null; closedAt?: string | null }>>(
      `/farms/${farmId}/caisse/sessions`,
    );
    last = sessions.find((s) => s.closingBalanceFcfa != null);
  } catch (e) {
    // Network failure: queue the op rather than open at 0. No caisse:lire: 0.
    if (shouldQueue(e)) throw e;
  }
  if (collectedAt && last?.closedAt && Date.parse(last.closedAt) >= Date.parse(collectedAt)) {
    throw new CaisseClosedSinceError('Caisse clôturée depuis cet encaissement.');
  }
  await api.post(`/farms/${farmId}/caisse/open`, { openingBalanceFcfa: last?.closingBalanceFcfa ?? 0 });
}

/**
 * FIFO: while older ops of this farm wait, a new one must not overtake them (a
 * stale queued entry would overwrite a fresh correction; a queued deposit would
 * land after the delivery). Flush first; if some remain, queue behind them.
 */
async function mustQueueBehind(farmId: string): Promise<boolean> {
  const pending = () => loadOps().some((o) => o.farmId === farmId && ownedByCurrentUser(o));
  if (!pending()) return false;
  await flushQueue();
  return pending();
}

/** Sends now, or keeps the write for later when the server can't be reached. */
export async function sendOrQueue<T = unknown>(req: OfflineRequest): Promise<SendResult<T>> {
  const id = nextId(req.kind);
  const createdAt = new Date().toISOString();
  const op: OfflineOp = {
    id,
    kind: req.kind,
    farmId: req.farmId,
    method: req.method ?? 'POST',
    path: req.path,
    body: KEYED_KINDS.has(req.kind)
      ? { idempotencyKey: id, ...req.body }
      : // POUFA lot A bande: capture time and device, fixed at the first attempt.
        // POUFA lot A2 divers: an order delivery keeps its own day too.
        req.kind === 'daily-entry' || req.kind === 'order-deliver'
        ? withCaptureMeta(req.body, createdAt, deviceId())
        : req.body,
    label: req.label,
    cashFcfa: req.cashFcfa,
    createdAt,
    userId: getStoredUser()?.id,
  };
  if (await mustQueueBehind(op.farmId)) {
    enqueueOp(op);
    return { status: 'queued' };
  }
  try {
    if ((op.cashFcfa ?? 0) > 0) await ensureCashOpen(op.farmId);
    const data = await send<T>(op);
    void flushQueue();
    return { status: 'sent', data };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp(op);
      return { status: 'queued' };
    }
    throw e;
  }
}

/** This user's cash on this farm that waits for the caisse to be opened. */
export function heldCashSummary(farmId: string): { count: number; amountFcfa: number } {
  const held = loadOps().filter((o) => o.farmId === farmId && o.heldByClosedCaisse && ownedByCurrentUser(o));
  return { count: held.length, amountFcfa: held.reduce((sum, o) => sum + (o.cashFcfa ?? 0), 0) };
}

type ProcessResult = 'ok' | 'retry' | 'failed' | 'rejected' | 'skip';

async function processOne(op: OfflineOp): Promise<ProcessResult> {
  try {
    if ((op.cashFcfa ?? 0) > 0) {
      try {
        await ensureCashOpen(op.farmId, op.createdAt);
        setHeldByClosedCaisse(op.id, false);
      } catch (e) {
        if (e instanceof CaisseClosedSinceError) setHeldByClosedCaisse(op.id, true);
        if (shouldQueue(e)) throw e;
        // Closed since, or no permission: pass over it, the money stays queued.
        throw new CashBlockedError();
      }
    }
    await send(op);
    return 'ok';
  } catch (e) {
    if (e instanceof CashBlockedError) return 'skip';
    if (shouldDrop(e)) {
      // Refused for good (4xx): never lose it silently, whatever the kind (a delivery, a cancellation or a
      // point-of-sale change the user believes done) — the sync centre lists it with the server's message.
      rejectOp(op, (e as ApiError).message);
      return 'rejected';
    }
    if (e instanceof ApiError && !(e instanceof OfflineError) && e.status >= 500) return 'failed';
    return 'retry';
  }
}

export interface FlushSummary {
  synced: number;
  rejected: number;
  remaining: number;
  /** Farms whose queued ops reached the server, to refresh each of them. */
  farmIds: string[];
}

async function runFlush(): Promise<FlushSummary> {
  const total = { synced: 0, rejected: 0 };
  const farmIds = new Set<string>();
  const skipped = new Set<string>();
  for (let round = 0; round < 20; round++) {
    const ops = loadOps().filter((op) => !skipped.has(op.id));
    if (ops.length === 0) break;
    let progress = 0;
    for (const op of ops) {
      if (!ownedByCurrentUser(op)) {
        skipped.add(op.id);
        continue;
      }
      let result = await processOne(op);
      if (result === 'failed') {
        // A payload the server keeps failing on must not block the queue
        // forever. Cash is never given up: it stays queued, passed over.
        if (bumpAttempts(op.id) < MAX_SERVER_ATTEMPTS) {
          result = 'retry';
        } else if ((op.cashFcfa ?? 0) > 0) {
          result = 'skip';
        } else {
          rejectOp(op, 'Le serveur échoue à répétition sur cette opération.');
          result = 'rejected';
        }
      }
      if (result === 'ok') {
        removeOp(op.id);
        total.synced += 1;
        progress += 1;
        farmIds.add(op.farmId);
      } else if (result === 'rejected') {
        total.rejected += 1;
        progress += 1;
      } else if (result === 'skip') {
        skipped.add(op.id);
      } else {
        break;
      }
    }
    if (progress === 0) break;
  }
  return { ...total, remaining: loadOps().length, farmIds: [...farmIds] };
}

function idleSummary(): FlushSummary {
  return { synced: 0, rejected: 0, remaining: loadOps().length, farmIds: [] };
}

let flushing: Promise<FlushSummary> | null = null;

/** In FIFO order. One pass at a time, in this tab and across the browser's tabs. */
export function flushQueue(): Promise<FlushSummary> {
  if (flushing) return flushing;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const pass: Promise<FlushSummary> = locks
    ? (locks.request('koukou-offline-flush', { ifAvailable: true }, (lock) =>
        lock ? runFlush() : idleSummary(),
      ) as Promise<FlushSummary>)
    : runFlush();
  flushing = pass.finally(() => {
    flushing = null;
  });
  return flushing;
}
