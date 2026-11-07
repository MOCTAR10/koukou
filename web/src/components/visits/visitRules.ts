import type { Role } from '../../api/client';
import type { MyAccess } from '../../api/types-access';
import type { BiosecurityAnswer, BiosecurityClass, GridCriterion, VisitType } from '../../api/types-visits';
import { grantsAccess } from '../../app/menu-access';

/** Pure rules and labels of the visits screens (mirror of backend `visits/visit-rules.ts`). */

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

export const CLASS_LABEL: Record<BiosecurityClass, string> = {
  A: 'Classe A',
  B: 'Classe B',
  C: 'Classe C',
};

export function classTone(c: BiosecurityClass | null): 'emerald' | 'amber' | 'red' | 'slate' {
  return c === 'A' ? 'emerald' : c === 'B' ? 'amber' : c === 'C' ? 'red' : 'slate';
}

/** Score in % (weight of the compliant criteria over the assessed ones), 1 decimal; null when nothing assessed. */
export function scoreOf(criteria: ReadonlyArray<Pick<GridCriterion, 'code' | 'weight'>>, answers: Record<string, BiosecurityAnswer | undefined>): number | null {
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

export function scoreLabel(score: number | null): string {
  return score == null ? '—' : `${String(score).replace('.', ',')} %`;
}

/** Criteria grouped by category, in grid order (« Autres » for a criterion without one). */
export function groupByCategory(criteria: GridCriterion[]): Array<{ category: string; items: GridCriterion[] }> {
  const groups = new Map<string, GridCriterion[]>();
  for (const c of criteria) {
    const key = c.category ?? 'Autres';
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups].map(([category, items]) => ({ category, items }));
}

type Profile = Pick<MyAccess['profile'], 'matrix' | 'scopeKind'>;

export interface VisitRights {
  /** Reads the visits (`TECHNIQUE` or `SANITAIRE` consultation for an institution; every farm account). */
  view: boolean;
  /** Records a visit: TECHNIQUE:VALIDER (agent technique), the platform admin. */
  write: boolean;
  /** Programme-wide list (`GET /programme/visits`): institutions and the platform admin. */
  programme: boolean;
}

/** What `/app/visites` offers; the server stays the authority. */
export function visitRights(role: Role | null | undefined, access: Profile | null | undefined): VisitRights {
  if (role === 'PLATFORM_ADMIN') return { view: true, write: true, programme: true };
  if (role === 'PROPRIETAIRE' || role === 'ELEVEUR') return { view: true, write: false, programme: false };
  if (role !== 'INSTITUTION' || !access) return { view: false, write: false, programme: false };
  const view = grantsAccess(access, 'TECHNIQUE', 'CONSULTER') || grantsAccess(access, 'SANITAIRE', 'CONSULTER');
  return { view, write: grantsAccess(access, 'TECHNIQUE', 'VALIDER'), programme: view };
}

/** French refusal of an inconsistent visa period, or null (same rules as the server, before sending). */
export function visaError(v: { visitDate: string; batchId: string; visaFrom: string; visaTo: string; bandStart?: string | null }): string | null {
  if (!v.visaFrom && !v.visaTo) return null;
  if (!v.visaFrom || !v.visaTo) return 'Le visa demande le début et la fin de la période vérifiée.';
  if (!v.batchId) return 'Le visa porte sur les saisies d’une bande : choisissez la bande.';
  if (v.visaFrom > v.visaTo) return 'Le début de la période visée suit sa fin.';
  if (v.visaTo > v.visitDate) return 'On ne peut pas viser des saisies postérieures à la visite.';
  if (v.bandStart && v.visaFrom < v.bandStart.slice(0, 10)) return 'La période visée commence avant l’ouverture de la bande.';
  return null;
}
