/**
 * One indicator set on screen and on paper (CDC n° 12-15, 36): the official
 * value (programme formula in force) is the headline; Fermia's own
 * computation comes second, always named « indicateur de conduite (Fermia) »,
 * so a reader never sees two mortalities or two ICs without knowing which one
 * is official. Pure, unit-tested; the web and mobile apps mirror it.
 */

/** Label of every Fermia figure shown next to an official one. */
export const CONDUITE_LABEL = 'indicateur de conduite (Fermia)';

/** The CDC's band indicators (n° 12-15), in this order. */
export const HEADLINE_KEYS = [
  'taux_mortalite',
  'viabilite',
  'gmq_g_j',
  'ic',
] as const;

interface IndicatorLike {
  key: string;
  label: string;
  unit: string;
  value: number | null;
}

/** FCFA whole; %, g/j and kg one decimal; ratios two. */
function digitsFor(unit: string): number {
  if (unit.startsWith('FCFA')) return 0;
  if (unit === '%' || unit === 'g/j' || unit === 'kg') return 1;
  return 2;
}

/** French number with its unit, « non calculable » when null. */
export function indicatorText(value: number | null, unit: string): string {
  if (value == null || !Number.isFinite(value)) return 'non calculable';
  const digits = digitsFor(unit);
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  const text = rounded.toFixed(digits).replace('.', ',');
  const unitText = unit === 'kg aliment/kg vif' ? '' : unit;
  return unitText ? `${text} ${unitText}` : text;
}

/** Fermia's lot metrics (`MetricsService`), as the PDFs read them. */
export interface FermiaLotMetrics {
  mortalityPercent: number;
  fcr: number | null;
  gmqGramsPerDay: number | null;
  ipe: number | null;
}

/**
 * Rows of the sanitary follow-up sheet: official headline first (or a note
 * when the programme set could not be computed), then Fermia's figures
 * under the « indicateur de conduite » label.
 */
export function passportIndicatorRows(
  official: readonly IndicatorLike[] | null,
  fermia: FermiaLotMetrics,
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (official) {
    for (const key of HEADLINE_KEYS) {
      const i = official.find((o) => o.key === key);
      if (i) {
        rows.push({
          label: `${i.label} (officiel)`,
          value: indicatorText(i.value, i.unit),
        });
      }
    }
  } else {
    rows.push({
      label: 'Indicateurs officiels',
      value: 'indisponibles (formules du programme)',
    });
  }
  const conduite = (name: string) => `${name} — ${CONDUITE_LABEL}`;
  rows.push(
    {
      label: conduite('Mortalité'),
      value: `${fermia.mortalityPercent.toFixed(1).replace('.', ',')} %`,
    },
    {
      label: conduite('IC'),
      value:
        fermia.fcr != null ? fermia.fcr.toFixed(2).replace('.', ',') : 'N/A',
    },
    {
      label: conduite('GMQ'),
      value:
        fermia.gmqGramsPerDay != null
          ? `${fermia.gmqGramsPerDay.toFixed(1).replace('.', ',')} g/j`
          : 'N/A',
    },
    {
      label: conduite('IPE'),
      value: fermia.ipe != null ? fermia.ipe.toFixed(1).replace('.', ',') : 'N/A',
    },
  );
  return rows;
}

/** Label of an indicator of the set in force (e.g. « Marge brute »), else the fallback. */
export function labelOf(
  official: readonly IndicatorLike[] | null | undefined,
  key: string,
  fallback: string,
): string {
  return official?.find((i) => i.key === key)?.label ?? fallback;
}
