import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { creditBadges, creditRefusal, parseOptionalCount } from './credit';

describe('creditBadges', () => {
  it('shows nothing for a customer in good standing', () => {
    expect(creditBadges({})).toEqual([]);
  });

  it('puts « En retard » before « Plafond atteint »', () => {
    const badges = creditBadges({ overdue: true, oldestOverdueDays: 5, limitReached: true });
    expect(badges.map((b) => b.label)).toEqual(['En retard', 'Plafond atteint']);
    expect(badges[0].title).toContain('5 jours');
  });
});

describe('creditRefusal', () => {
  it('reads the 409 of the credit ceiling', () => {
    const err = new ApiError(409, 'Plafond de crédit dépassé : …', {
      code: 'PLAFOND_CREDIT',
      outstandingFcfa: 60000,
      creditLimitFcfa: 100000,
      overridable: true,
    });
    expect(creditRefusal(err)).toMatchObject({ outstandingFcfa: 60000, creditLimitFcfa: 100000, overridable: true });
  });

  it('ignores other conflicts and other errors', () => {
    expect(creditRefusal(new ApiError(409, 'Conflit', { code: 'AUTRE' }))).toBeNull();
    expect(creditRefusal(new ApiError(400, 'x', { code: 'PLAFOND_CREDIT' }))).toBeNull();
    expect(creditRefusal(new Error('x'))).toBeNull();
  });
});

describe('parseOptionalCount', () => {
  it('maps empty to null, digits to a number and the rest to NaN', () => {
    expect(parseOptionalCount('  ')).toBeNull();
    expect(parseOptionalCount('100000')).toBe(100000);
    expect(Number.isNaN(parseOptionalCount('-5'))).toBe(true);
    expect(Number.isNaN(parseOptionalCount('1,5'))).toBe(true);
  });
});
