// Technical visits and biosecurity grid (CDC n° 27, n° 45, §3.2), pure. Same
// rules as the server (`backend/src/modules/visits/visit-rules.ts`) and the web
// (`components/visits/visitRules.ts`): keep them in step. The server recomputes
// the score and class and stays the authority.
import type {
  AccessMatrix,
  BiosecurityAnswer,
  BiosecurityClass,
  CreateVisitPayload,
  VisitCriterion,
  VisitType,
} from '@/api/poufa';
import type { UserRole } from '@/api/types';

import { matrixGrants } from './access';

export const VISIT_TYPE_LABEL: Record<VisitType, string> = {
  TECHNIQUE: 'Visite technique',
  BIOSECURITE: 'Contrôle de biosécurité',
  SANITAIRE: 'Suivi sanitaire',
};

export const ANSWER_LABEL: Record<BiosecurityAnswer, string> = {
  CONFORME: 'Conforme',
  NON_CONFORME: 'Non conforme',
  NA: 'Sans objet',
};

export const CLASS_LABEL: Record<BiosecurityClass, string> = { A: 'Classe A', B: 'Classe B', C: 'Classe C' };

/** Reads the visits: every farm account; an institution with TECHNIQUE or SANITAIRE in consultation. */
export function readsVisits(role: UserRole | undefined, matrix: AccessMatrix | null | undefined): boolean {
  if (role === 'PROPRIETAIRE' || role === 'ELEVEUR' || role === 'PLATFORM_ADMIN') return true;
  if (role === 'INSTITUTION') return matrixGrants(matrix, 'TECHNIQUE', 'CONSULTER') || matrixGrants(matrix, 'SANITAIRE', 'CONSULTER');
  return false;
}

/** Records a visit: the platform admin, or an institution holding TECHNIQUE:VALIDER (the agent technique). */
export function canWriteVisits(role: UserRole | undefined, matrix: AccessMatrix | null | undefined): boolean {
  if (role === 'PLATFORM_ADMIN') return true;
  return role === 'INSTITUTION' && matrixGrants(matrix, 'TECHNIQUE', 'VALIDER');
}

export type Answers = Record<string, BiosecurityAnswer | undefined>;

/** Weight of the compliant criteria over the assessed ones (NA left out), in %, 1 decimal; null when nothing assessed. */
export function scoreOf(criteria: ReadonlyArray<Pick<VisitCriterion, 'code' | 'weight'>>, answers: Answers): number | null {
  let total = 0;
  let ok = 0;
  for (const c of criteria) {
    const a = answers[c.code];
    if (!a || a === 'NA') continue;
    total += c.weight;
    if (a === 'CONFORME') ok += c.weight;
  }
  return total === 0 ? null : Math.round((ok / total) * 1000) / 10;
}

export function classOf(score: number | null, t: { a: number; b: number }): BiosecurityClass | null {
  if (score == null) return null;
  return score >= t.a ? 'A' : score >= t.b ? 'B' : 'C';
}

export function scoreLabel(score: number | null | undefined): string {
  return score == null ? '—' : `${String(score).replace('.', ',')} %`;
}

export function classTone(c: BiosecurityClass | null | undefined): 'green' | 'amber' | 'red' | 'neutral' {
  return c === 'A' ? 'green' : c === 'B' ? 'amber' : c === 'C' ? 'red' : 'neutral';
}

/** Criteria grouped by category, in grid order (« Autres » when none). */
export function groupByCategory<T extends { category: string | null }>(items: readonly T[]): Array<{ category: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const c of items) {
    const key = c.category ?? 'Autres';
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups].map(([category, list]) => ({ category, items: list }));
}

export interface VisitDraft {
  type: VisitType;
  visitDate: string;
  batchId: string;
  observations: string;
  recommendations: string;
  nextVisitDate: string;
  visaFrom: string;
  visaTo: string;
  /** Position of the visit, when taken. */
  position: { latitude: number; longitude: number } | null;
  answers: Answers;
  comments: Record<string, string>;
}

export function emptyVisitDraft(today: string): VisitDraft {
  return {
    type: 'TECHNIQUE',
    visitDate: today,
    batchId: '',
    observations: '',
    recommendations: '',
    nextVisitDate: '',
    visaFrom: '',
    visaTo: '',
    position: null,
    answers: {},
    comments: {},
  };
}

/** French refusal of an inconsistent visit before sending, or null (same checks as the server). */
export function visitRefusal(d: VisitDraft, ctx: { today: string; bandStart?: string | null }): string | null {
  if (!d.visitDate) return 'Choisissez le jour de la visite.';
  if (d.visitDate > ctx.today) return 'La visite ne peut pas être datée du futur.';
  if (d.nextVisitDate && d.nextVisitDate < d.visitDate) return 'La prochaine visite ne peut pas précéder la visite.';
  if (d.visaFrom || d.visaTo) {
    if (!d.visaFrom || !d.visaTo) return 'Le visa demande le début et la fin de la période vérifiée.';
    if (!d.batchId) return 'Le visa porte sur les saisies d’une bande : choisissez la bande.';
    if (d.visaFrom > d.visaTo) return 'Le début de la période visée suit sa fin.';
    if (d.visaTo > d.visitDate) return 'On ne peut pas viser des saisies postérieures à la visite.';
    if (ctx.bandStart && d.visaFrom < ctx.bandStart.slice(0, 10)) return 'La période visée commence avant l’ouverture de la bande.';
  }
  const graded = Object.values(d.answers).filter((a) => a && a !== 'NA');
  if (d.type === 'BIOSECURITE' && graded.length === 0) return 'Un contrôle de biosécurité évalue au moins un critère de la grille.';
  return null;
}

/** POST body of a draft: only the criteria answered, empty texts left out. */
export function buildVisitPayload(d: VisitDraft, criteria: ReadonlyArray<Pick<VisitCriterion, 'code'>>): CreateVisitPayload {
  const answers = criteria
    .filter((c) => d.answers[c.code])
    .map((c) => {
      const comment = d.comments[c.code]?.trim();
      return { criterionCode: c.code, answer: d.answers[c.code] as BiosecurityAnswer, ...(comment ? { comment } : {}) };
    });
  return {
    visitDate: d.visitDate,
    type: d.type,
    ...(d.batchId ? { batchId: d.batchId } : {}),
    ...(d.observations.trim() ? { observations: d.observations.trim() } : {}),
    ...(d.recommendations.trim() ? { recommendations: d.recommendations.trim() } : {}),
    ...(d.nextVisitDate ? { nextVisitDate: d.nextVisitDate } : {}),
    ...(d.visaFrom && d.visaTo ? { visaFrom: d.visaFrom, visaTo: d.visaTo } : {}),
    ...(d.position
      ? { latitude: Math.round(d.position.latitude * 1e6) / 1e6, longitude: Math.round(d.position.longitude * 1e6) / 1e6 }
      : {}),
    answers,
  };
}

/** Line of the band history for a visit (same wording as the server timeline). */
export function visitHistoryLabel(v: {
  type: VisitType;
  scorePct: number | null;
  classification: BiosecurityClass | null;
  visaFrom: string | null;
  visaTo: string | null;
}): string {
  const parts: string[] = [];
  if (v.scorePct != null) parts.push(`score ${scoreLabel(v.scorePct)}${v.classification ? `, classe ${v.classification}` : ''}`);
  if (v.visaFrom && v.visaTo) parts.push(`saisies du ${v.visaFrom} au ${v.visaTo} visées`);
  return parts.length ? `${VISIT_TYPE_LABEL[v.type]} : ${parts.join(' ; ')}` : VISIT_TYPE_LABEL[v.type];
}

/** A visit belongs to a band's history: its own band, or a farm visit made while the band ran. */
export function visitInBand(
  v: { batchId: string | null; visitDate: string },
  band: { id: string; integrationDate: string; closedAt?: string | null },
  today: string,
): boolean {
  if (v.batchId) return v.batchId === band.id;
  const end = band.closedAt ? band.closedAt.slice(0, 10) : today;
  return v.visitDate >= band.integrationDate.slice(0, 10) && v.visitDate <= end;
}
