import { DeclarationReviewStatus } from '../../common/enums/declaration-review.enum.js';

/**
 * POUFA lot A2 vet, CDC §5.2 n° 26 « les services vétérinaires qualifient les
 * alertes et valident les événements ». Pure rules of the veterinary review
 * of a sanitary declaration (`HealthEvent`):
 *
 * - a declaration that opened an alert (suspicion, or converted) follows the
 *   alert's own circuit (NOUVELLE → EN_ANALYSE → CONFIRMEE | INFIRMEE →
 *   CLOSE): it is not reviewed here;
 * - any other one is examined once by the veterinary authority: VALIDEE,
 *   INFIRMEE (comment required, like ruling out an alert) or ALERTE (it
 *   becomes an official alert, origin DECLARATION, in the circuit);
 * - the decision is final (409 after it), with its author, date and comment.
 *
 * « Proposé », à valider vétérinaires.
 */

/** Where a declaration stands for the vets (registry filter and column). */
export const DECLARATION_REVIEW_STATES = [
  'A_EXAMINER',
  DeclarationReviewStatus.VALIDEE,
  DeclarationReviewStatus.INFIRMEE,
  DeclarationReviewStatus.ALERTE,
] as const;
export type DeclarationReviewState =
  (typeof DECLARATION_REVIEW_STATES)[number];

export const REVIEW_STATE_LABELS: Readonly<
  Record<DeclarationReviewState, string>
> = {
  A_EXAMINER: 'À examiner',
  VALIDEE: 'Validée',
  INFIRMEE: 'Infirmée',
  ALERTE: 'Alerte sanitaire',
};

export const REVIEW_COMMENT_MAX = 1000;

/** The state of a declaration: its review, else the alert it opened, else to examine. */
export function reviewStateOf(d: {
  vetReviewStatus: DeclarationReviewStatus | null;
  alertId: string | null;
}): DeclarationReviewState {
  if (d.vetReviewStatus) return d.vetReviewStatus;
  return d.alertId ? DeclarationReviewStatus.ALERTE : 'A_EXAMINER';
}

export type ReviewProblem = { status: 400 | 409; message: string };

/** Why the review can't be recorded, or null. */
export function reviewProblem(
  d: {
    vetReviewStatus: DeclarationReviewStatus | null;
    alertCode: string | null;
  },
  decision: DeclarationReviewStatus,
  comment: string | null | undefined,
): ReviewProblem | null {
  if (d.alertCode) {
    return {
      status: 409,
      message: `Cette déclaration a ouvert l’alerte sanitaire ${d.alertCode} : qualifiez-la dans le circuit de l’alerte.`,
    };
  }
  if (d.vetReviewStatus) {
    return {
      status: 409,
      message: `Cette déclaration a déjà été examinée (${REVIEW_STATE_LABELS[d.vetReviewStatus].toLowerCase()}).`,
    };
  }
  const text = comment?.trim() ?? '';
  if (decision === DeclarationReviewStatus.INFIRMEE && !text) {
    return {
      status: 400,
      message: 'Un commentaire est obligatoire pour infirmer une déclaration.',
    };
  }
  if (text.length > REVIEW_COMMENT_MAX) {
    return {
      status: 400,
      message: `Le commentaire fait au plus ${REVIEW_COMMENT_MAX} caractères.`,
    };
  }
  return null;
}
