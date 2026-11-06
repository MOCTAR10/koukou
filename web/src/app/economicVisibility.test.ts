import { describe, expect, it } from 'vitest';
import { showsCollectedToday } from './economicVisibility';

describe('showsCollectedToday (F6)', () => {
  const only = (...domains: string[]) => (d: string) => domains.includes(d);
  it('shows the cash of the day with ECONOMIQUE or VENTES, and a value', () => {
    expect(showsCollectedToday(1000, only('ECONOMIQUE'))).toBe(true);
    expect(showsCollectedToday(0, only('VENTES'))).toBe(true);
    expect(showsCollectedToday(1000, only('TECHNIQUE'))).toBe(false);
    expect(showsCollectedToday(null, only('ECONOMIQUE', 'VENTES'))).toBe(false);
    expect(showsCollectedToday(undefined, () => true)).toBe(false);
  });
});
