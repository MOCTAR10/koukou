// Pure P&L helpers, ported from mobile/src/components/finance/pnlAnalytics.ts.
// Dates are handled in UTC, the calendar the backend compares dates with.

export type PeriodSpan = 7 | 30 | 90 | 'all' | 'custom';

export interface PeriodWindow {
  span: PeriodSpan;
  from: string;
  to: string;
}

/**
 * Lower bound sent for « Tout » : without `from` the overview endpoint falls
 * back to the last 30 days, which would contradict the label.
 */
export const ALL_TIME_FROM = '2000-01-01';

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function spanWindow(span: 7 | 30 | 90 | 'all', to: string): PeriodWindow {
  return { span, to, from: span === 'all' ? ALL_TIME_FROM : addDays(to, -(span - 1)) };
}

/** Previous window of the same length, day for day. */
export function previousWindow(w: PeriodWindow): { from: string; to: string } | null {
  if (w.span === 'all') return null;
  const start = Date.parse(`${w.from}T00:00:00Z`);
  const end = Date.parse(`${w.to}T00:00:00Z`);
  const days = Math.round((end - start) / 86_400_000) + 1;
  const to = addDays(w.from, -1);
  return { from: addDays(to, -(days - 1)), to };
}

export function periodLabel(w: PeriodWindow): string {
  if (w.span === 'all') return 'Tout l’historique';
  const f = new Date(`${w.from}T12:00:00`);
  const t = new Date(`${w.to}T12:00:00`);
  const month = (d: Date, style: 'short' | 'long') => d.toLocaleDateString('fr-FR', { month: style });
  if (f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth()) {
    return `${f.getDate()} – ${t.getDate()} ${month(t, 'long')} ${t.getFullYear()}`;
  }
  if (f.getFullYear() === t.getFullYear()) {
    return `${f.getDate()} ${month(f, 'short')} – ${t.getDate()} ${month(t, 'long')} ${t.getFullYear()}`;
  }
  return `${f.getDate()} ${month(f, 'short')} ${f.getFullYear()} – ${t.getDate()} ${month(t, 'short')} ${t.getFullYear()}`;
}

/** Change in %; null when the base is missing or zero. */
export function deltaPct(cur: number | undefined, prev: number | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function marginPct(netFcfa: number, revenueFcfa: number): number | null {
  return revenueFcfa === 0 ? null : (netFcfa / revenueFcfa) * 100;
}

export function collectionRate(collectedFcfa: number, totalFcfa: number): number | null {
  if (totalFcfa === 0) return null;
  return Math.min(100, Math.max(0, (collectedFcfa / totalFcfa) * 100));
}

export function sharePct(amountFcfa: number, totalFcfa: number): number {
  if (totalFcfa <= 0) return 0;
  return Math.min(100, Math.max(0, (amountFcfa / totalFcfa) * 100));
}

export function sumFcfa<T extends { amountFcfa: number }>(items: T[] | undefined): number {
  return (items ?? []).reduce((acc, i) => acc + i.amountFcfa, 0);
}

/** « +12,4 % » ; null when there is nothing to compare with. */
export function signedPct(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}
