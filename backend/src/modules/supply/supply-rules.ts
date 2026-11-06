import { InputDeliveryStatus } from '../../common/enums/input-delivery.enum.js';
import type { FeedPhase } from '../../common/enums/feed-phase.enum.js';

/**
 * Pure rules of programme input deliveries (POUFA L4, CDC features 16-17):
 * codes, units, subsidy split, status transitions and the declarative stock.
 * No I/O: unit-tested in `supply-rules.spec.ts`.
 */

/** INTRANT families (`ref-list-families.ts`). */
export const INTRANT_FAMILY = {
  POUSSIN: 'POUSSIN',
  ALIMENT: 'ALIMENT',
  VACCIN: 'VACCIN',
  MEDICAMENT: 'MEDICAMENT',
  AUTRE: 'AUTRE',
} as const;

/** Delivery code: farm code + `L` + 2-digit rank (`G1-0012-L03`); widens past 99. */
export function deliveryCode(farmCode: string, rank: number): string {
  if (!Number.isSafeInteger(rank) || rank < 1) {
    throw new RangeError(`Invalid delivery rank: ${rank}`);
  }
  return `${farmCode}-L${String(rank).padStart(2, '0')}`;
}

/** `IdCounter` scope of the delivery ranks of a farm. */
export function deliveryCounterScope(farmCode: string): string {
  return `LIVRAISON:${farmCode}`;
}

/** Default bag weight when neither the line, the unit nor the farm gives one. */
export const DEFAULT_BAG_KG = 50;

/** Seeded UNITE codes with a mass (used when the item carries no `meta`). */
const SEEDED_KG_PER_UNIT: Readonly<Record<string, number>> = {
  KG: 1,
  TONNE: 1000,
};
const SEEDED_BAG_UNITS: readonly string[] = ['SAC'];

export interface UnitItem {
  code: string;
  meta?: Record<string, unknown> | null;
}

function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** Whether the unit is a bag whose weight comes from the line or the farm. */
export function isBagUnit(unit: UnitItem): boolean {
  if (positive(unit.meta?.kgPerUnit) != null) return false;
  return unit.meta?.bag === true || SEEDED_BAG_UNITS.includes(unit.code);
}

/**
 * Kilograms in one `unit`, or null for a unit without a mass (head, dose,
 * bottle, litre). UNITE items have no family: an item declares its mass with
 * `meta.kgPerUnit` (or `meta.bag: true` for a bag of variable weight); the
 * seeded KG, TONNE and SAC items are known without meta.
 */
export function kgPerUnit(
  unit: UnitItem,
  bagSizeKg?: number | null,
  farmSacKg?: number | null,
): number | null {
  const declared = positive(unit.meta?.kgPerUnit);
  if (declared != null) return declared;
  if (isBagUnit(unit)) {
    return positive(bagSizeKg) ?? positive(farmSacKg) ?? DEFAULT_BAG_KG;
  }
  return SEEDED_KG_PER_UNIT[unit.code] ?? null;
}

export interface SubsidySplit {
  /** Value of the received quantity before subsidy. */
  grossFcfa: number;
  /** What the farm pays (booked as the lot's expense). */
  farmerCostFcfa: number;
  /** Subsidy, kept apart from the farm's charges. */
  subsidyFcfa: number;
}

/**
 * Integer FCFA split of a received quantity: farmer = round(gross × (1 −
 * rate)), subsidy = gross − farmer, so both always add up to the gross value.
 * Null when the line has no unit value.
 */
export function subsidySplit(
  receivedQuantity: number,
  unitValueFcfa: number | null,
  subsidized: boolean,
  subsidyRate: number | null,
): SubsidySplit | null {
  if (unitValueFcfa == null) return null;
  const grossFcfa = Math.round(receivedQuantity * unitValueFcfa);
  const rate = subsidized ? Math.min(100, Math.max(0, subsidyRate ?? 0)) : 0;
  const farmerCostFcfa = Math.round((grossFcfa * (100 - rate)) / 100);
  return { grossFcfa, farmerCostFcfa, subsidyFcfa: grossFcfa - farmerCostFcfa };
}

const EPSILON = 1e-9;

export function isDiscrepancy(shipped: number, received: number): boolean {
  return Math.abs(shipped - received) > EPSILON;
}

/** French reason why a delivery cannot be confirmed, or null. */
export function confirmRefusal(status: InputDeliveryStatus): string | null {
  if (status === InputDeliveryStatus.CONFIRMEE) {
    return 'Cette livraison est déjà confirmée.';
  }
  if (status === InputDeliveryStatus.ANNULEE) {
    return 'Cette livraison a été annulée : elle ne peut plus être confirmée.';
  }
  return null;
}

/** French reason why a delivery cannot be cancelled, or null. */
export function cancelRefusal(status: InputDeliveryStatus): string | null {
  if (status === InputDeliveryStatus.CONFIRMEE) {
    return "Livraison déjà confirmée par l'éleveur : elle ne peut plus être annulée.";
  }
  if (status === InputDeliveryStatus.ANNULEE) {
    return 'Cette livraison est déjà annulée.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Declarative stock (CDC « stock = reçu − utilisé »)
// ---------------------------------------------------------------------------

/** A confirmed delivery line, its received quantity in the stock unit. */
export interface DeclarativeLine {
  intrantCode: string;
  intrantFamily: string;
  /** UNITE code of the line (the stock unit of VACCIN/MEDICAMENT/AUTRE). */
  unitCode: string;
  feedPhase: FeedPhase | null;
  /** Received, in the stock unit: kg (ALIMENT), heads (POUSSIN), else the line unit. */
  received: number;
  shippedAt: string;
  inputLotId: string | null;
}

/** What Fermia recorded against one lot created by a delivery (stock unit). */
export interface LotUsage {
  /** Daily-entry feed (ALIMENT) or care doses taken out of the lot (others). */
  consumed: number;
  /** Feed losses recorded on the lot. */
  lost: number;
  /** Feed sold out of the lot or transferred to a shop. */
  sold: number;
  /** Physical FEFO stock left on the lot (never negative). */
  physical: number;
}

/** Use recorded with no delivery lot behind it. */
export interface UnlinkedUse {
  /** Daily-entry feed (kg) with no lot, by effective phase and day. */
  feed: ReadonlyArray<{ phase: FeedPhase; date: string; kg: number }>;
  /** Chicks placed (bands opened: heads at start), by opening day. */
  chicks: ReadonlyArray<{ date: string; heads: number }>;
}

export interface DeclarativeRow {
  /** `intrantCode` (POUSSIN, ALIMENT) or `intrantCode|unitCode`. */
  key: string;
  intrantCode: string;
  intrantFamily: string;
  /** Stock unit: `KG` (ALIMENT), `TETE` (POUSSIN) or the line's UNITE code. */
  unitCode: string;
  /** Phases of the ALIMENT lines (FEFO stock by phase). */
  feedPhases: FeedPhase[];
  /** Earliest shipping day: use recorded before it is not counted. */
  trackedSince: string;
  received: number;
  consumed: number;
  lost: number;
  sold: number;
  used: number;
  /** received − used: may be negative (advisory alert, never blocking). */
  stock: number;
  /** Physical FEFO stock left on the delivery lots (null for chicks). */
  physicalStock: number | null;
  negative: boolean;
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function declarativeKey(line: {
  intrantCode: string;
  intrantFamily: string;
  unitCode: string;
}): string {
  return line.intrantFamily === INTRANT_FAMILY.POUSSIN ||
    line.intrantFamily === INTRANT_FAMILY.ALIMENT
    ? line.intrantCode
    : `${line.intrantCode}|${line.unitCode}`;
}

type Acc = Omit<DeclarativeRow, 'used' | 'stock' | 'negative'>;

/**
 * Declarative stock per intrant = received (confirmed deliveries) − used,
 * computed apart from the physical FEFO stock (which never goes negative).
 * « Used » is what Fermia already records:
 * - against the lots the deliveries created: daily-entry feed, feed losses,
 *   feed sales and shop transfers (ALIMENT); care doses taken out of the lot
 *   (VACCIN, MEDICAMENT, AUTRE);
 * - with no lot at all, counted from the intrant's first shipping day: feed
 *   typed in a daily entry while the phase had no stock (to the ALIMENT
 *   intrant of that phase last shipped), and chicks placed in the bands
 *   opened (to the POUSSIN intrant last shipped).
 * Use recorded on lots the farm received outside the programme never counts.
 */
export function computeDeclarativeStock(
  lines: readonly DeclarativeLine[],
  lotUsage: ReadonlyMap<string, LotUsage>,
  unlinked: UnlinkedUse,
): DeclarativeRow[] {
  const rows = new Map<string, Acc>();
  /** Latest shipping day per row (attribution of the unlinked use). */
  const lastShipped = new Map<Acc, string>();
  for (const line of lines) {
    const key = declarativeKey(line);
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        intrantCode: line.intrantCode,
        intrantFamily: line.intrantFamily,
        unitCode:
          line.intrantFamily === INTRANT_FAMILY.ALIMENT
            ? 'KG'
            : line.intrantFamily === INTRANT_FAMILY.POUSSIN
              ? 'TETE'
              : line.unitCode,
        feedPhases: [],
        trackedSince: line.shippedAt,
        received: 0,
        consumed: 0,
        lost: 0,
        sold: 0,
        physicalStock: line.intrantFamily === INTRANT_FAMILY.POUSSIN ? null : 0,
      };
      rows.set(key, row);
      lastShipped.set(row, line.shippedAt);
    }
    row.received += line.received;
    if (line.shippedAt < row.trackedSince) row.trackedSince = line.shippedAt;
    if (line.shippedAt > (lastShipped.get(row) ?? '')) {
      lastShipped.set(row, line.shippedAt);
    }
    if (line.feedPhase && !row.feedPhases.includes(line.feedPhase)) {
      row.feedPhases.push(line.feedPhase);
    }
    const usage = line.inputLotId ? lotUsage.get(line.inputLotId) : undefined;
    if (usage) {
      row.consumed += usage.consumed;
      row.lost += usage.lost;
      row.sold += usage.sold;
      if (row.physicalStock != null) row.physicalStock += usage.physical;
    }
  }

  const all = [...rows.values()];
  /** The row last shipped among `candidates` (ties: smallest code). */
  const target = (candidates: Acc[]): Acc | null =>
    candidates.length === 0
      ? null
      : candidates.reduce((best, r) => {
          const a = lastShipped.get(r) ?? '';
          const b = lastShipped.get(best) ?? '';
          return a > b || (a === b && r.intrantCode < best.intrantCode)
            ? r
            : best;
        });
  const since = (candidates: Acc[]): string =>
    candidates.reduce(
      (min, r) => (r.trackedSince < min ? r.trackedSince : min),
      candidates[0].trackedSince,
    );

  const phases = new Set(unlinked.feed.map((f) => f.phase));
  for (const phase of phases) {
    const candidates = all.filter(
      (r) =>
        r.intrantFamily === INTRANT_FAMILY.ALIMENT &&
        r.feedPhases.includes(phase),
    );
    const row = target(candidates);
    if (!row) continue;
    const start = since(candidates);
    for (const f of unlinked.feed) {
      if (f.phase === phase && f.date >= start) row.consumed += f.kg;
    }
  }
  const chickRows = all.filter(
    (r) => r.intrantFamily === INTRANT_FAMILY.POUSSIN,
  );
  const chickRow = target(chickRows);
  if (chickRow) {
    const start = since(chickRows);
    for (const c of unlinked.chicks) {
      if (c.date >= start) chickRow.consumed += c.heads;
    }
  }

  return all
    .map((r): DeclarativeRow => {
      const used = round3(r.consumed + r.lost + r.sold);
      const stock = round3(r.received - used);
      return {
        ...r,
        received: round3(r.received),
        consumed: round3(r.consumed),
        lost: round3(r.lost),
        sold: round3(r.sold),
        used,
        stock,
        physicalStock: r.physicalStock == null ? null : round3(r.physicalStock),
        negative: stock < 0,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}
