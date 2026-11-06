// Veterinary review of the sanitary declarations (CDC n° 26 « valident les
// événements »). Mirrors the server (`surveillance/declaration-review-rules.ts`,
// `access/sanitary-declaration.policy.ts`) and the web register: the veterinary
// authority is the matrix right SANITAIRE:VALIDER, never a profile code. The
// server stays the authority; its French message is shown as it comes.
import type { AccessMatrix } from '@/api/poufa';
import type { UserRole } from '@/api/types';
import { matrixGrants } from './access';

export type ReviewDecision = 'VALIDEE' | 'INFIRMEE' | 'ALERTE';
export type ReviewState = 'A_EXAMINER' | ReviewDecision;

export const REVIEW_COMMENT_MAX = 1000;

export const REVIEW_STATE_LABELS: Readonly<Record<ReviewState, string>> = {
  A_EXAMINER: 'À examiner',
  VALIDEE: 'Validée',
  INFIRMEE: 'Infirmée',
  ALERTE: 'Alerte sanitaire',
};

export const REVIEW_DECISION_LABELS: Readonly<Record<ReviewDecision, string>> = {
  VALIDEE: 'Valider',
  INFIRMEE: 'Infirmer',
  ALERTE: 'Convertir en alerte',
};

/** Only an institution whose matrix grants SANITAIRE:VALIDER reviews declarations. */
export function canReviewDeclarations(role: UserRole | undefined, matrix: AccessMatrix | null | undefined): boolean {
  return role === 'INSTITUTION' && matrixGrants(matrix, 'SANITAIRE', 'VALIDER');
}

export type BadgeTone = 'success' | 'danger' | 'warn' | 'neutral';

/** Farm side: what the vets decided on a declaration (null = still waiting). */
export function reviewBadge(e: {
  vetReviewStatus?: ReviewDecision | null;
  vetReviewComment?: string | null;
}): { label: string; tone: BadgeTone; comment: string | null } {
  const status = e.vetReviewStatus ?? null;
  if (!status) return { label: 'En attente du vétérinaire', tone: 'neutral', comment: null };
  const tone: BadgeTone = status === 'VALIDEE' ? 'success' : status === 'ALERTE' ? 'danger' : 'warn';
  return { label: `Vétérinaire : ${REVIEW_STATE_LABELS[status].toLowerCase()}`, tone, comment: e.vetReviewComment?.trim() || null };
}

/** Same rules as the server: a comment is required to rule a declaration out. */
export function reviewFormProblem(decision: ReviewDecision, comment: string): string | null {
  const text = comment.trim();
  if (decision === 'INFIRMEE' && !text) return 'Un commentaire est obligatoire pour infirmer une déclaration.';
  if (text.length > REVIEW_COMMENT_MAX) return `Le commentaire ne doit pas dépasser ${REVIEW_COMMENT_MAX} caractères.`;
  return null;
}

export function reviewBody(decision: ReviewDecision, comment: string): { decision: ReviewDecision; comment?: string } {
  const text = comment.trim();
  return text ? { decision, comment: text } : { decision };
}
