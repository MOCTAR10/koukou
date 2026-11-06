import { describe, expect, it } from 'vitest';
import { declarationQuery, reviewFormProblem } from './declarationReview';

describe('declaration review (POUFA lot A2 vet)', () => {
  it('builds the register query', () => {
    expect(declarationQuery({ state: 'A_EXAMINER', from: '2026-11-01', to: '' }, 50)).toBe('state=A_EXAMINER&from=2026-11-01&offset=50&limit=50');
    expect(declarationQuery({ state: '', from: '', to: '' }, 0)).toBe('offset=0&limit=50');
  });

  it('requires a comment to rule out', () => {
    expect(reviewFormProblem('INFIRMEE', ' ')).toMatch(/obligatoire/);
    expect(reviewFormProblem('INFIRMEE', 'ok')).toBeNull();
    expect(reviewFormProblem('VALIDEE', '')).toBeNull();
    expect(reviewFormProblem('ALERTE', 'x'.repeat(1001))).toMatch(/1000/);
  });
});
