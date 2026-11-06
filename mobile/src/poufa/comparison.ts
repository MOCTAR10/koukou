// Band vs programme average per age week (CDC 36), display rules. Pure.
import type { BandComparison, ComparisonValues } from '@/api/poufa';

export type ComparisonMetric = 'mortalityPct' | 'fcr' | 'gmqG';

export const COMPARISON_METRICS: { key: ComparisonMetric; label: string; unit: string; digits: number; higherIsBetter: boolean }[] = [
  { key: 'mortalityPct', label: 'Mortalité', unit: '%', digits: 1, higherIsBetter: false },
  { key: 'fcr', label: 'IC', unit: '', digits: 2, higherIsBetter: false },
  { key: 'gmqG', label: 'GMQ', unit: 'g/j', digits: 0, higherIsBetter: true },
];

export type CellTone = 'better' | 'worse' | 'same' | 'none';

export interface ComparisonCell {
  band: string;
  programme: string;
  tone: CellTone;
}

export interface ComparisonRow {
  week: number;
  ages: string;
  current: boolean;
  /** Programme average hidden: fewer than k other farms reached that week. */
  suppressed: boolean;
  cells: Record<ComparisonMetric, ComparisonCell>;
}

function fmt(v: number | null | undefined, digits: number, unit: string): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return unit ? `${s} ${unit}` : s;
}

/** Better / worse than the average, within 2 % of it = same. */
export function compareTone(band: number | null | undefined, avg: number | null | undefined, higherIsBetter: boolean): CellTone {
  if (band == null || avg == null || !Number.isFinite(band) || !Number.isFinite(avg)) return 'none';
  const tolerance = Math.abs(avg) * 0.02;
  if (Math.abs(band - avg) <= tolerance) return 'same';
  const bandHigher = band > avg;
  return bandHigher === higherIsBetter ? 'better' : 'worse';
}

function cell(band: ComparisonValues | null, avg: ComparisonValues | null, suppressed: boolean, m: (typeof COMPARISON_METRICS)[number]): ComparisonCell {
  const b = band?.[m.key] ?? null;
  const a = suppressed ? null : (avg?.[m.key] ?? null);
  return {
    band: fmt(b, m.digits, m.unit),
    programme: suppressed ? 'Masquée' : fmt(a, m.digits, m.unit),
    tone: suppressed ? 'none' : compareTone(b, a, m.higherIsBetter),
  };
}

/** One row per age week the band reached, most recent first. */
export function comparisonRows(c: BandComparison): ComparisonRow[] {
  return c.weeks
    .slice()
    .sort((a, b) => b.week - a.week)
    .map((w) => ({
      week: w.week,
      ages: `J${w.ageFrom}–J${w.ageTo}`,
      current: c.currentWeek != null && w.week === c.currentWeek,
      suppressed: w.suppressed,
      cells: {
        mortalityPct: cell(w.band, w.programme, w.suppressed, COMPARISON_METRICS[0]),
        fcr: cell(w.band, w.programme, w.suppressed, COMPARISON_METRICS[1]),
        gmqG: cell(w.band, w.programme, w.suppressed, COMPARISON_METRICS[2]),
      },
    }));
}

/** Short French note under the table when weeks are hidden. */
export function suppressionNote(c: BandComparison): string | null {
  const hidden = c.weeks.filter((w) => w.suppressed).length;
  if (hidden === 0) return null;
  return `Moyenne masquée pour ${hidden} semaine${hidden > 1 ? 's' : ''} : moins de ${c.minGroupSize} autres fermes l’ont atteinte (anonymat).`;
}

/** Official indicator value for display (null = undefined, e.g. division by zero). */
export function fmtIndicator(value: number | null, unit: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const digits = Math.abs(value) >= 100 ? 0 : 2;
  const s = value.toLocaleString('fr-FR', { maximumFractionDigits: digits });
  return unit ? `${s} ${unit}` : s;
}
