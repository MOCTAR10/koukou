import type { DeliverySource, DeliveryView, FeedPhaseCode, ListItemWithMeta, OpenBandHint } from '../../api/types-supply';

/**
 * Pure rules of the programme input deliveries (POUFA L4), mirroring the
 * server (`backend/src/modules/supply/supply-rules.ts` and
 * `input-deliveries.service.ts`) so the form says what is wrong before
 * posting. The server stays the authority: its French message is shown when it
 * refuses anyway.
 */

export const MAX_DELIVERY_LINES = 50;
export const DEFAULT_BAG_KG = 50;
export const STATE_SUPPLIER_LABEL = 'État / SMAG';

export const FEED_PHASE_CODES: readonly FeedPhaseCode[] = [
  'POUSSIN',
  'DEMARRAGE',
  'CROISSANCE',
  'FINITION',
  'PRE_PONTE',
  'PONTE_PHASE_1',
  'PONTE_PHASE_2',
  'PONTE_PHASE_3',
  'PERSONNALISE',
];

export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  EXPEDIEE: 'À confirmer',
  CONFIRMEE: 'Confirmée',
  ANNULEE: 'Annulée',
};

export const DELIVERY_SOURCE_LABEL: Record<DeliverySource, string> = {
  ETAT_SMAG: 'État / SMAG',
  AUTRE: 'Autre fournisseur',
};

export const INTRANT_FAMILY_LABEL: Record<string, string> = {
  POUSSIN: 'Poussins',
  ALIMENT: 'Aliment',
  VACCIN: 'Vaccin',
  MEDICAMENT: 'Médicament',
  AUTRE: 'Autre',
};

const SEEDED_KG_PER_UNIT: Readonly<Record<string, number>> = { KG: 1, TONNE: 1000 };
const SEEDED_BAG_UNITS: readonly string[] = ['SAC'];

function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** Whether the unit is a bag whose weight comes from the line or the farm (server `isBagUnit`). */
export function isBagUnit(unit: Pick<ListItemWithMeta, 'code' | 'meta'>): boolean {
  if (positive(unit.meta?.kgPerUnit) != null) return false;
  return unit.meta?.bag === true || SEEDED_BAG_UNITS.includes(unit.code);
}

/** Kilograms in one unit, or null for a unit without a mass (server `kgPerUnit`). */
export function kgPerUnit(
  unit: Pick<ListItemWithMeta, 'code' | 'meta'>,
  bagSizeKg?: number | null,
  farmSacKg?: number | null,
): number | null {
  const declared = positive(unit.meta?.kgPerUnit);
  if (declared != null) return declared;
  if (isBagUnit(unit)) return positive(bagSizeKg) ?? positive(farmSacKg) ?? DEFAULT_BAG_KG;
  return SEEDED_KG_PER_UNIT[unit.code] ?? null;
}

/** Whether a unit can count feed (it has a mass). */
export function isMassUnit(unit: Pick<ListItemWithMeta, 'code' | 'meta'>): boolean {
  return kgPerUnit(unit) != null;
}

/** Default phase of an ALIMENT intrant (`meta.feedPhase`), as the server applies it. */
export function metaFeedPhase(intrant: Pick<ListItemWithMeta, 'meta'> | undefined): FeedPhaseCode | null {
  const v = intrant?.meta?.feedPhase;
  return typeof v === 'string' && (FEED_PHASE_CODES as readonly string[]).includes(v) ? (v as FeedPhaseCode) : null;
}

/**
 * A typed number: `''` → undefined, a French decimal comma accepted,
 * anything else unreadable → NaN.
 */
export function parseDecimal(raw: string): number | undefined {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return undefined;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

/** A YYYY-MM-DD day (the date inputs' value). */
export function isIsoDay(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

/** Server `isAfterTomorrowUtc`: tomorrow is tolerated (time zones). */
export function isAfterTomorrow(day: string, todayUtc: string): boolean {
  const d = new Date(`${todayUtc}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return day > d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// The « Nouvelle livraison » form
// ---------------------------------------------------------------------------

export interface LineDraft {
  /** Local row key (React). */
  key: string;
  intrantCode: string;
  unitCode: string;
  quantity: string;
  feedPhase: string;
  bagSizeKg: string;
  subsidized: boolean;
  subsidyRate: string;
  unitValueFcfa: string;
  supplierLotNumber: string;
  expirationDate: string;
}

export interface DeliveryDraft {
  farmId: string;
  bandId: string;
  source: DeliverySource;
  supplierName: string;
  shippedAt: string;
  notes: string;
  lines: LineDraft[];
}

export function emptyLine(key: string): LineDraft {
  return {
    key,
    intrantCode: '',
    unitCode: '',
    quantity: '',
    feedPhase: '',
    bagSizeKg: '',
    subsidized: false,
    subsidyRate: '',
    unitValueFcfa: '',
    supplierLotNumber: '',
    expirationDate: '',
  };
}

export interface DeliveryLinePayload {
  intrantCode: string;
  unitCode: string;
  quantity: number;
  feedPhase?: FeedPhaseCode;
  bagSizeKg?: number;
  subsidized?: boolean;
  subsidyRate?: number;
  unitValueFcfa?: number;
  supplierLotNumber?: string;
  expirationDate?: string;
}

export interface DeliveryPayload {
  farmId: string;
  bandId?: string;
  source: DeliverySource;
  supplierName?: string;
  shippedAt: string;
  notes?: string;
  lines: DeliveryLinePayload[];
}

export interface ItemsByCode {
  intrants: ReadonlyMap<string, ListItemWithMeta>;
  units: ReadonlyMap<string, ListItemWithMeta>;
}

export function itemsByCode(intrants: readonly ListItemWithMeta[], units: readonly ListItemWithMeta[]): ItemsByCode {
  return {
    intrants: new Map(intrants.filter((i) => i.active).map((i) => [i.code, i])),
    units: new Map(units.filter((u) => u.active).map((u) => [u.code, u])),
  };
}

/** Units offered for an intrant: mass units for feed, units without a mass for chicks, any for the rest. */
export function unitsFor(family: string | null | undefined, units: readonly ListItemWithMeta[]): ListItemWithMeta[] {
  const active = units.filter((u) => u.active);
  if (family === 'ALIMENT') return active.filter(isMassUnit);
  if (family === 'POUSSIN') return active.filter((u) => !isMassUnit(u));
  return active;
}

/** Errors of one line (French, without the « Ligne n » prefix), and its payload when valid. */
export function validateLine(
  line: LineDraft,
  items: ItemsByCode,
): { errors: string[]; payload: DeliveryLinePayload | null } {
  const errors: string[] = [];
  const intrant = items.intrants.get(line.intrantCode);
  const unit = items.units.get(line.unitCode);
  if (!line.intrantCode) errors.push("choisissez l'intrant");
  else if (!intrant || !intrant.family) errors.push('intrant inconnu ou inactif');
  if (!line.unitCode) errors.push("choisissez l'unité");
  else if (!unit) errors.push('unité inconnue ou inactive');

  const quantity = parseDecimal(line.quantity);
  if (quantity == null) errors.push('indiquez la quantité expédiée');
  else if (Number.isNaN(quantity) || quantity < 0.001) errors.push('la quantité expédiée doit être positive');

  const family = intrant?.family ?? null;
  let feedPhase: FeedPhaseCode | null = null;
  if (family === 'ALIMENT') {
    if (unit && !isMassUnit(unit)) errors.push(`l'aliment se compte en masse (kg, tonne, sac), pas en « ${unit.label} »`);
    feedPhase = (FEED_PHASE_CODES as readonly string[]).includes(line.feedPhase)
      ? (line.feedPhase as FeedPhaseCode)
      : metaFeedPhase(intrant);
    if (!feedPhase) errors.push("indiquez la phase de l'aliment (démarrage, croissance, finition…)");
  }
  if (family === 'POUSSIN') {
    if (unit && isMassUnit(unit)) errors.push(`les poussins se comptent par tête, pas en « ${unit.label} »`);
    if (quantity != null && !Number.isNaN(quantity) && !Number.isInteger(quantity)) {
      errors.push('le nombre de poussins doit être un entier');
    }
  }

  const bag = parseDecimal(line.bagSizeKg);
  const bagApplies = !!unit && isBagUnit(unit);
  if (bagApplies && bag != null && (Number.isNaN(bag) || bag < 0.1 || bag > 1000)) {
    errors.push('le poids du sac doit être compris entre 0,1 et 1 000 kg');
  }

  const rate = parseDecimal(line.subsidyRate);
  if (line.subsidized) {
    if (rate == null) errors.push("indiquez le taux de subvention de l'intrant subventionné");
    else if (Number.isNaN(rate) || rate < 0.01 || rate > 100) errors.push('le taux de subvention est compris entre 0,01 et 100 %');
  }

  const value = parseDecimal(line.unitValueFcfa);
  if (value != null && (Number.isNaN(value) || !Number.isInteger(value) || value < 0)) {
    errors.push('la valeur unitaire est un entier positif (FCFA)');
  }
  if (line.expirationDate && !isIsoDay(line.expirationDate)) errors.push('date de péremption invalide');

  if (errors.length > 0 || !intrant || !unit || quantity == null) return { errors, payload: null };
  const payload: DeliveryLinePayload = { intrantCode: intrant.code, unitCode: unit.code, quantity };
  if (feedPhase) payload.feedPhase = feedPhase;
  if (bagApplies && bag != null) payload.bagSizeKg = bag;
  if (line.subsidized) {
    payload.subsidized = true;
    payload.subsidyRate = rate;
  }
  if (value != null) payload.unitValueFcfa = value;
  if (line.supplierLotNumber.trim()) payload.supplierLotNumber = line.supplierLotNumber.trim();
  if (line.expirationDate) payload.expirationDate = line.expirationDate;
  return { errors, payload };
}

/** Every error of the form (French, line-prefixed), and the request body when there is none. */
export function validateDelivery(
  draft: DeliveryDraft,
  items: ItemsByCode,
  todayUtc: string,
): { errors: string[]; payload: DeliveryPayload | null } {
  const errors: string[] = [];
  if (!draft.farmId) errors.push('Choisissez la ferme destinataire.');
  if (!draft.shippedAt || !isIsoDay(draft.shippedAt)) errors.push("Indiquez la date d'expédition.");
  else if (isAfterTomorrow(draft.shippedAt, todayUtc)) errors.push("La date d'expédition ne peut pas être dans le futur.");
  const supplierName = draft.supplierName.trim();
  if (draft.source === 'AUTRE' && !supplierName) errors.push('Indiquez le fournisseur pour une livraison hors État / SMAG.');
  if (draft.lines.length === 0) errors.push('Une livraison compte au moins une ligne.');
  if (draft.lines.length > MAX_DELIVERY_LINES) errors.push(`Au plus ${MAX_DELIVERY_LINES} lignes par livraison.`);
  const lines: DeliveryLinePayload[] = [];
  draft.lines.forEach((line, i) => {
    const res = validateLine(line, items);
    for (const e of res.errors) errors.push(`Ligne ${i + 1} : ${e}.`);
    if (res.payload) lines.push(res.payload);
  });
  if (errors.length > 0) return { errors, payload: null };
  const payload: DeliveryPayload = { farmId: draft.farmId, source: draft.source, shippedAt: draft.shippedAt, lines };
  if (draft.bandId) payload.bandId = draft.bandId;
  if (supplierName) payload.supplierName = supplierName;
  if (draft.notes.trim()) payload.notes = draft.notes.trim();
  return { errors, payload };
}

/** Integer FCFA split, as the server books it (`subsidySplit`). */
export function subsidySplit(
  quantity: number,
  unitValueFcfa: number | null | undefined,
  subsidized: boolean,
  subsidyRate: number | null | undefined,
): { grossFcfa: number; farmerCostFcfa: number; subsidyFcfa: number } | null {
  if (unitValueFcfa == null) return null;
  const grossFcfa = Math.round(quantity * unitValueFcfa);
  const rate = subsidized ? Math.min(100, Math.max(0, subsidyRate ?? 0)) : 0;
  const farmerCostFcfa = Math.round((grossFcfa * (100 - rate)) / 100);
  return { grossFcfa, farmerCostFcfa, subsidyFcfa: grossFcfa - farmerCostFcfa };
}

/** Preview of the form's totals (valid lines with a unit value only). */
export function draftTotals(lines: readonly DeliveryLinePayload[]): { shippedValueFcfa: number; farmerCostFcfa: number; subsidyFcfa: number } {
  return lines.reduce(
    (acc, l) => {
      const split = subsidySplit(l.quantity, l.unitValueFcfa, l.subsidized === true, l.subsidyRate);
      if (!split) return acc;
      return {
        shippedValueFcfa: acc.shippedValueFcfa + split.grossFcfa,
        farmerCostFcfa: acc.farmerCostFcfa + split.farmerCostFcfa,
        subsidyFcfa: acc.subsidyFcfa + split.subsidyFcfa,
      };
    },
    { shippedValueFcfa: 0, farmerCostFcfa: 0, subsidyFcfa: 0 },
  );
}

/** What the farm will pay and the subsidy of a delivery not yet confirmed (on the shipped quantities). */
export function expectedSplit(delivery: Pick<DeliveryView, 'lines'>): { farmerCostFcfa: number; subsidyFcfa: number } {
  return delivery.lines.reduce(
    (acc, l) => {
      const split = subsidySplit(l.receivedQuantity ?? l.quantity, l.unitValueFcfa, l.subsidized, l.subsidyRate);
      return split
        ? { farmerCostFcfa: acc.farmerCostFcfa + split.farmerCostFcfa, subsidyFcfa: acc.subsidyFcfa + split.subsidyFcfa }
        : acc;
    },
    { farmerCostFcfa: 0, subsidyFcfa: 0 },
  );
}

/** Cancellation reason: at least 3 characters (server `@MinLength(3)`). */
export function cancelReasonError(reason: string): string | null {
  return reason.trim().length >= 3 ? null : 'Le motif de l’annulation est obligatoire (3 caractères au moins).';
}

/** Hint to open the band after chicks were received without a band (server `openBandHint`). */
export function openBandHintOf(view: DeliveryView): OpenBandHint | null {
  if (view.status !== 'CONFIRMEE' || view.band) return null;
  const chicks = view.lines.filter((l) => l.intrantFamily === 'POUSSIN' && (l.receivedQuantity ?? 0) > 0);
  if (chicks.length === 0) return null;
  const heads = chicks.reduce((s, l) => s + (l.receivedQuantity ?? 0), 0);
  const booked = chicks.some((l) => (l.farmerCostFcfa ?? 0) > 0);
  return {
    message: `${heads} poussins reçus : ouvrez la bande avec ces données, puis rattachez-la à la livraison ${view.code}.${
      booked ? ' Leur coût est déjà en dépense : ne saisissez pas de prix du poussin.' : ''
    }`,
    deliveryId: view.id,
    quantityAtStart: heads,
    integrationDate: view.receivedDate ?? view.shippedAt,
    couvoirSupplier: view.supplierName ?? STATE_SUPPLIER_LABEL,
    chickLotNumber: chicks[0]?.supplierLotNumber ?? view.code,
    chickCostBooked: booked,
  };
}

/** Quantity of a line with its unit, for tables (`12 sac`, `500 tête`). */
export function lineQuantityLabel(quantity: number, unit: { unitLabel: string | null; unitCode: string }): string {
  const n = Number.isInteger(quantity) ? quantity.toLocaleString('fr-FR') : quantity.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
  return `${n} ${(unit.unitLabel ?? unit.unitCode).toLowerCase()}`;
}
