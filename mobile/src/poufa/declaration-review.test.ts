import { describe, expect, it } from 'vitest';
import { canReviewDeclarations, reviewBadge, reviewBody, reviewFormProblem } from './declaration-review';

describe('canReviewDeclarations', () => {
  it('needs an institution with SANITAIRE:VALIDER', () => {
    expect(canReviewDeclarations('INSTITUTION', { SANITAIRE: ['CONSULTER', 'VALIDER'] })).toBe(true);
    expect(canReviewDeclarations('INSTITUTION', { SANITAIRE: ['CONSULTER'] })).toBe(false);
    expect(canReviewDeclarations('INSTITUTION', null)).toBe(false);
    expect(canReviewDeclarations('PLATFORM_ADMIN', { SANITAIRE: ['VALIDER'] })).toBe(false);
    expect(canReviewDeclarations('PROPRIETAIRE', null)).toBe(false);
  });
});

describe('reviewBadge', () => {
  it('waits for the vets while there is no decision', () => {
    expect(reviewBadge({})).toEqual({ label: 'En attente du vétérinaire', tone: 'neutral', comment: null });
    expect(reviewBadge({ vetReviewStatus: null }).label).toBe('En attente du vétérinaire');
  });
  it('shows the decision and its comment', () => {
    expect(reviewBadge({ vetReviewStatus: 'VALIDEE' })).toMatchObject({ label: 'Vétérinaire : validée', tone: 'success' });
    expect(reviewBadge({ vetReviewStatus: 'INFIRMEE', vetReviewComment: ' Écarté ' })).toMatchObject({ tone: 'warn', comment: 'Écarté' });
    expect(reviewBadge({ vetReviewStatus: 'ALERTE' }).tone).toBe('danger');
  });
});

describe('review form', () => {
  it('requires a comment to rule out', () => {
    expect(reviewFormProblem('INFIRMEE', '  ')).toMatch(/obligatoire/);
    expect(reviewFormProblem('INFIRMEE', 'ok')).toBeNull();
    expect(reviewFormProblem('VALIDEE', '')).toBeNull();
    expect(reviewFormProblem('VALIDEE', 'x'.repeat(1001))).toMatch(/1000/);
  });
  it('omits an empty comment', () => {
    expect(reviewBody('VALIDEE', ' ')).toEqual({ decision: 'VALIDEE' });
    expect(reviewBody('ALERTE', ' go ')).toEqual({ decision: 'ALERTE', comment: 'go' });
  });
});
