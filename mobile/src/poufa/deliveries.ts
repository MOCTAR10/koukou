// Input delivery confirmation (CDC 17-18). Pure rules mirroring the backend
// `input-deliveries.service.ts` (confirm, openBandHint) so the farmer is told
// before sending, and offline, what the server would refuse.
import type {
  ConfirmDeliveryPayload,
  DeclarativeStockRow,
  DeliveryLineView,
  DeliveryView,
  InputDeliveryStatus,
  OpenBandHint,
} from '@/api/poufa';

export const DELIVERY_STATUS_LABEL: Record<InputDeliveryStatus, string> = {
  EXPEDIEE: 'À confirmer',
  CONFIRMEE: 'Confirmée',
  ANNULEE: 'Annulée',
};

/** Backend `STATE_SUPPLIER_LABEL`. */
const STATE_SUPPLIER = 'État / SMAG';

export function deliverySupplier(view: Pick<DeliveryView, 'source' | 'supplierName'>): string {
  return view.supplierName ?? (view.source === 'ETAT_SMAG' ? STATE_SUPPLIER : 'Autre fournisseur');
}

/** Deliveries waiting for the farmer, oldest shipping first. */
export function pendingDeliveries(list: readonly DeliveryView[]): DeliveryView[] {
  return list
    .filter((d) => d.status === 'EXPEDIEE')
    .slice()
    .sort((a, b) => a.shippedAt.localeCompare(b.shippedAt) || a.code.localeCompare(b.code));
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Same rule as the backend `isDiscrepancy` (supply-rules.ts). */
export function isDiscrepancy(shipped: number, received: number): boolean {
  return Math.abs(shipped - received) > 1e-9;
}

export interface LineDraft {
  lineId: string;
  position: number;
  label: string;
  unit: string;
  family: string;
  shipped: number;
  /** As typed (French decimal comma accepted). */
  received: string;
  reason: string;
}

export function lineLabel(line: DeliveryLineView): string {
  return line.intrantLabel ?? line.intrantCode;
}

/** One draft per line, received = shipped by default. */
export function initialDrafts(view: DeliveryView): LineDraft[] {
  return view.lines
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      lineId: l.id,
      position: l.position,
      label: lineLabel(l),
      unit: l.unitLabel ?? l.unitCode,
      family: l.intrantFamily,
      shipped: l.quantity,
      received: String(l.quantity).replace('.', ','),
      reason: '',
    }));
}

/** Parses a typed quantity (`12,5` or `12.5`); null when not a number ≥ 0. */
export function parseQuantity(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * First French refusal of a confirmation, or null. Mirrors the server:
 * received ≥ 0, whole chicks, a reason of ≥ 3 characters when received ≠
 * shipped, reception not in the future (tomorrow tolerated) nor before the
 * shipping day.
 */
export function confirmRefusal(input: {
  drafts: readonly LineDraft[];
  receivedDate: string;
  shippedAt: string;
  today: string;
}): string | null {
  const { drafts, receivedDate, shippedAt, today } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) return 'Date de réception invalide.';
  if (receivedDate > addDay(today)) return 'La date de réception ne peut pas être dans le futur.';
  if (receivedDate < shippedAt.slice(0, 10)) {
    return `La réception ne peut pas précéder l'expédition (${shippedAt.slice(0, 10)}).`;
  }
  for (const d of drafts) {
    const where = `Ligne ${d.position} (${d.label})`;
    const received = parseQuantity(d.received);
    if (received == null) return `${where} : quantité reçue invalide.`;
    if (d.family === 'POUSSIN' && !Number.isInteger(received)) {
      return `${where} : le nombre de poussins reçus doit être un entier.`;
    }
    if (isDiscrepancy(d.shipped, received) && d.reason.trim().length < 3) {
      return `${where} : reçu ${round3(received)} pour ${round3(d.shipped)} expédié, indiquez le motif de l'écart.`;
    }
  }
  return null;
}

/** Body of POST …/confirm: every line, with its reason only when it differs. */
export function buildConfirmPayload(drafts: readonly LineDraft[], receivedDate: string): ConfirmDeliveryPayload {
  return {
    receivedDate,
    lines: drafts.map((d) => {
      const received = parseQuantity(d.received) ?? d.shipped;
      return {
        lineId: d.lineId,
        receivedQuantity: received,
        ...(isDiscrepancy(d.shipped, received) ? { discrepancyReason: d.reason.trim() } : {}),
      };
    }),
  };
}

function addDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Mirror of the backend `openBandHint`: chicks received on a confirmed
 * delivery with no band yet. Lets the list offer « Ouvrir la bande » even when
 * the confirmation was queued offline and its answer never seen.
 */
export function openBandHintOf(view: DeliveryView): OpenBandHint | null {
  if (view.status !== 'CONFIRMEE' || view.band) return null;
  const chicks = view.lines.filter((l) => l.intrantFamily === 'POUSSIN' && (l.receivedQuantity ?? 0) > 0);
  if (chicks.length === 0) return null;
  const heads = chicks.reduce((s, l) => s + (l.receivedQuantity ?? 0), 0);
  const booked = chicks.some((l) => (l.farmerCostFcfa ?? 0) > 0);
  return {
    message: `${heads} poussins reçus : ouvrez la bande avec ces données, puis rattachez-la à la livraison ${view.code}.${booked ? ' Leur coût est déjà en dépense : ne saisissez pas de prix du poussin.' : ''}`,
    deliveryId: view.id,
    quantityAtStart: heads,
    integrationDate: view.receivedDate ?? view.shippedAt,
    couvoirSupplier: deliverySupplier(view),
    chickLotNumber: chicks[0].supplierLotNumber ?? view.code,
    chickCostBooked: booked,
  };
}

/** Quantity for display: up to 3 decimals, French format. */
export function fmtQty(n: number | null | undefined, unit?: string | null): string {
  if (n == null) return '—';
  const s = n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
  return unit ? `${s} ${unit}` : s;
}

/** Declarative stock rows: negative ones first, then by label. */
export function sortStockRows(rows: readonly DeclarativeStockRow[]): DeclarativeStockRow[] {
  return rows
    .slice()
    .sort(
      (a, b) =>
        Number(b.negative) - Number(a.negative) ||
        (a.intrantLabel ?? a.intrantCode).localeCompare(b.intrantLabel ?? b.intrantCode, 'fr'),
    );
}
