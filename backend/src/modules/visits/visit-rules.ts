import {
  BiosecurityAnswer,
  BiosecurityClass,
} from '../../common/enums/visit.enum.js';

/**
 * Pure rules of the technical visits (CDC n° 27 and n° 45): biosecurity
 * score, classification against the thresholds in force, grid weights read
 * from the list items, and the visa period. Unit-tested.
 */

export interface GridCriterion {
  code: string;
  label: string;
  category: string | null;
  weight: number;
}

export interface ScoredAnswer {
  weight: number;
  answer: BiosecurityAnswer;
}

export interface BiosecurityThresholds {
  /** Score (%) from which the class is A. */
  a: number;
  /** Score (%) from which the class is B. */
  b: number;
}

/** Weight of a grid criterion: `meta.weight`, an integer ≥ 1 (1 when absent or invalid). */
export function criterionWeight(meta: Record<string, unknown> | null): number {
  const raw = meta?.weight;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function criterionCategory(
  meta: Record<string, unknown> | null,
): string | null {
  const raw = meta?.category;
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

/** French error when a `meta` sent for a grid criterion is invalid, else null. */
export function criterionMetaError(
  meta: Record<string, unknown> | undefined,
): string | null {
  if (!meta || meta.weight === undefined) return null;
  const n = meta.weight;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 10) {
    return 'Le poids d’un critère de biosécurité est un entier de 1 à 10 (meta.weight).';
  }
  return null;
}

/**
 * Score in % = weight of the compliant criteria over the weight of those
 * assessed (NA left out), one decimal. Null when nothing was assessed.
 */
export function biosecurityScore(
  answers: readonly ScoredAnswer[],
): number | null {
  let total = 0;
  let ok = 0;
  for (const a of answers) {
    if (a.answer === BiosecurityAnswer.NA) continue;
    total += a.weight;
    if (a.answer === BiosecurityAnswer.CONFORME) ok += a.weight;
  }
  if (total === 0) return null;
  return Math.round((ok / total) * 1000) / 10;
}

/** A when score ≥ a, B when ≥ b, else C; null without a score. */
export function biosecurityClass(
  score: number | null,
  t: BiosecurityThresholds,
): BiosecurityClass | null {
  if (score == null) return null;
  if (score >= t.a) return BiosecurityClass.A;
  if (score >= t.b) return BiosecurityClass.B;
  return BiosecurityClass.C;
}

export interface VisitInput {
  visitDate: string;
  hasBand: boolean;
  visaFrom?: string | null;
  visaTo?: string | null;
  nextVisitDate?: string | null;
  /** Opening day and (when closed) last day of the band, for the visa. */
  bandStart?: string | null;
  bandEnd?: string | null;
}

/**
 * French refusal of an inconsistent visit, or null. The visa (CDC §3.2 « vérifie
 * les déclarations ») names the period of a band's records the agent checked
 * on site: both days, band required, within the band's life, not after the visit.
 */
export function visitRefusal(v: VisitInput): string | null {
  const day = (d: string) => d.slice(0, 10);
  if (v.nextVisitDate && day(v.nextVisitDate) < day(v.visitDate)) {
    return 'La prochaine visite ne peut pas précéder la visite.';
  }
  const hasVisa = !!(v.visaFrom || v.visaTo);
  if (!hasVisa) return null;
  if (!v.visaFrom || !v.visaTo) {
    return 'Le visa demande le début et la fin de la période vérifiée.';
  }
  if (!v.hasBand) {
    return 'Le visa porte sur les saisies d’une bande : choisissez la bande.';
  }
  const from = day(v.visaFrom);
  const to = day(v.visaTo);
  if (from > to) return 'Le début de la période visée suit sa fin.';
  if (to > day(v.visitDate)) {
    return 'On ne peut pas viser des saisies postérieures à la visite.';
  }
  if (v.bandStart && from < day(v.bandStart)) {
    return 'La période visée commence avant l’ouverture de la bande.';
  }
  if (v.bandEnd && to > day(v.bandEnd)) {
    return 'La période visée dépasse la clôture de la bande.';
  }
  return null;
}

/** History line of a visit (T2), pure so the wording is tested. */
export function visitHistoryLabel(v: {
  type: string;
  scorePct: number | null;
  classification: string | null;
  visaFrom: string | null;
  visaTo: string | null;
}): string {
  const names: Record<string, string> = {
    TECHNIQUE: 'Visite technique',
    BIOSECURITE: 'Contrôle de biosécurité',
    SANITAIRE: 'Visite de suivi sanitaire',
  };
  const head = names[v.type] ?? 'Visite';
  const parts: string[] = [];
  if (v.scorePct != null) {
    parts.push(
      `score ${String(v.scorePct).replace('.', ',')} %${v.classification ? `, classe ${v.classification}` : ''}`,
    );
  }
  if (v.visaFrom && v.visaTo) {
    parts.push(`saisies du ${v.visaFrom} au ${v.visaTo} visées`);
  }
  return parts.length ? `${head} : ${parts.join(' ; ')}` : head;
}
