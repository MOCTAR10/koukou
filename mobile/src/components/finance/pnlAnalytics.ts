import type { RentabiliteBreakdownExpense, RentabiliteBreakdownProduct } from '@/api/types';

// ── Dates ──────────────────────────────────────────────────────────────────

/** Fenêtre précédente de même longueur, jour-à-jour. */
export function shiftWindow(
  fromISO: string | undefined,
  toISO: string | undefined,
): { from: string | undefined; to: string | undefined } {
  if (!fromISO || !toISO) return { from: undefined, to: undefined };
  const [fy, fm, fd] = fromISO.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toISO.slice(0, 10).split('-').map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const prevTo = new Date(from.getTime() - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000);
  return { from: toDateStr(prevFrom), to: toDateStr(prevTo) };
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** « 30 derniers jours », « Du 1 sept. au 30 sept. 2026 », « Tout l'historique ». */
export function periodLabel(
  from: string | undefined,
  to: string | undefined,
  span: number | 'all',
): string {
  if (span === 'all' && !from) return 'Tout l’historique';
  if (!from || !to) return 'Période';
  const f = new Date(`${from}T12:00:00`);
  const t = new Date(`${to}T12:00:00`);
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return `${from} → ${to}`;
  const day = (d: Date) => d.getDate();
  const month = (d: Date, short: boolean) =>
    d.toLocaleDateString('fr-FR', { month: short ? 'short' : 'long' });
  if (f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth()) {
    return `${day(f)} – ${day(t)} ${month(t, false)} ${t.getFullYear()}`;
  }
  if (f.getFullYear() === t.getFullYear()) {
    return `${day(f)} ${month(f, true)} – ${day(t)} ${month(t, false)} ${t.getFullYear()}`;
  }
  return `${day(f)} ${month(f, true)} ${f.getFullYear()} – ${day(t)} ${month(t, true)} ${t.getFullYear()}`;
}

// ── Ratios ─────────────────────────────────────────────────────────────────

/** Variation en % ; `null` si la base est absente ou nulle (division impossible). */
export function deltaPct(cur: number | undefined, prev: number | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** Marge nette en % du chiffre d'affaires. `null` sans chiffre d'affaires. */
export function marginPct(netFcfa: number, revenueFcfa: number): number | null {
  if (revenueFcfa === 0) return null;
  return (netFcfa / revenueFcfa) * 100;
}

/** Part encaissée des ventes, en % (0–100). `null` sans vente. */
export function collectionRate(collectedFcfa: number, totalFcfa: number): number | null {
  if (totalFcfa === 0) return null;
  return Math.min(100, Math.max(0, (collectedFcfa / totalFcfa) * 100));
}

/** Part d'un poste dans un total, en % (0–100). `0` si le total est nul. */
export function sharePct(amountFcfa: number, totalFcfa: number): number {
  if (totalFcfa <= 0) return 0;
  return Math.min(100, Math.max(0, (amountFcfa / totalFcfa) * 100));
}

// ── Répartitions ───────────────────────────────────────────────────────────

export interface Ranked<T> {
  item: T;
  amountFcfa: number;
  pct: number;
}

/**
 * Répartit des postes triés du plus au moins élevé, avec leur part en %.
 * Les parts sont normalisées sur le total réellement fourni (les arrondis
 * peuvent faire 99,9 % au lieu de 100 % — c'est le comportement attendu).
 */
export function rankBreakdown<T extends { amountFcfa: number }>(
  items: T[],
  totalFcfa: number,
): Ranked<T>[] {
  return [...items]
    .filter((i) => i.amountFcfa !== 0)
    .sort((a, b) => b.amountFcfa - a.amountFcfa)
    .map((item) => ({ item, amountFcfa: item.amountFcfa, pct: sharePct(item.amountFcfa, totalFcfa) }));
}

/** Somme des montants d'une répartition. */
export function sumFcfa<T extends { amountFcfa: number }>(items: T[] | undefined): number {
  return (items ?? []).reduce((acc, i) => acc + i.amountFcfa, 0);
}

export type ProductShare = Ranked<RentabiliteBreakdownProduct>;
export type ExpenseShare = Ranked<RentabiliteBreakdownExpense>;

// ── Format ─────────────────────────────────────────────────────────────────

/** Montant compact pour les axes et les tuiles : 1,2 M · 340 k · 1 500 FCFA. */
export function compactFcfa(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1000)} k`;
  return `${sign}${Math.round(abs).toLocaleString('fr-FR')}`;
}

/** « +12,4 % » / « -3 % » / null. */
export function signedPct(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

/** « 4,2 % » ou null. */
export function plainPct(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  return `${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}