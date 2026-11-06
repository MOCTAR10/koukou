import { ApiError } from '@/api/client';
import {
  cancelOrder,
  cancelStockTransfer,
  // POUFA lot A sante
  completeProphylaxis,
  createTreatment,
  type CompleteProphylaxisInput,
  type CreateTreatmentInput,
  createStockTransfer,
  createDailyEntry,
  createInput,
  createOrder,
  createPointOfSale,
  createSale,
  deletePointOfSale,
  deliverOrder,
  CaisseClosedSinceError,
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

import { loadSession } from '@/api/token';
import {
  confirmDelivery,
  createDeclaration,
  createSortie,
  setFarmGps,
  uploadDeclarationPhoto,
  type ConfirmDeliveryPayload,
  type ConfirmResult,
  type DeclarationPayload,
  type DeclarationPhoto,
  type FarmGpsPayload,
  type FarmGpsResult,
  type SortiePayload,
  type SortieView,
} from '@/api/poufa';

// POUFA lot A bande: offline conflict metadata of the daily entry.
import { withCapture, withSendTime } from '@/poufa/entry-sync';

import { deviceId } from './device-id';
import { discardPhoto, photoExists } from './photo-files';

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

/** Random hex (crypto when the runtime has it, Math.random otherwise). */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(buf);
  else for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  return Array.from(buf, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Op id, also the idempotency key: unique across devices (the server dedupes
 * per farm, so two phones minting the same id would merge two sales).
 */
function nextId(kind: OfflineKind): string {
  return `off-${kind}-${Date.now().toString(36)}-${randomHex(12)}`;
}

function currentUserId(): string | undefined {
  return loadSession()?.user?.id;
}

/** Ops queued by another account on this phone are never replayed under ours. */
function ownedByCurrentUser(op: OfflineOp): boolean {
  return op.userId == null || op.userId === currentUserId();
}

type NewOp = Omit<OfflineOp, 'userId' | 'createdAt'>;

function queueOp(op: NewOp): void {
  enqueueOp({ ...op, userId: currentUserId(), createdAt: new Date().toISOString() });
}

/**
 * FIFO: while older ops of this farm wait in the queue, a new op must not
 * overtake them live (a stale queued daily entry would overwrite a fresh
 * correction; a queued deposit would land after the delivery). Try to flush
 * first; if some are still pending, queue behind them.
 */
async function mustQueueBehind(farmId: string): Promise<boolean> {
  const pending = () => loadOps().some((o) => o.farmId === farmId && ownedByCurrentUser(o));
  if (!pending()) return false;
  await flushQueue();
  return pending();
}

/** Live attempt (or queued behind older ops); network failure → queued. */
async function sendOrQueue(op: NewOp, live: () => Promise<string | void>): Promise<SendResult> {
  if (await mustQueueBehind(op.farmId)) {
    // A flush just ran and left older ops: the next auto-sync sends them in order.
    queueOp(op);
    return { status: 'queued' };
  }
  try {
    const reference = await live();
    void flushQueue();
    return reference ? { status: 'sent', reference } : { status: 'sent' };
  } catch (e) {
    if (shouldQueue(e)) {
      queueOp(op);
      return { status: 'queued' };
    }
    throw e;
  }
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

/** Amount of cash an op carries. */
function cashAmount(op: OfflineOp): number {
  if (op.kind === 'sale') {
    return ((op.payload as SalePayload).payments ?? []).reduce((sum, p) => sum + p.amountFcfa, 0);
  }
  if (op.kind === 'order-create') return (op.payload as CreateOrderInput).deposit?.amountFcfa ?? 0;
  return (op.payload as { amountFcfa?: number }).amountFcfa ?? 0;
}

/** This user's cash on this farm that waits for the caisse to be opened. */
export function heldCashSummary(farmId: string): { count: number; amountFcfa: number } {
  const held = loadOps().filter((o) => o.farmId === farmId && o.heldByClosedCaisse && ownedByCurrentUser(o));
  return { count: held.length, amountFcfa: held.reduce((sum, o) => sum + cashAmount(o), 0) };
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

/**
 * Ops that create a record (a sale on credit, an order, a reception…): a
 * refusal is kept in the rejected list for the user to re-enter, never
 * silently deleted. State transitions (deliver, cancel, delete, update) can be
 * dropped: a refusal there usually means it already happened.
 */
function isCreation(op: OfflineOp): boolean {
  return (
    op.kind === 'daily-entry' ||
    op.kind === 'sale' ||
    op.kind === 'feed-input' ||
    op.kind === 'stock-loss' ||
    op.kind === 'order-create' ||
    op.kind === 'order-payment' ||
    op.kind === 'customer-payment' ||
    op.kind === 'pdv-create' ||
    op.kind === 'stock-transfer-create' ||
    op.kind === 'health-event' ||
    op.kind === 'delivery-confirm' ||
    op.kind === 'sortie' ||
    op.kind === 'farm-gps' ||
    // POUFA lot A sante: a sanitary record refused on replay is kept for the
    // user (a completion refused because the care was cancelled meanwhile
    // carries the animal count and route actually given).
    op.kind === 'treatment' ||
    op.kind === 'prophylaxis-complete'
  );
}

/** Server errors (5xx) in a row after which an op stops blocking the queue. */
export const MAX_SERVER_ATTEMPTS = 10;

/** Raised when the caisse can't be opened for a cash op: skip it, keep it queued. */
class CashBlockedError extends Error {}

export type SendResult = { status: 'sent'; reference?: string } | { status: 'queued' };

/** Like `SendResult`, with the server's answer when it was sent live. */
export type SendResultOf<T> = { status: 'sent'; data: T } | { status: 'queued' };

/** `sendOrQueue` keeping the live answer (same FIFO and queueing rules). */
async function sendOrQueueWith<T>(op: NewOp, live: () => Promise<T>): Promise<SendResultOf<T>> {
  let data: T | undefined;
  const result = await sendOrQueue(op, async () => {
    data = await live();
  });
  return result.status === 'sent' ? { status: 'sent', data: data as T } : { status: 'queued' };
}

// POUFA lot A bande: offline conflict rule (CDC §7.2). The capture time and
// the device are fixed when the user saves; the phone clock goes with each
// attempt, live and replay (backend sync.service.ts).
function sendDailyEntry(farmId: string, batchId: string, payload: DailyEntryPayload): Promise<unknown> {
  return createDailyEntry(farmId, batchId, withSendTime(payload, new Date().toISOString()));
}

export async function createDailyEntryQueued(
  farmId: string,
  batchId: string,
  entry: DailyEntryPayload,
): Promise<SendResult> {
  const payload = withCapture(entry, new Date().toISOString(), deviceId());
  return sendOrQueue(
    {
      id: nextId('daily-entry'),
      kind: 'daily-entry',
      farmId,
      batchId,
      payload,
    },
    async () => {
      await sendDailyEntry(farmId, batchId, payload);
    },
  );
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
  return sendOrQueue(
    { id: opId, kind: 'sale', farmId, payload },
    async () => {
      await ensureCashOpen(farmId);
      const res = await createSale(farmId, payload);
      return res.sale.referenceNumber;
    },
  );
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
  return sendOrQueue(
    { id: opId, kind: 'sale', farmId, payload },
    async () => {
      const res = await createSale(farmId, payload);
      return res.sale.referenceNumber;
    },
  );
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
  return sendOrQueue(
    {
      id: opId,
      kind: 'feed-input',
      farmId,
      payload,
    },
    async () => {
      await createInput(farmId, payload);
    },
  );
}

async function lossQueued(farmId: string, input: RecordFeedLossInput): Promise<SendResult> {
  const opId = nextId('stock-loss');
  const payload: RecordFeedLossInput = { ...input, idempotencyKey: input.idempotencyKey ?? opId };
  return sendOrQueue(
    {
      id: opId,
      kind: 'stock-loss',
      farmId,
      payload,
    },
    async () => {
      await recordFeedLoss(farmId, payload);
    },
  );
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
  return sendOrQueue(
    {
      id: opId,
      kind: 'order-create',
      farmId,
      payload,
    },
    async () => {
      // A deposit is a cash payment: the server needs an open caisse session.
      if (payload.deposit && payload.deposit.amountFcfa > 0) await ensureCashOpen(farmId);
      await createOrder(farmId, payload);
    },
  );
}

/** Acompte sur commande : mis en file si hors ligne (idempotence via idempotencyKey). */
export async function recordOrderPaymentQueued(
  farmId: string,
  orderId: string,
  amountFcfa: number,
): Promise<SendResult> {
  const opId = nextId('order-payment');
  const payload = { orderId, amountFcfa, idempotencyKey: opId };
  return sendOrQueue(
    { id: opId, kind: 'order-payment', farmId, payload },
    async () => {
      await ensureCashOpen(farmId);
      await recordOrderPayment(farmId, orderId, amountFcfa, { idempotencyKey: opId });
    },
  );
}

/** Encaissement depuis la fiche client : mis en file si hors ligne. */
export async function recordCustomerPaymentQueued(
  farmId: string,
  customerId: string,
  amountFcfa: number,
): Promise<SendResult> {
  const opId = nextId('customer-payment');
  return sendOrQueue(
    {
      id: opId,
      kind: 'customer-payment',
      farmId,
      payload: { customerId, amountFcfa, idempotencyKey: opId },
    },
    async () => {
      await ensureCashOpen(farmId);
      await recordCustomerPayment(farmId, customerId, amountFcfa, { idempotencyKey: opId });
    },
  );
}

/** Livraison de commande : mise en file si hors ligne (rejouée à la connexion). */
export async function deliverOrderQueued(farmId: string, orderId: string): Promise<SendResult> {
  return sendOrQueue(
    {
      id: nextId('order-deliver'),
      kind: 'order-deliver',
      farmId,
      payload: { orderId },
    },
    async () => {
      await deliverOrder(farmId, orderId);
    },
  );
}

/** Annulation de commande : mise en file si hors ligne. */
export async function cancelOrderQueued(farmId: string, orderId: string, reason: string): Promise<SendResult> {
  return sendOrQueue(
    {
      id: nextId('order-cancel'),
      kind: 'order-cancel',
      farmId,
      payload: { orderId, reason },
    },
    async () => {
      await cancelOrder(farmId, orderId, reason);
    },
  );
}

// ── Points de vente (configuration) ──────────────────────────

export async function createPointOfSaleQueued(farmId: string, input: PointOfSaleInput): Promise<SendResult> {
  const opId = nextId('pdv-create');
  const payload = { ...input, idempotencyKey: opId };
  return sendOrQueue(
    {
      id: opId,
      kind: 'pdv-create',
      farmId,
      payload,
    },
    async () => {
      await createPointOfSale(farmId, payload);
    },
  );
}

export async function updatePointOfSaleQueued(
  farmId: string,
  pointOfSaleId: string,
  input: Partial<PointOfSaleInput>,
): Promise<SendResult> {
  return sendOrQueue(
    {
      id: nextId('pdv-update'),
      kind: 'pdv-update',
      farmId,
      payload: { pointOfSaleId, input },
    },
    async () => {
      await updatePointOfSale(farmId, pointOfSaleId, input);
    },
  );
}

export async function deletePointOfSaleQueued(farmId: string, pointOfSaleId: string): Promise<SendResult> {
  return sendOrQueue(
    {
      id: nextId('pdv-delete'),
      kind: 'pdv-delete',
      farmId,
      payload: { pointOfSaleId },
    },
    async () => {
      await deletePointOfSale(farmId, pointOfSaleId);
    },
  );
}

// ── Transferts de stock ferme → boutique ─────────────────────

export async function createStockTransferQueued(
  farmId: string,
  input: StockTransferInput,
): Promise<SendResult> {
  const opId = nextId('stock-transfer-create');
  const payload: StockTransferInput = { ...input, idempotencyKey: input.idempotencyKey ?? opId };
  return sendOrQueue(
    {
      id: opId,
      kind: 'stock-transfer-create',
      farmId,
      payload,
    },
    async () => {
      await createStockTransfer(farmId, payload);
    },
  );
}

export async function cancelStockTransferQueued(
  farmId: string,
  transferId: string,
): Promise<SendResult> {
  return sendOrQueue(
    {
      id: nextId('stock-transfer-cancel'),
      kind: 'stock-transfer-cancel',
      farmId,
      payload: { transferId },
    },
    async () => {
      await cancelStockTransfer(farmId, transferId);
    },
  );
}

// ── POUFA field work (mobile M2) ─────────────────────────────
// Every op below is a creation the server deduplicates: `idempotencyKey =
// op.id` on the live attempt and on replay (health events and sorties via
// their unique (farmId, idempotencyKey), a delivery confirmation answers
// `replay: true`, the GPS point by its unique (farmId, idempotencyKey)).

export interface HealthEventOpPayload {
  batchId: string;
  payload: DeclarationPayload;
  /** Local files, sent after the event exists (same bytes = same photo on the server). */
  photos: DeclarationPhoto[];
}

export interface DeclarationSent {
  eventId: string;
  photosSent: number;
  /** French reasons of the photos the server refused (the declaration itself is saved). */
  photosRefused: string[];
}

/**
 * Uploads the photos of a saved event. A refused photo (4xx: size, format,
 * 5 per event) is skipped with its reason; a network failure throws, so the
 * whole op is replayed: the event comes back by its key and photos already
 * stored are recognised by their hash. Files are discarded only at the end.
 */
async function sendDeclarationPhotos(
  farmId: string,
  batchId: string,
  eventId: string,
  photos: readonly DeclarationPhoto[],
): Promise<{ sent: number; refused: string[] }> {
  let sent = 0;
  const refused: string[] = [];
  for (const photo of photos) {
    if (!photoExists(photo)) {
      refused.push('Photo introuvable sur le téléphone.');
      continue;
    }
    try {
      await uploadDeclarationPhoto(farmId, batchId, eventId, photo);
      sent += 1;
    } catch (e) {
      if (shouldDrop(e)) {
        refused.push((e as ApiError).message);
        continue;
      }
      throw e;
    }
  }
  photos.forEach(discardPhoto);
  return { sent, refused };
}

async function sendDeclaration(farmId: string, p: HealthEventOpPayload): Promise<DeclarationSent> {
  const event = await createDeclaration(farmId, p.batchId, p.payload);
  const photos = await sendDeclarationPhotos(farmId, p.batchId, event.id, p.photos ?? []);
  return { eventId: event.id, photosSent: photos.sent, photosRefused: photos.refused };
}

/** Sanitary declaration (CDC 21), queued offline with its photos. */
export function createDeclarationQueued(
  farmId: string,
  batchId: string,
  declaration: DeclarationPayload,
  photos: DeclarationPhoto[] = [],
): Promise<SendResultOf<DeclarationSent>> {
  const opId = nextId('health-event');
  const payload: HealthEventOpPayload = {
    batchId,
    payload: { ...declaration, idempotencyKey: declaration.idempotencyKey ?? opId },
    photos,
  };
  return sendOrQueueWith({ id: opId, kind: 'health-event', farmId, batchId, payload }, () => sendDeclaration(farmId, payload));
}

export interface DeliveryConfirmOpPayload {
  deliveryId: string;
  payload: ConfirmDeliveryPayload;
}

/** Input delivery confirmation (CDC 17-18): a replay answers `replay: true`. */
export function confirmDeliveryQueued(
  farmId: string,
  deliveryId: string,
  confirmation: ConfirmDeliveryPayload,
): Promise<SendResultOf<ConfirmResult>> {
  const opId = nextId('delivery-confirm');
  const payload: DeliveryConfirmOpPayload = {
    deliveryId,
    payload: { ...confirmation, idempotencyKey: confirmation.idempotencyKey ?? opId },
  };
  return sendOrQueueWith({ id: opId, kind: 'delivery-confirm', farmId, payload }, () =>
    confirmDelivery(farmId, deliveryId, payload.payload),
  );
}

export interface SortieOpPayload {
  batchId: string;
  payload: SortiePayload;
}

/** Sends a sortie with the phone's clock at send time (server skew check). */
function sendSortie(farmId: string, p: SortieOpPayload): Promise<SortieView> {
  return createSortie(farmId, p.batchId, { ...p.payload, deviceSentAt: new Date().toISOString() });
}

/** Band exit (CDC 9), deduplicated by the server on its key. */
export function createSortieQueued(
  farmId: string,
  batchId: string,
  sortie: SortiePayload,
): Promise<SendResultOf<SortieView>> {
  const opId = nextId('sortie');
  const payload: SortieOpPayload = {
    batchId,
    payload: {
      ...sortie,
      idempotencyKey: sortie.idempotencyKey ?? opId,
      capturedAt: sortie.capturedAt ?? new Date().toISOString(),
    },
  };
  return sendOrQueueWith({ id: opId, kind: 'sortie', farmId, batchId, payload }, () => sendSortie(farmId, payload));
}

/**
 * GPS fix of the farm (CDC 2), keyed by `idempotencyKey = op.id`: a replay
 * after a lost answer adds no second point, and the server ignores a fix
 * older than the current point (200, `applied: false` with its message).
 */
export function setFarmGpsQueued(farmId: string, gps: FarmGpsPayload): Promise<SendResultOf<FarmGpsResult>> {
  const opId = nextId('farm-gps');
  const payload = { ...gps, idempotencyKey: gps.idempotencyKey ?? opId };
  return sendOrQueueWith({ id: opId, kind: 'farm-gps', farmId, payload: { payload } }, () => setFarmGps(farmId, payload));
}

// ── POUFA lot A sante: sanitary registers (CDC n° 22-23) ──────────────
// Both are keyed: the server stores a treatment once per (farm, key) and
// answers a replayed completion with the care it already completed.

export interface TreatmentOpPayload {
  batchId: string;
  payload: CreateTreatmentInput;
}

/** Treatment register entry (CDC n° 23), queued offline. */
export function createTreatmentQueued(
  farmId: string,
  batchId: string,
  treatment: CreateTreatmentInput,
): Promise<SendResult> {
  const opId = nextId('treatment');
  const payload: TreatmentOpPayload = {
    batchId,
    payload: { ...treatment, idempotencyKey: treatment.idempotencyKey ?? opId },
  };
  return sendOrQueue({ id: opId, kind: 'treatment', farmId, batchId, payload }, async () => {
    await createTreatment(farmId, batchId, payload.payload);
  });
}

export interface CareCompletionOpPayload {
  batchId: string;
  eventId: string;
  payload: CompleteProphylaxisInput;
}

/** Completion of a planned care (CDC n° 22: date, route, animals), queued offline. */
export function completeProphylaxisQueued(
  farmId: string,
  batchId: string,
  eventId: string,
  completion: CompleteProphylaxisInput,
): Promise<SendResult> {
  const opId = nextId('prophylaxis-complete');
  const payload: CareCompletionOpPayload = {
    batchId,
    eventId,
    payload: { ...completion, idempotencyKey: completion.idempotencyKey ?? opId },
  };
  return sendOrQueue({ id: opId, kind: 'prophylaxis-complete', farmId, batchId, payload }, async () => {
    await completeProphylaxis(farmId, batchId, eventId, payload.payload);
  });
}

/** `failed` = server error (5xx): counted, unlike network or 401 retries. */
type ProcessResult = 'ok' | 'retry' | 'failed' | 'dropped' | 'rejected' | 'skip';

/** Ops queued before keys existed fall back to op.id (stable across replays). */
function keyed<T extends { idempotencyKey?: string }>(op: OfflineOp): T {
  const payload = op.payload as T;
  return { ...payload, idempotencyKey: payload.idempotencyKey ?? op.id };
}

async function processOne(op: OfflineOp): Promise<ProcessResult> {
  try {
    if (op.kind === 'daily-entry') {
      // POUFA lot A bande: an op queued before the rule is dated when queued.
      const entry = op.payload as DailyEntryPayload;
      await sendDailyEntry(op.farmId, op.batchId ?? '', { ...entry, capturedAt: entry.capturedAt ?? op.createdAt });
    } else if (op.kind === 'feed-input') {
      await createInput(op.farmId, keyed<CreateInputLotInput>(op));
    } else if (op.kind === 'stock-loss') {
      await recordFeedLoss(op.farmId, keyed<RecordFeedLossInput>(op));
    } else if (op.kind === 'order-create') {
      if (isCashOp(op)) await ensureCashOpenOrRetry(op);
      await createOrder(op.farmId, op.payload as CreateOrderInput);
    } else if (op.kind === 'order-payment') {
      const p = op.payload as { orderId: string; amountFcfa: number; idempotencyKey?: string };
      await ensureCashOpenOrRetry(op);
      await recordOrderPayment(op.farmId, p.orderId, p.amountFcfa, { idempotencyKey: p.idempotencyKey });
    } else if (op.kind === 'customer-payment') {
      const p = op.payload as { customerId: string; amountFcfa: number; idempotencyKey?: string };
      await ensureCashOpenOrRetry(op);
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
    } else if (op.kind === 'health-event') {
      const p = op.payload as HealthEventOpPayload;
      await sendDeclaration(op.farmId, { ...p, payload: { ...p.payload, idempotencyKey: p.payload.idempotencyKey ?? op.id } });
    } else if (op.kind === 'delivery-confirm') {
      const p = op.payload as DeliveryConfirmOpPayload;
      await confirmDelivery(op.farmId, p.deliveryId, { ...p.payload, idempotencyKey: p.payload.idempotencyKey ?? op.id });
    } else if (op.kind === 'sortie') {
      const p = op.payload as SortieOpPayload;
      await sendSortie(op.farmId, { ...p, payload: { ...p.payload, idempotencyKey: p.payload.idempotencyKey ?? op.id } });
    } else if (op.kind === 'farm-gps') {
      // Ops queued before the key existed fall back to op.id.
      const gps = (op.payload as { payload: FarmGpsPayload }).payload;
      await setFarmGps(op.farmId, { ...gps, idempotencyKey: gps.idempotencyKey ?? op.id });
    } else if (op.kind === 'treatment') {
      const p = op.payload as TreatmentOpPayload;
      await createTreatment(op.farmId, p.batchId, { ...p.payload, idempotencyKey: p.payload.idempotencyKey ?? op.id });
    } else if (op.kind === 'prophylaxis-complete') {
      const p = op.payload as CareCompletionOpPayload;
      await completeProphylaxis(op.farmId, p.batchId, p.eventId, {
        ...p.payload,
        idempotencyKey: p.payload.idempotencyKey ?? op.id,
      });
    } else {
      // Credit sale (no payment): no caisse needed, same as the live path.
      if (isCashOp(op)) await ensureCashOpenOrRetry(op);
      await createSale(op.farmId, op.payload as SalePayload);
    }
    return 'ok';
  } catch (e) {
    if (e instanceof CashBlockedError) return 'skip';
    if (shouldDrop(e)) {
      // A refused declaration is re-entered by hand: its kept photo copies go.
      if (op.kind === 'health-event') ((op.payload as HealthEventOpPayload).photos ?? []).forEach(discardPhoto);
      if (isCashOp(op) || isCreation(op)) {
        rejectOp(op, (e as ApiError).message);
        return 'rejected';
      }
      return 'dropped';
    }
    if (e instanceof ApiError && e.status >= 500) return 'failed';
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
async function ensureCashOpenOrRetry(op: OfflineOp): Promise<void> {
  try {
    await ensureCashOpen(op.farmId, op.createdAt);
    setHeldByClosedCaisse(op.id, false);
  } catch (e) {
    if (e instanceof CaisseClosedSinceError) setHeldByClosedCaisse(op.id, true);
    // Network failure: plain retry. Caisse refused (closed since this cash was
    // collected, no permission): skip this op but keep flushing the rest of the
    // queue behind it. It goes out once someone opens the caisse.
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
  /** Farms whose queued ops reached the server (to refresh each of them). */
  farmIds: string[];
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
  const farmIds = new Set<string>();
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
      if (!ownedByCurrentUser(op)) {
        // Another account's op: kept for that user, never sent with our token.
        skipped.add(op.id);
        continue;
      }
      let result = await processOne(op);
      if (result === 'failed') {
        // A payload the server keeps failing on must not block every op
        // behind it forever. Cash is never given up: it stays queued but is
        // passed over; other ops go to the rejected list.
        if (bumpAttempts(op.id) < MAX_SERVER_ATTEMPTS) {
          result = 'retry';
        } else if (isCashOp(op)) {
          result = 'skip';
        } else {
          rejectOp(op, 'Le serveur échoue à répétition sur cette opération.');
          result = 'rejected';
        }
      }
      if (result === 'ok') {
        removeOp(op.id);
        roundSynced += 1;
        farmIds.add(op.farmId);
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
  return { ...total, remaining: loadOps().length, farmIds: [...farmIds] };
}