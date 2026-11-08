import { todayLocal } from './date.utils.js';

describe('todayLocal (Gabon business day)', () => {
  it('is already the next day in Libreville at 23:30 UTC', () => {
    expect(todayLocal(new Date('2026-11-07T23:30:00Z'))).toBe('2026-11-08');
  });

  it('matches the UTC day during the day', () => {
    expect(todayLocal(new Date('2026-11-08T10:00:00Z'))).toBe('2026-11-08');
  });

  it('crosses the year at local midnight', () => {
    expect(todayLocal(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
  });
});
