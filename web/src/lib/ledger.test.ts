import { describe, expect, it } from 'vitest';
import { dayBefore, runningBalances } from './ledger';

describe('grand livre helpers', () => {
  it('accumulates debit - credit from the opening balance', () => {
    expect(
      runningBalances(100, [
        { debitFcfa: 50, creditFcfa: 0 },
        { debitFcfa: 0, creditFcfa: 200 },
      ]),
    ).toEqual([150, -50]);
    expect(runningBalances(0, [])).toEqual([]);
  });
  it('finds the day before, across month and year boundaries', () => {
    expect(dayBefore('2026-11-06')).toBe('2026-11-05');
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
  });
});
