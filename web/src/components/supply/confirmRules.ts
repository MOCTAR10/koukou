import type { DeliveryLineView, DeliveryView } from '../../api/types-supply';
import { isAfterTomorrow, isIsoDay, parseDecimal } from './deliveryRules';

/**
 * The farmer's reception of a programme delivery (`POST
 * /farms/:farmId/input-deliveries/:id/confirm`), mirroring the server: received
 * quantity per line (default = shipped), a reason (3 characters at least) when
 * it differs, chicks counted in whole heads, a reception day neither in the
 * future nor before the shipping day.
 */

export interface ConfirmLineDraft {
  lineId: string;
  received: string;
  reason: string;
  supplierLotNumber: string;
  expirationDate: string;
}

export interface ConfirmLinePayload {
  lineId: string;
  receivedQuantity: number;
  discrepancyReason?: string;
  supplierLotNumber?: string;
  expirationDate?: string;
}

export interface ConfirmPayload {
  receivedDate: string;
  lines: ConfirmLinePayload[];
}

const EPSILON = 1e-9;

export function isDiscrepancy(shipped: number, received: number): boolean {
  return Math.abs(shipped - received) > EPSILON;
}

function asText(n: number): string {
  return String(n).replace('.', ',');
}

/** One draft per line, received = shipped. */
export function initialConfirmDrafts(delivery: Pick<DeliveryView, 'lines'>): ConfirmLineDraft[] {
  return delivery.lines.map((l) => ({
    lineId: l.id,
    received: asText(l.quantity),
    reason: '',
    supplierLotNumber: l.supplierLotNumber ?? '',
    expirationDate: l.expirationDate ?? '',
  }));
}

/** Whether a draft line differs from what was shipped (the reason field shows). */
export function draftDiffers(line: Pick<DeliveryLineView, 'quantity'>, draft: Pick<ConfirmLineDraft, 'received'>): boolean {
  const received = parseDecimal(draft.received);
  return received != null && !Number.isNaN(received) && isDiscrepancy(line.quantity, received);
}

/** Errors (French) and the request body when there is none. The idempotency key is added by the offline queue. */
export function buildConfirmPayload(
  delivery: Pick<DeliveryView, 'shippedAt' | 'lines' | 'status'>,
  drafts: readonly ConfirmLineDraft[],
  receivedDate: string,
  todayUtc: string,
): { errors: string[]; payload: ConfirmPayload | null } {
  const errors: string[] = [];
  if (delivery.status !== 'EXPEDIEE') {
    errors.push(delivery.status === 'CONFIRMEE' ? 'Cette livraison est déjà confirmée.' : 'Cette livraison a été annulée : elle ne peut plus être confirmée.');
  }
  if (!receivedDate || !isIsoDay(receivedDate)) errors.push('Indiquez la date de réception.');
  else if (isAfterTomorrow(receivedDate, todayUtc)) errors.push('La date de réception ne peut pas être dans le futur.');
  else if (receivedDate < delivery.shippedAt.slice(0, 10)) {
    errors.push(`La réception ne peut pas précéder l'expédition (${delivery.shippedAt.slice(0, 10)}).`);
  }
  const byId = new Map(drafts.map((d) => [d.lineId, d]));
  const lines: ConfirmLinePayload[] = [];
  for (const line of delivery.lines) {
    const draft = byId.get(line.id);
    const where = `Ligne ${line.position} (${line.intrantLabel ?? line.intrantCode})`;
    const received = draft ? parseDecimal(draft.received) : line.quantity;
    if (received == null) {
      errors.push(`${where} : indiquez la quantité reçue (0 si rien n'est arrivé).`);
      continue;
    }
    if (Number.isNaN(received) || received < 0) {
      errors.push(`${where} : la quantité reçue est un nombre positif ou nul.`);
      continue;
    }
    if (line.intrantFamily === 'POUSSIN' && !Number.isInteger(received)) {
      errors.push(`${where} : le nombre de poussins reçus doit être un entier.`);
    }
    const reason = draft?.reason.trim() ?? '';
    const differs = isDiscrepancy(line.quantity, received);
    if (differs && reason.length < 3) {
      errors.push(`${where} : reçu ${asText(received)} pour ${asText(line.quantity)} expédié, indiquez le motif de l'écart.`);
    }
    if (draft?.expirationDate && !isIsoDay(draft.expirationDate)) errors.push(`${where} : date de péremption invalide.`);
    const payload: ConfirmLinePayload = { lineId: line.id, receivedQuantity: received };
    if (differs) payload.discrepancyReason = reason;
    const lot = draft?.supplierLotNumber.trim() ?? '';
    if (lot && lot !== (line.supplierLotNumber ?? '')) payload.supplierLotNumber = lot;
    if (draft?.expirationDate && draft.expirationDate !== (line.expirationDate ?? '')) payload.expirationDate = draft.expirationDate;
    lines.push(payload);
  }
  if (errors.length > 0) return { errors, payload: null };
  return { errors, payload: { receivedDate, lines } };
}

/** Deliveries waiting for the farmer, oldest shipping first (what to receive next). */
export function pendingFirst<T extends Pick<DeliveryView, 'status' | 'shippedAt' | 'code'>>(rows: readonly T[]): T[] {
  const rank = (s: string) => (s === 'EXPEDIEE' ? 0 : 1);
  return rows.slice().sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    // Pending: oldest first; the rest: newest first.
    if (a.status === 'EXPEDIEE') return a.shippedAt.localeCompare(b.shippedAt) || a.code.localeCompare(b.code);
    return b.shippedAt.localeCompare(a.shippedAt) || b.code.localeCompare(a.code);
  });
}
