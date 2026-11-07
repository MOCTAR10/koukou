/**
 * Pure rules of the next-visit reminders. A visit plans the next one
 * (`nextVisitDate`); only the LATEST visit of a farm counts: a newer visit,
 * whatever its own next date, closes the plan of the older ones.
 */

export type ReminderStage = 'AVANT' | 'JOUR' | 'RETARD';

export interface ReminderDue {
  stage: ReminderStage;
  /** Days left (AVANT), 0 (JOUR) or days past (RETARD). */
  days: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

/**
 * Stage of a planned visit on `today` (both YYYY-MM-DD): AVANT from
 * `leadDays` before the date, JOUR on the date, RETARD after it; null when
 * it is further away than `leadDays`. `leadDays` 0 = no advance reminder.
 */
export function reminderDue(
  nextVisitDate: string,
  today: string,
  leadDays: number,
): ReminderDue | null {
  const left = dayNumber(nextVisitDate) - dayNumber(today);
  if (left < 0) return { stage: 'RETARD', days: -left };
  if (left === 0) return { stage: 'JOUR', days: 0 };
  if (left <= leadDays) return { stage: 'AVANT', days: left };
  return null;
}

/** Latest visit of a farm with the planned date (null: no next visit planned). */
export interface FarmLatestVisit {
  id: string;
  farmId: string;
  agentUserId: string;
  nextVisitDate: string | null;
}

/** Visits whose plan is due on `today`; farms without a planned date are skipped. */
export function dueReminders<T extends FarmLatestVisit>(
  latest: readonly T[],
  today: string,
  leadDays: (visit: T) => number,
): (T & ReminderDue & { nextVisitDate: string })[] {
  const out: (T & ReminderDue & { nextVisitDate: string })[] = [];
  for (const v of latest) {
    if (!v.nextVisitDate) continue;
    const due = reminderDue(v.nextVisitDate, today, leadDays(v));
    if (due) out.push({ ...v, ...due, nextVisitDate: v.nextVisitDate });
  }
  return out;
}
