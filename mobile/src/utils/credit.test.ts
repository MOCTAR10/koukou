import { describe, expect, it } from 'vitest';
import { creditBadges } from './credit';

describe('creditBadges', () => {
  it('shows nothing for a customer in good standing', () => {
    expect(creditBadges({})).toEqual([]);
  });

  it('puts « En retard » before « Plafond atteint »', () => {
    expect(creditBadges({ overdue: true, limitReached: true }).map((b) => b.label)).toEqual(['En retard', 'Plafond atteint']);
  });

  it('flags a ceiling alone', () => {
    expect(creditBadges({ limitReached: true })).toEqual([{ label: 'Plafond atteint', tone: 'warn' }]);
  });
});
