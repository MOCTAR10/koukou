import type { ProductionBatch, SlaughterOrder } from '@/api/types';

export type HorizonKind = 'today' | 'week' | 'month' | 'all' | 'custom';

export interface Horizon {
  kind: HorizonKind;
  /** Date au format YYYY-MM-DD — utilisée quand kind === 'custom'. */
  date?: string;
}

export interface OrderBucket {
  count: number;
  birds: number;
  kgCarcass: number;
}

export interface Pipeline {
  drafts: OrderBucket;
  sent: OrderBucket;
  processed: OrderBucket;
  cancelled: OrderBucket;
  openBirds: number;
}

export interface SpeciesWeightRef {
  /** Nombre d'ordres traités pesés ayant servi au calcul. */
  n: number;
  /** Poids vif moyen par oiseau (kg) pour l'espèce. */
  avgLiveKgPerBird: number;
}

export interface YieldRef {
  avgRendementPct: number | null;
  n: number;
}

export interface SlaughterRefs {
  /** Moyennes par espèces (clé Species). */
  weights: Record<string, SpeciesWeightRef>;
  yield: YieldRef;
}

export interface OrderProjection {
  estLiveKg: number | null;
  estCarcassKg: number | null;
  avgRendementPct: number | null;
  rendementN: number;
  remainingAfter: number;
}

export interface LotAvailability {
  alive: number;
  ordered: number;
  processed: number;
  remaining: number;
  overbooked: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(plannedDate: string, today: string): number {
  const a = new Date(`${plannedDate}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((a - b) / DAY_MS);
}

/** Un ordre appartient-il à l'horizon ? (dates comparées en UTC, format YYYY-MM-DD). */
export function inHorizon(horizon: Horizon, plannedDate: string, today: string): boolean {
  switch (horizon.kind) {
    case 'today':
      return plannedDate === today;
    case 'week':
      return Math.abs(daysBetween(plannedDate, today)) <= 7;
    case 'month':
      return Math.abs(daysBetween(plannedDate, today)) <= 30;
    case 'custom':
      return horizon.date != null && plannedDate === horizon.date;
    case 'all':
      return true;
  }
}

function emptyBucket(): OrderBucket {
  return { count: 0, birds: 0, kgCarcass: 0 };
}

/** Répartition des ordres non annulés par étape du pipeline, bornée par l'horizon. */
export function pipelineOrders(orders: SlaughterOrder[], horizon: Horizon, today: string): Pipeline {
  const drafts = emptyBucket();
  const sent = emptyBucket();
  const processed = emptyBucket();
  let cancelled = emptyBucket();

  for (const o of orders) {
    const scored = o.status === 'CANCELLED' ? cancelled : o.status === 'DRAFT' ? drafts : o.status === 'SENT' ? sent : processed;
    if (inHorizon(horizon, o.plannedDate, today)) {
      scored.count += 1;
      scored.birds += o.birdCount;
      scored.kgCarcass += o.carcassWeightKg ?? 0;
    }
  }

  return { drafts, sent, processed, cancelled, openBirds: drafts.birds + sent.birds };
}

/** Poids vif moyen par oiseau, par espèce, à partir des ordres traités et pesés. */
export function speciesWeightReference(orders: SlaughterOrder[]): Record<string, SpeciesWeightRef> {
  const acc: Record<string, { total: number; n: number }> = {};
  for (const o of orders) {
    if (o.status !== 'PROCESSED' || o.totalWeightKg == null || o.birdCount <= 0) continue;
    const sp = o.batch?.species ?? 'POULET';
    const cur = acc[sp] ?? { total: 0, n: 0 };
    cur.total += o.totalWeightKg / o.birdCount;
    cur.n += 1;
    acc[sp] = cur;
  }
  const out: Record<string, SpeciesWeightRef> = {};
  for (const [sp, v] of Object.entries(acc)) {
    out[sp] = { n: v.n, avgLiveKgPerBird: v.total / v.n };
  }
  return out;
}

/** Rendement moyen d'abattage (poids carcasse / poids vif), tous traitements confondus. */
export function yieldReference(orders: SlaughterOrder[]): YieldRef {
  const withR = orders.filter((o) => o.status === 'PROCESSED' && o.rendementPercent != null);
  if (withR.length === 0) return { avgRendementPct: null, n: 0 };
  const total = withR.reduce((s, o) => s + (o.rendementPercent ?? 0), 0);
  return { avgRendementPct: total / withR.length, n: withR.length };
}

export function slaughterRefs(orders: SlaughterOrder[]): SlaughterRefs {
  return { weights: speciesWeightReference(orders), yield: yieldReference(orders) };
}

/** Projection vif / carcasse d'un ordre, à partir des références historiques du module. */
export function projectOrder(lot: ProductionBatch, birdCount: number, refs: SlaughterRefs): OrderProjection {
  const w = refs.weights[lot.species];
  const estLiveKg = w && birdCount > 0 ? birdCount * w.avgLiveKgPerBird : null;
  const avgRendementPct = refs.yield.avgRendementPct;
  const estCarcassKg = estLiveKg != null && avgRendementPct != null ? estLiveKg * (avgRendementPct / 100) : null;
  return {
    estLiveKg,
    estCarcassKg,
    avgRendementPct,
    rendementN: refs.yield.n,
    remainingAfter: Math.max(0, (lot.quantityAlive ?? 0) - birdCount),
  };
}

/** Disponibilité d'un lot : vivants, oiseaux déjà ordonnés, restants, surcapacité. */
export function lotAvailability(orders: SlaughterOrder[], lot: ProductionBatch): LotAvailability {
  const alive = lot.quantityAlive ?? 0;
  const aliveOrders = orders.filter((o) => o.batchId === lot.id && o.status !== 'CANCELLED');
  const ordered = aliveOrders
    .filter((o) => o.status === 'DRAFT' || o.status === 'SENT')
    .reduce((s, o) => s + o.birdCount, 0);
  const processed = aliveOrders
    .filter((o) => o.status === 'PROCESSED')
    .reduce((s, o) => s + o.birdCount, 0);
  return {
    alive,
    ordered,
    processed,
    remaining: Math.max(0, alive - ordered),
    overbooked: ordered > alive,
  };
}

/** Carcasses encore vendables au POS (cumul des pools d'ordres ABATTU traités). */
export function reserveCarcasses(orders: SlaughterOrder[]): number {
  return orders.reduce((s, o) => s + (o.carcassesAvailable ?? 0), 0);
}

export interface LotSlaughterSummary {
  alive: number;
  pendingCount: number;
  pendingBirds: number;
  overbooked: boolean;
  processedCount: number;
  processedBirds: number;
  carcassKg: number;
  rendementPct: number | null;
  remaining: number;
  hasActivity: boolean;
}

/** Synthèse d'abattage d'un lot : ordres en cours, traités et disponibilité. */
export function lotSlaughterSummary(
  orders: SlaughterOrder[],
  lot: Pick<ProductionBatch, 'id' | 'quantityAlive'>,
): LotSlaughterSummary {
  const lotOrders = orders.filter((o) => o.batchId === lot.id);
  const pending = lotOrders.filter((o) => o.status === 'DRAFT' || o.status === 'SENT');
  const pendingBirds = pending.reduce((s, o) => s + o.birdCount, 0);
  const processed = lotOrders.filter((o) => o.status === 'PROCESSED');
  const processedBirds = processed.reduce((s, o) => s + o.birdCount, 0);
  const withR = processed.filter((o) => o.rendementPercent != null);
  const alive = lot.quantityAlive ?? 0;
  return {
    alive,
    pendingCount: pending.length,
    pendingBirds,
    overbooked: pendingBirds > alive,
    processedCount: processed.length,
    processedBirds,
    carcassKg: processed.reduce((s, o) => s + (o.carcassWeightKg ?? 0), 0),
    rendementPct: withR.length > 0 ? withR.reduce((s, o) => s + (o.rendementPercent ?? 0), 0) / withR.length : null,
    remaining: Math.max(0, alive - pendingBirds),
    hasActivity: pending.length > 0 || processed.length > 0,
  };
}