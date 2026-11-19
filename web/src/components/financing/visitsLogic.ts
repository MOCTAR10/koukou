import type { VisitSummary } from '../../api/types-financing';
import { dateFr } from '../../lib/format';

/** « 12/11/2026 · Jean Dupont · classe B » — a technical visit in words, never its identifier. */
export function visitLabel(v: Pick<VisitSummary, 'visitedOn' | 'agentName' | 'biosecurityClass'>): string {
  return [dateFr(v.visitedOn), v.agentName ?? 'Agent inconnu', v.biosecurityClass ? `classe ${v.biosecurityClass}` : 'sans note de biosécurité'].join(' · ');
}

/** The picker's text when the farm has no visit. */
export const NO_VISIT_TEXT = 'Aucune visite enregistrée pour cette ferme';
