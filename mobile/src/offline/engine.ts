import { ApiError } from '@/api/client';
import {
  cancelOrder,
  cancelStockTransfer,
  createStockTransfer,
  createDailyEntry,
  createInput,
  createOrder,
  createPointOfSale,
  createSale,
  deletePointOfSale,
  deliverOrder,
  ensureCashOpen,
  recordCustomerPayment,
  recordFeedLoss,
  recordOrderPayment,
  updatePointOfSale,
  type StockTransferInput,
  type CreateInputLotInput,
  type CreateOrderInput,
  type DailyEntryPayload,
  type InvoiceFields,
  type PointOfSaleInput,
  type RecordFeedLossInput,
  type SalePayload,
} from '@/api/mutations';

import { enqueueOp, loadOps, rejectOp, removeOp, type OfflineKind, type OfflineOp } from './store';

let counter = 0;

function nextId(kind: OfflineKind): string {
  counter += 1;
  const stamp = Date.now();
  return `off-${kind}-${stamp}-${counter}`;
}

/** Erreur réseau ou serveur indisponible → on met en attente. */
function shouldQueue(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (e instanceof ApiError) return e.status >= 500;
  return false;
}

/**
 * Erreur applicative (4xx) → on abandonne l'opération (donnée invalide).
 * 401 excepté : jeton expiré pendant la période hors ligne → on réessaie après
 * reconnexion plutôt que de perdre la saisie.
 */
function shouldDrop(e: unknown): boolean {
  return e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401;
}

/** Ops carrying collected cash: refused ones are kept aside, never deleted. */
function isCashOp(op: OfflineOp): boolean {
  if (op.kind === 'sale') {
    return ((op.payload as SalePayload).payments ?? []).length > 0;
  }
  if (op.kind === 'order-create') {
    return ((op.payload as CreateOrderInput).deposit?.amountFcfa ?? 0) > 0;
  }
  return op.kind === 'order-payment' || op.kind === 'customer-payment';
}

/** Raised when the caisse can't be opened for a cash op: skip it, keep it queued. */
class CashBlockedError extends Error {}

export type SendResult = { status: 'sent'; reference?: string } | { status: 'queued' };

export async function createDailyEntryQueued(
  farmId: string,
  batchId: string,
  payload: DailyEntryPayload,
): Promise<SendResult> {
  try {
    await createDailyEntry(farmId, batchId, payload);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: nextId('daily-entry'),
        kind: 'daily-entry',
        farmId,
        batchId,
        payload,
        createdAt: new Date().toISOString(),
      });
      return { status: 'queued' };
    }
    throw e;
  }
}

export async function createSaleQueued(
  farmId: string,
  saleDate: string,
  items: SalePayload['items'],
  amountFcfa: number,
  invoice?: InvoiceFields,
  pointOfSaleId?: string,
): Promise<SendResult> {
  const opId = nextId('sale');
  const payload: SalePayload = {
    saleDate,
    items,
    idempotencyKey: opId,
    payments: [{ method: 'CASH', amountFcfa, idempotencyKey: opId }],
    ...invoice,
    ...(pointOfSaleId ? { pointOfSaleId } : {}),
  };
  try {
    await ensureCashOpen(farmId);
    const res = await createSale(farmId, payload);
    void flushQueue();
    return { status: 'sent', reference: res.sale.referenceNumber };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({ id: opId, kind: 'sale', farmId, payload, createdAt: new Date().toISOString() });
      return { status: 'queued' };
    }
    throw e;
  }
}

/**
 * Vente à crédit (aucun encaissement) : la dette est portée par le client.
 * Pas de caisse requise ; `invoice.customerId` est obligatoire côté serveur
 * (le crédit alloué du client est vérifié).
 */
export async function createCreditSaleQueued(
  farmId: string,
  saleDate: string,
  items: SalePayload['items'],
  invoice: InvoiceFields,
  pointOfSaleId?: string,
): Promise<SendResult> {
  const opId = nextId('sale');
  const payload: SalePayload = {
    saleDate,
    items,
    idempotencyKey: opId,
    payments: [],
    ...invoice,
    ...(pointOfSaleId ? { pointOfSaleId } : {}),
  };
  try {
    const res = await createSale(farmId, payload);
    void flushQueue();
    return { status: 'sent', reference: res.sale.referenceNumber };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({ id: opId, kind: 'sale', farmId, payload, createdAt: new Date().toISOString() });
      return { status: 'queued' };
    }
    throw e;
  }
}

/** Entrée de provende (nouveau lot HACCP) : mise en file si hors ligne. */
export function createFeedInputQueued(farmId: string, payload: CreateInputLotInput): Promise<SendResult> {
  return createInputQueued(farmId, payload);
}

/** Déclaration de perte de provende (sacs gâtés) : mise en file si hors ligne. */
export function recordStockLossQueued(farmId: string, payload: RecordFeedLossInput): Promise<SendResult> {
  return lossQueued(farmId, payload);
}

// Creations below send idempotencyKey = op.id both live and on replay: a
// request that reached the server but whose response was lost is never
// recorded twice (duplicate lot/expense, double stock decrement...).

async function createInputQueued(farmId: string, input: CreateInputLotInput): Promise<SendResult> {
  const opId = nextId('feed-input');
  const payload: CreateInputLotInput = { ...input, idempotencyKey: input.idempotencyKey ?? opId };
  try {
    await createInput(farmId, payload);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: opId,
        kind: 'feed-input',
        farmId,
        payload,
        createdAt: new Date().toISOString(),
      });
      return { status: 'queued' };
    }
    throw e;
  }
}

async function lossQueued(farmId: string, input: RecordFeedLossInput): Promise<SendResult> {
  const opId = nextId('stock-loss');
  const payload: RecordFeedLossInput = { ...input, idempotencyKey: input.idempotencyKey ?? opId };
  try {
    await recordFeedLoss(farmId, payload);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: opId,
        kind: 'stock-loss',
        farmId,
        payload,
        createdAt: new Date().toISOString(),
      });
      return { status: 'queued' };
    }
    throw e;
  }
}

// ── Commandes (acompte / livraison / annulation) ─────────────

/** Création de commande (bon de commande) : mise en file si hors ligne.
 *  Une même clé d'idempotence (op.id) est envoyée en direct puis au rejeu :
 *  un envoi parti mais non confirmé ne duplique jamais la commande. */
export async function createOrderQueued(
  farmId: string,
  input: CreateOrderInput,
): Promise<SendResult> {
  const opId = nextId('order-create');
  const payload: CreateOrderInput = {
    ...input,
    idempotencyKey: input.idempotencyKey ?? opId,
  };
  try {
    // A deposit is a cash payment: the server needs an open caisse session.
    if (payload.deposit && payload.deposit.amountFcfa > 0) await ensureCashOpen(farmId);
    await createOrder(farmId, payload);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: opId,
        kind: 'order-create',
        farmId,
        payload,
        createdAt: new Date().toISOString(),
      });
      return { status: 'queued' };
    }
    throw e;
  }
}

/** Acompte sur commande : mis en file si hors ligne (idempotence via idempotencyKey). */
export async function recordOrderPaymentQueued(
  farmId: string,
  orderId: string,
  amountFcfa: number,
): Promise<SendResult> {
  const opId = nextId('order-payment');
  const payload = { orderId, amountFcfa, idempotencyKey: opId };
  try {
    await ensureCashOpen(farmId);
    await recordOrderPayment(farmId, orderId, amountFcfa, { idempotencyKey: opId });
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({ id: opId, kind: 'order-payment', farmId, payload, createdAt: new Date().toISOString() });
      return { status: 'queued' };
    }
    throw e;
  }
}

/** Encaissement depuis la fiche client : mis en file si hors ligne. */
export async function recordCustomerPaymentQueued(
  farmId: string,
  customerId: string,
  amountFcfa: number,
): Promise<SendResult> {
  const opId = nextId('customer-payment');
  try {
    await ensureCashOpen(farmId);
    await recordCustomerPayment(farmId, customerId, amountFcfa, { idempotencyKey: opId });
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: opId,
        kind: 'customer-payment',
        farmId,
        payload: { customerId, amountFcfa, idempotencyKey: opId },
        createdAt: new Date().toISOString(),
      });
      return { status: 'queued' };
    }
    throw e;
  }
}

/** Livraison de commande : mise en file si hors ligne (rejouée à la connexion). */
export async function deliverOrderQueued(farmId: string, orderId: string): Promise<SendResult> {
  try {
    await deliverOrder(farmId, orderId);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: nextId('order-deliver'),
        kind: 'order-deliver',
        farmId,
        payload: { orderId },
        createdAt: new Date().toISOString(),
      });
      return { status: 'queued' };
    }
    throw e;
  }
}

/** Annulation de commande : mise en file si hors ligne. */
export async function cancelOrderQueued(farmId: string, orderId: string, reason: string): Promise<SendResult> {
  try {
    await cancelOrder(farmId, orderId, reason);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: nextId('order-cancel'),
        kind: 'order-cancel',
        farmId,
        payload: { orderId, reason },
        createdAt: new Date().toISOString(),
      });
      return { status: 'queued' };
    }
    throw e;
  }
}

// ── Points de vente (configuration) ──────────────────────────

export async function createPointOfSaleQueued(farmId: string, input: PointOfSaleInput): Promise<SendResult> {
  const opId = nextId('pdv-create');
  const payload = { ...input, idempotencyKey: opId };
  try {
    await createPointOfSale(farmId, payload);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: opId,
        kind: 'pdv-create',
        farmId,
        payload,
        createdAt: new Date().toISOString(),
      });
      return { status: 'queued' };
    }
    throw e;
  }
}

export async function updatePointOfSaleQueued(
  farmId: string,
  pointOfSaleId: string,
  input: Partial<PointOfSaleInput>,
): Promise<SendResult> {
  try {
    await updatePointOfSale(farmId, pointOfSaleId, input);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: nextId('pdv-update'),
        kind: 'pdv-update',
        farmId,
        payload: { pointOfSaleId, input },
        createdAt: new Date().toISOString(),
      });
      return { status: 'queued' };
    }
    throw e;
  }
}

export async function deletePointOfSaleQueued(farmId: string, pointOfSaleId: string): Promise<SendResult> {
  try {
    await deletePointOfSale(farmId, pointOfSaleId);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: nextId('pdv-delete'),
        kind: 'pdv-delete',
        farmId,
        payload: { pointOfSaleId },
        createdAt: new Date().toISOString(),
      });
      return { status: 'queued' };
    }
    throw e;
  }
}

// ── Transferts de stock ferme → boutique ─────────────────────

export async function createStockTransferQueued(
  farmId: string,
  input: StockTransferInput,
): Promise<SendResult> {
  const opId = nextId('stock-transfer-create');
  const payload: StockTransferInput = { ...input, idempotencyKey: input.idempotencyKey ?? opId };
  try {
    await createStockTransfer(farmId, payload);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: opId,
        kind: 'stock-transfer-create',
        farmId,
        payload,
        createdAt: new Date().toISOString(),
      });
      return { status: 'queued' };
    }
    throw e;
  }
}

export async function cancelStockTransferQueued(
  farmId: string,
  transferId: string,
): Promise<SendResult> {
  try {
    await cancelStockTransfer(farmId, transferId);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: nextId('stock-transfer-cancel'),
        kind: 'stock-transfer-cancel',
        farmId,
        payload: { transferId },
        createdAt: new Date().toISOString(),
      });
      return { status: 'queued' };
    }
    throw e;
  }
}

type ProcessResult = 'ok' | 'retry' | 'dropped' | 'rejected' | 'skip';

/** Ops queued before keys existed fall back to op.id (stable across replays). */
function keyed<T extends { idempotencyKey?: string }>(op: OfflineOp): T {
  const payload = op.payload as T;
  return { ...payload, idempotencyKey: payload.idempotencyKey ?? op.id };
}

async function processOne(op: OfflineOp): Promise<ProcessResult> {
  try {
    if (op.kind === 'daily-entry') {
      await createDailyEntry(op.farmId, op.batchId ?? '', op.payload as DailyEntryPayload);
    } else if (op.kind === 'feed-input') {
      await createInput(op.farmId, keyed<CreateInputLotInput>(op));
    } else if (op.kind === 'stock-loss') {
      await recordFeedLoss(op.farmId, keyed<RecordFeedLossInput>(op));
    } else if (op.kind === 'order-create') {
      if (isCashOp(op)) await ensureCashOpenOrRetry(op.farmId);
      await createOrder(op.farmId, op.payload as CreateOrderInput);
    } else if (op.kind === 'order-payment') {
      const p = op.payload as { orderId: string; amountFcfa: number; idempotencyKey?: string };
      await ensureCashOpenOrRetry(op.farmId);
      await recordOrderPayment(op.farmId, p.orderId, p.amountFcfa, { idempotencyKey: p.idempotencyKey });
    } else if (op.kind === 'customer-payment') {
      const p = op.payload as { customerId: string; amountFcfa: number; idempotencyKey?: string };
      await ensureCashOpenOrRetry(op.farmId);
      await recordCustomerPayment(op.farmId, p.customerId, p.amountFcfa, { idempotencyKey: p.idempotencyKey });
    } else if (op.kind === 'order-deliver') {
      await deliverOrder(op.farmId, (op.payload as { orderId: string }).orderId);
    } else if (op.kind === 'order-cancel') {
      const p = op.payload as { orderId: string; reason: string };
      await cancelOrder(op.farmId, p.orderId, p.reason);
    } else if (op.kind === 'pdv-create') {
      await createPointOfSale(op.farmId, keyed<PointOfSaleInput & { idempotencyKey?: string }>(op));
    } else if (op.kind === 'pdv-update') {
      const p = op.payload as { pointOfSaleId: string; input: Partial<PointOfSaleInput> };
      await updatePointOfSale(op.farmId, p.pointOfSaleId, p.input);
    } else if (op.kind === 'pdv-delete') {
      await deletePointOfSale(op.farmId, (op.payload as { pointOfSaleId: string }).pointOfSaleId);
    } else if (op.kind === 'stock-transfer-create') {
      await createStockTransfer(op.farmId, keyed<StockTransferInput>(op));
    } else if (op.kind === 'stock-transfer-cancel') {
      await cancelStockTransfer(op.farmId, (op.payload as { transferId: string }).transferId);
    } else {
      // Credit sale (no payment): no caisse needed, same as the live path.
      if (isCashOp(op)) await ensureCashOpenOrRetry(op.farmId);
      await createSale(op.farmId, op.payload as SalePayload);
    }
    return 'ok';
  } catch (e) {
    if (e instanceof CashBlockedError) return 'skip';
    if (shouldDrop(e)) {
      if (isCashOp(op)) {
        rejectOp(op, (e as ApiError).message);
        return 'rejected';
      }
      return 'dropped';
    }
    return 'retry';
  }
}

/**
 * Ouvre la caisse si besoin puis vérifie qu'elle est ouverte, MAIS ne rend
 * JAMAIS un échec « jetable » (4xx) pour une opération en espèces : si la
 * caisse ne peut pas être ouverte (ex. session bloquée, rôle non autorisé),
 * l'opération doit rester en file ('retry') plutôt que d'être abandonnée —
 * sinon l'encaissement serait perdu silencieusement.
 */
async function ensureCashOpenOrRetry(farmId: string): Promise<void> {
  try {
    await ensureCashOpen(farmId);
  } catch (e) {
    // Network failure: plain retry. Caisse refused (closed, no permission):
    // skip this op but keep flushing the rest of the queue behind it.
    if (shouldQueue(e)) throw e;
    throw new CashBlockedError('opération en espèces en attente : session de caisse non ouverte');
  }
}

export interface FlushSummary {
  synced: number;
  dropped: number;
  /** Cash ops refused by the server, kept in the rejected list. */
  rejected: number;
  remaining: number;
}

let flushing: Promise<FlushSummary> | null = null;

/** Traite la file dans l'ordre (FIFO) ; s'arrête dès qu'un op ne peut pas partir.
 *  Mutex : les appels concurrents (post-envoi + OfflineAutoSync) partagent la
 *  même passe pour ne jamais POSTer deux fois une opération non idempotente. */
export function flushQueue(): Promise<FlushSummary> {
  if (flushing) return flushing;
  flushing = runFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function runFlush(): Promise<FlushSummary> {
  const total = { synced: 0, dropped: 0, rejected: 0 };
  // Si de nouvelles opérations sont enfilées PENDANT une passe (réseau
  // instable), on relance tant que la file est stabilisée, sans jamais
  // bloquer une opération entrée après le snapshot initial.
  const skipped = new Set<string>();
  for (let round = 0; round < 20; round++) {
    const ops = loadOps().filter((op) => !skipped.has(op.id));
    if (ops.length === 0) break;
    let roundSynced = 0;
    let roundDropped = 0;
    let roundRejected = 0;
    for (const op of ops) {
      const result = await processOne(op);
      if (result === 'ok') {
        removeOp(op.id);
        roundSynced += 1;
      } else if (result === 'dropped') {
        removeOp(op.id);
        roundDropped += 1;
      } else if (result === 'rejected') {
        roundRejected += 1; // already moved by rejectOp()
      } else if (result === 'skip') {
        skipped.add(op.id);
      } else {
        break;
      }
    }
    total.synced += roundSynced;
    total.dropped += roundDropped;
    total.rejected += roundRejected;
    if (roundSynced === 0 && roundDropped === 0 && roundRejected === 0) break;
  }
  return { ...total, remaining: loadOps().length };
}