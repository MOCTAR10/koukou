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

import { enqueueOp, loadOps, removeOp, type OfflineKind, type OfflineOp } from './store';

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

/** Erreur applicative (4xx) → on abandonne l'opération (donnée invalide). */
function shouldDrop(e: unknown): boolean {
  return e instanceof ApiError && e.status >= 400 && e.status < 500;
}

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

/** Entrée de provende (nouveau lot HACCP) : mise en file si hors ligne. */
export function createFeedInputQueued(farmId: string, payload: CreateInputLotInput): Promise<SendResult> {
  return createInputQueued(farmId, payload);
}

/** Déclaration de perte de provende (sacs gâtés) : mise en file si hors ligne. */
export function recordStockLossQueued(farmId: string, payload: RecordFeedLossInput): Promise<SendResult> {
  return lossQueued(farmId, payload);
}

async function createInputQueued(farmId: string, payload: CreateInputLotInput): Promise<SendResult> {
  try {
    await createInput(farmId, payload);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: nextId('feed-input'),
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

async function lossQueued(farmId: string, payload: RecordFeedLossInput): Promise<SendResult> {
  try {
    await recordFeedLoss(farmId, payload);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: nextId('stock-loss'),
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
  try {
    await createPointOfSale(farmId, input);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: nextId('pdv-create'),
        kind: 'pdv-create',
        farmId,
        payload: input,
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
  try {
    await createStockTransfer(farmId, input);
    void flushQueue();
    return { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      enqueueOp({
        id: nextId('stock-transfer-create'),
        kind: 'stock-transfer-create',
        farmId,
        payload: input,
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

async function processOne(op: OfflineOp): Promise<'ok' | 'retry' | 'dropped'> {
  try {
    if (op.kind === 'daily-entry') {
      await createDailyEntry(op.farmId, op.batchId ?? '', op.payload as DailyEntryPayload);
    } else if (op.kind === 'feed-input') {
      await createInput(op.farmId, op.payload as CreateInputLotInput);
    } else if (op.kind === 'stock-loss') {
      await recordFeedLoss(op.farmId, op.payload as RecordFeedLossInput);
    } else if (op.kind === 'order-create') {
      await createOrder(op.farmId, op.payload as CreateOrderInput);
    } else if (op.kind === 'order-payment') {
      const p = op.payload as { orderId: string; amountFcfa: number; idempotencyKey?: string };
      await ensureCashOpenOrRetry(op.farmId);
      await recordOrderPayment(op.farmId, p.orderId, p.amountFcfa, { idempotencyKey: p.idempotencyKey });
    } else if (op.kind === 'order-deliver') {
      await deliverOrder(op.farmId, (op.payload as { orderId: string }).orderId);
    } else if (op.kind === 'order-cancel') {
      const p = op.payload as { orderId: string; reason: string };
      await cancelOrder(op.farmId, p.orderId, p.reason);
    } else if (op.kind === 'pdv-create') {
      await createPointOfSale(op.farmId, op.payload as PointOfSaleInput);
    } else if (op.kind === 'pdv-update') {
      const p = op.payload as { pointOfSaleId: string; input: Partial<PointOfSaleInput> };
      await updatePointOfSale(op.farmId, p.pointOfSaleId, p.input);
    } else if (op.kind === 'pdv-delete') {
      await deletePointOfSale(op.farmId, (op.payload as { pointOfSaleId: string }).pointOfSaleId);
    } else if (op.kind === 'stock-transfer-create') {
      await createStockTransfer(op.farmId, op.payload as StockTransferInput);
    } else if (op.kind === 'stock-transfer-cancel') {
      await cancelStockTransfer(op.farmId, (op.payload as { transferId: string }).transferId);
    } else {
      await ensureCashOpenOrRetry(op.farmId);
      await createSale(op.farmId, op.payload as SalePayload);
    }
    return 'ok';
  } catch (e) {
    if (shouldDrop(e)) return 'dropped';
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
  } catch {
    // Plain Error (et non ApiError) : shouldDrop() ne le matche pas → 'retry'.
    throw new Error('opération en espèces en attente : session de caisse non ouverte');
  }
}

export interface FlushSummary {
  synced: number;
  dropped: number;
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
  const total = { synced: 0, dropped: 0 };
  // Si de nouvelles opérations sont enfilées PENDANT une passe (réseau
  // instable), on relance tant que la file est stabilisée, sans jamais
  // bloquer une opération entrée après le snapshot initial.
  for (let round = 0; round < 20; round++) {
    const ops = loadOps();
    if (ops.length === 0) break;
    let roundSynced = 0;
    let roundDropped = 0;
    for (const op of ops) {
      const result = await processOne(op);
      if (result === 'ok') {
        removeOp(op.id);
        roundSynced += 1;
      } else if (result === 'dropped') {
        removeOp(op.id);
        roundDropped += 1;
      } else {
        break;
      }
    }
    total.synced += roundSynced;
    total.dropped += roundDropped;
    if (roundSynced === 0 && roundDropped === 0) break;
  }
  return { synced: total.synced, dropped: total.dropped, remaining: loadOps().length };
}