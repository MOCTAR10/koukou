// Weighings (CDC 8): « Date ; nombre pesé ; poids moyen (g) », sample size and
// frequency set by the DGE (PESEE_ECHANTILLON_TETES / PESEE_FREQUENCE_J).
// Pure, mirroring backend daily-entries.service.ts and bande-rules.ts.
import type { WeighingStatus } from '@/api/poufa';

/** Sample prefilled in the entry: the parameter, capped by the birds present. */
export function defaultSampleSize(expected: number | null | undefined, live: number | null | undefined): number {
  if (expected == null || !Number.isFinite(expected) || expected <= 0) return 0;
  const n = Math.round(expected);
  return live != null && live > 0 ? Math.min(n, live) : n;
}

/** French refusal of the weighed sample, or null (required with a weight). */
export function sampleSizeRefusal(weightG: number, sampleSize: number | null | undefined, live: number | null | undefined): string | null {
  if (!(weightG > 0)) return null;
  if (sampleSize == null || !Number.isInteger(sampleSize) || sampleSize < 1) {
    return 'Indiquez le nombre de sujets pesés (au moins 1) avec le poids moyen.';
  }
  if (live != null && live > 0 && sampleSize > live) {
    return `Échantillon impossible : ${sampleSize} sujet(s) pesé(s) pour ${live} présent(s).`;
  }
  return null;
}

/** The tip under the weight field, with the programme's sample size. */
export function sampleTip(expected: number | null | undefined): string {
  return expected != null && expected > 0
    ? `Pesez un échantillon d’au moins ${Math.round(expected)} sujets représentatifs (taille fixée par le programme)`
    : 'Pesez un échantillon de sujets représentatifs (taille fixée par le programme)';
}

function frDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export interface WeighingLine {
  label: string;
  detail: string;
  tone: 'ok' | 'late' | 'closed';
}

/** « Prochaine pesée » / « Pesée en retard » of the band sheet. */
export function weighingLine(w: WeighingStatus, closed: boolean): WeighingLine {
  const last = w.lastWeighingDate
    ? `Dernière pesée le ${frDay(w.lastWeighingDate)}${w.lastSampleSize != null ? ` (${w.lastSampleSize} sujets)` : ''}`
    : 'Aucune pesée enregistrée';
  const rule = `une pesée tous les ${w.frequencyDays} j, ${w.expectedSampleSize} sujets`;
  if (closed) return { label: 'Bande clôturée', detail: `${last} · ${rule}`, tone: 'closed' };
  if (w.late) {
    return {
      label: `Pesée en retard de ${w.daysLate} j`,
      detail: `Prévue le ${frDay(w.nextDueDate)} · ${last} · ${rule}`,
      tone: 'late',
    };
  }
  return { label: `Prochaine pesée le ${frDay(w.nextDueDate)}`, detail: `${last} · ${rule}`, tone: 'ok' };
}

/** Warning when the last weighing used fewer birds than the parameter asks. */
export function sampleWarning(w: WeighingStatus): string | null {
  if (!w.lastSampleBelowExpected) return null;
  return `Échantillon insuffisant à la dernière pesée : ${w.lastSampleSize ?? 0} sujet(s) pesé(s) pour ${w.expectedSampleSize} demandés.`;
}
