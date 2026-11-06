import { DeclarationReviewStatus } from '../../common/enums/declaration-review.enum.js';
import { reviewProblem, reviewStateOf } from './declaration-review-rules.js';

const fresh = { vetReviewStatus: null, alertCode: null };

describe('declaration review (CDC n° 26, POUFA lot A2 vet)', () => {
  it('derives the state from the review, then the alert', () => {
    expect(reviewStateOf({ vetReviewStatus: null, alertId: null })).toBe('A_EXAMINER');
    expect(reviewStateOf({ vetReviewStatus: null, alertId: 'a' })).toBe('ALERTE');
    expect(
      reviewStateOf({ vetReviewStatus: DeclarationReviewStatus.VALIDEE, alertId: null }),
    ).toBe('VALIDEE');
    expect(
      reviewStateOf({ vetReviewStatus: DeclarationReviewStatus.ALERTE, alertId: 'a' }),
    ).toBe('ALERTE');
  });

  it('accepts one decision on a declaration without alert', () => {
    expect(reviewProblem(fresh, DeclarationReviewStatus.VALIDEE, undefined)).toBeNull();
    expect(reviewProblem(fresh, DeclarationReviewStatus.ALERTE, '')).toBeNull();
    expect(reviewProblem(fresh, DeclarationReviewStatus.INFIRMEE, 'Pas de signe')).toBeNull();
  });

  it('requires a comment to rule out, and bounds it', () => {
    expect(reviewProblem(fresh, DeclarationReviewStatus.INFIRMEE, '  ')).toMatchObject({
      status: 400,
      message: expect.stringContaining('commentaire est obligatoire'),
    });
    expect(
      reviewProblem(fresh, DeclarationReviewStatus.VALIDEE, 'x'.repeat(1001)),
    ).toMatchObject({ status: 400 });
  });

  it('refuses a second decision and a declaration in the alert circuit (409)', () => {
    expect(
      reviewProblem(
        { vetReviewStatus: DeclarationReviewStatus.VALIDEE, alertCode: null },
        DeclarationReviewStatus.INFIRMEE,
        'x',
      ),
    ).toMatchObject({ status: 409, message: expect.stringContaining('déjà été examinée (validée)') });
    expect(
      reviewProblem({ vetReviewStatus: null, alertCode: 'AS-2026-0001' }, DeclarationReviewStatus.VALIDEE, null),
    ).toMatchObject({ status: 409, message: expect.stringContaining('AS-2026-0001') });
  });
});
