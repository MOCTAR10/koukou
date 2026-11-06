import type { DeclarationReviewDecision, DeclarationReviewState } from '../../api/types-surveillance';

/**
 * POUFA lot A2 vet, CDC n° 26: pure helpers of the vets' register of
 * declarations (server `declaration-review-rules.ts`).
 */

export const REVIEW_STATE_LABELS: Readonly<Record<DeclarationReviewState, string>> = {
  A_EXAMINER: 'À examiner',
  VALIDEE: 'Validée',
  INFIRMEE: 'Infirmée',
  ALERTE: 'Alerte sanitaire',
};

export const REVIEW_STATE_TONES: Readonly<Record<DeclarationReviewState, 'amber' | 'emerald' | 'slate' | 'red'>> = {
  A_EXAMINER: 'amber',
  VALIDEE: 'emerald',
  INFIRMEE: 'slate',
  ALERTE: 'red',
};

export interface DeclarationFilters {
  state: DeclarationReviewState | '' | string;
  from: string;
  to: string;
}

export function declarationQuery(f: DeclarationFilters, offset: number, limit = 50): string {
  const q = new URLSearchParams();
  if (f.state) q.set('state', f.state);
  if (f.from) q.set('from', f.from);
  if (f.to) q.set('to', f.to);
  q.set('offset', String(offset));
  q.set('limit', String(limit));
  return q.toString();
}

/** Same rule as the server: a comment to rule out, 1000 characters at most. */
export function reviewFormProblem(decision: DeclarationReviewDecision, comment: string): string | null {
  const text = comment.trim();
  if (decision === 'INFIRMEE' && !text) return 'Un commentaire est obligatoire pour infirmer une déclaration.';
  if (text.length > 1000) return 'Le commentaire fait au plus 1000 caractères.';
  return null;
}
