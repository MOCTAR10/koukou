/**
 * Number formatting of the steering screens (tonnes, kg, heads, %, FCFA)
 * and the display rules of suppressed figures (aggregate-only views: a
 * group with fewer than k farms is hidden by the server). Pure, unit-tested.
 */

const DASH = '—';

function fr(n: number, digits: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function missing(n: number | null | undefined): n is null | undefined {
  return n == null || Number.isNaN(n);
}

/** Live tonnes: 3 decimals under 10 t (a small programme starts in kilos), 1 above. */
export function tonnesLabel(t: number | null | undefined): string {
  if (missing(t)) return DASH;
  return `${fr(t, Math.abs(t) < 10 ? 3 : 1)} t`;
}

/** A weight in kg, shown in tonnes from 1 000 kg. */
export function weightLabel(kg: number | null | undefined): string {
  if (missing(kg)) return DASH;
  if (Math.abs(kg) < 1000) return `${fr(kg, 1)} kg`;
  return `${fr(kg / 1000, Math.abs(kg) < 10_000 ? 2 : 1)} t`;
}

export function headsLabel(n: number | null | undefined): string {
  if (missing(n)) return DASH;
  return `${fr(n, 0)} ${Math.abs(n) <= 1 ? 'tête' : 'têtes'}`;
}

export function countLabel(n: number | null | undefined, one: string, many: string): string {
  if (missing(n)) return DASH;
  return `${fr(n, 0)} ${Math.abs(n) <= 1 ? one : many}`;
}

export function pctLabel(n: number | null | undefined, digits = 1): string {
  if (missing(n)) return DASH;
  return `${fr(n, digits)} %`;
}

export function fcfaLabel(n: number | null | undefined): string {
  if (missing(n)) return DASH;
  return `${fr(Math.round(n), 0)} FCFA`;
}

/** A plain number (IC, GMQ…). */
export function numLabel(n: number | null | undefined, digits = 2, unit = ''): string {
  if (missing(n)) return DASH;
  return unit ? `${fr(n, digits)} ${unit}` : fr(n, digits);
}

/** File size of a PDF. */
export function bytesLabel(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${fr(n / 1024, 0)} Ko`;
  return `${fr(n / (1024 * 1024), 1)} Mo`;
}

// ---------------------------------------------------------------------------
// Suppressed figures
// ---------------------------------------------------------------------------

/** What replaces a hidden figure (k = `scope.minGroupSize`). */
export function suppressedLabel(k: number): string {
  return `masqué, moins de ${k} fermes`;
}

/** Longer text for a hidden block (totals, inputs, a week of the chart). */
export function suppressedSentence(k: number): string {
  return `Chiffre masqué : il reposerait sur moins de ${k} fermes (ou permettrait de retrouver un petit groupe par différence).`;
}

export interface Shown {
  text: string;
  suppressed: boolean;
}

/**
 * The text of one figure of a group: the server nulls the metrics of a
 * hidden group, so a hidden group always says why, and an empty value is a
 * dash, never a misleading zero.
 */
export function shownFigure<T>(
  group: { suppressed: boolean; metrics: T | null },
  pick: (m: T) => number | null | undefined,
  fmt: (n: number | null | undefined) => string,
  k: number,
): Shown {
  if (group.suppressed || !group.metrics) return { text: suppressedLabel(k), suppressed: true };
  return { text: fmt(pick(group.metrics)), suppressed: false };
}

/** Number of hidden weeks of a series, for the note under the chart. */
export function hiddenWeeks(series: readonly { suppressed: boolean }[]): number {
  return series.filter((w) => w.suppressed).length;
}

/** Short label of a week start (« 03/11 »). */
export function weekLabel(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}
