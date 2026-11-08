import { describe, expect, it } from 'vitest';
import {
  addDays,
  creditRefusalMessage,
  daysBetween,
  dueDateOf,
  isLimitReached,
  summarizeCredit,
} from './credit.js';
import { todayLocal } from '../../common/utils/date.utils.js';

describe('credit helpers', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
    expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3);
  });

  it('has no due date without a payment term', () => {
    expect(dueDateOf('2026-03-01', null)).toBeNull();
    expect(dueDateOf('2026-03-01', 30)).toBe('2026-03-31');
  });

  it('counts an invoice late only the day after its due date', () => {
    const inv = [{ remainingFcfa: 5000, baseDate: '2026-03-01' }];
    expect(summarizeCredit(inv, 10, '2026-03-11').overdueAmount).toBe(0);
    const late = summarizeCredit(inv, 10, '2026-03-14');
    expect(late.overdueAmount).toBe(5000);
    expect(late.oldestOverdueDays).toBe(3);
  });

  it('keeps the oldest overdue age and ignores settled invoices', () => {
    const s = summarizeCredit(
      [
        { remainingFcfa: 1000, baseDate: '2026-02-01' },
        { remainingFcfa: 2000, baseDate: '2026-03-01' },
        { remainingFcfa: 0, baseDate: '2026-01-01' },
      ],
      15,
      '2026-03-20',
    );
    expect(s).toEqual({ outstandingFcfa: 3000, overdueAmount: 3000, oldestOverdueDays: 32 });
  });

  it('is never overdue without a term', () => {
    const s = summarizeCredit([{ remainingFcfa: 900, baseDate: '2020-01-01' }], null, '2026-03-20');
    expect(s.overdueAmount).toBe(0);
    expect(s.outstandingFcfa).toBe(900);
  });

  it('uses the Libreville day just after midnight local time', () => {
    // 23:30 UTC on the 1st is already the 2nd in Libreville (UTC+1).
    expect(todayLocal(new Date('2026-03-01T23:30:00Z'))).toBe('2026-03-02');
  });

  it('detects the ceiling and words the refusal in French', () => {
    expect(isLimitReached(100_000, 100_000)).toBe(true);
    expect(isLimitReached(99_999, 100_000)).toBe(false);
    expect(isLimitReached(5, null)).toBe(false);
    expect(creditRefusalMessage(80_000, 100_000, 30_000)).toMatch(/Plafond de crédit dépassé/);
  });
});
