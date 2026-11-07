import { describe, expect, it } from 'vitest';
import { dueReminders, reminderDue } from './visit-reminders.js';

describe('reminderDue', () => {
  it('is silent beyond the lead time', () => {
    expect(reminderDue('2026-11-20', '2026-11-10', 2)).toBeNull();
    expect(reminderDue('2026-11-13', '2026-11-10', 2)).toBeNull();
  });
  it('reminds from lead days before, then on the day', () => {
    expect(reminderDue('2026-11-12', '2026-11-10', 2)).toEqual({ stage: 'AVANT', days: 2 });
    expect(reminderDue('2026-11-11', '2026-11-10', 2)).toEqual({ stage: 'AVANT', days: 1 });
    expect(reminderDue('2026-11-10', '2026-11-10', 2)).toEqual({ stage: 'JOUR', days: 0 });
  });
  it('flags a passed date as overdue, across a month end', () => {
    expect(reminderDue('2026-10-30', '2026-11-02', 2)).toEqual({ stage: 'RETARD', days: 3 });
  });
  it('lead 0 only reminds on the day', () => {
    expect(reminderDue('2026-11-11', '2026-11-10', 0)).toBeNull();
    expect(reminderDue('2026-11-10', '2026-11-10', 0)?.stage).toBe('JOUR');
  });
});

describe('dueReminders', () => {
  const v = (id: string, next: string | null) => ({
    id,
    farmId: `f${id}`,
    agentUserId: 'u1',
    nextVisitDate: next,
  });
  it('skips visits without a planned date and those out of range', () => {
    const out = dueReminders(
      [v('1', null), v('2', '2026-12-01'), v('3', '2026-11-11'), v('4', '2026-11-01')],
      '2026-11-10',
      () => 2,
    );
    expect(out.map((o) => [o.id, o.stage])).toEqual([
      ['3', 'AVANT'],
      ['4', 'RETARD'],
    ]);
  });
});
