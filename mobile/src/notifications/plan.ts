import type { FarmTask, NextAction } from '@/api/types';

/**
 * Local reminders (scheduled on the phone, no server push): they work in
 * Expo Go and offline. Pure planning logic — the scheduling side lives in
 * `scheduler.ts`.
 */

export interface ReminderSettings {
  enabled: boolean;
  /** Daily « saisie du jour » reminder, local time. */
  dailyEntryHour: number;
  /** Time of the morning reminder for tasks and care due that day. */
  morningHour: number;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  dailyEntryHour: 18,
  morningHour: 7,
};

export interface DatedReminder {
  /** Stable identifier (also the notification identifier). */
  key: string;
  title: string;
  body: string;
  /** Local fire time. */
  at: Date;
  /** Screen to open when the notification is tapped. */
  route: string;
}

export interface ReminderPlan {
  /** Repeating daily reminder (null when there is nothing to record). */
  daily: { hour: number; minute: number; title: string; body: string; route: string } | null;
  dated: DatedReminder[];
}

/** iOS keeps at most 64 pending local notifications per app. */
export const MAX_DATED_REMINDERS = 50;

/** Local midnight-based Date for a YYYY-MM-DD string at `hour`:00. */
export function localAt(date: string, hour: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hour, 0, 0, 0);
}

export function buildReminderPlan(input: {
  now: Date;
  settings: ReminderSettings;
  farmName: string;
  hasActiveBatches: boolean;
  tasks: FarmTask[];
  actions: NextAction[];
}): ReminderPlan {
  const { now, settings } = input;
  if (!settings.enabled) return { daily: null, dated: [] };

  const dated: DatedReminder[] = [];

  // Tasks still open: morning of the due date.
  const byDay = new Map<string, FarmTask[]>();
  for (const t of input.tasks) {
    if (t.status === 'FAIT' || t.status === 'ANNULEE') continue;
    const list = byDay.get(t.dueDate) ?? [];
    list.push(t);
    byDay.set(t.dueDate, list);
  }
  for (const [day, tasks] of byDay) {
    const at = localAt(day, settings.morningHour);
    if (at <= now) continue;
    dated.push({
      key: `task:${day}`,
      title: tasks.length > 1 ? `${tasks.length} tâches prévues aujourd’hui` : 'Tâche prévue aujourd’hui',
      body: tasks.map((t) => t.title).slice(0, 3).join(' · ') + (tasks.length > 3 ? '…' : ''),
      at,
      route: '/tasks',
    });
  }

  // Planned care (vaccines, treatments): morning of the scheduled day.
  const careByDay = new Map<string, NextAction[]>();
  for (const a of input.actions) {
    if (a.category !== 'SOIN' || !a.dueDate) continue;
    const list = careByDay.get(a.dueDate) ?? [];
    list.push(a);
    careByDay.set(a.dueDate, list);
  }
  for (const [day, care] of careByDay) {
    const at = localAt(day, settings.morningHour);
    if (at <= now) continue;
    dated.push({
      key: `care:${day}`,
      title: care.length > 1 ? `${care.length} soins prévus aujourd’hui` : 'Soin prévu aujourd’hui',
      body: care
        .map((a) => `${a.title.replace(/^Soin (à venir|en retard) : /, '')}${a.batchName ? ` — ${a.batchName}` : ''}`)
        .slice(0, 3)
        .join(' · ') + (care.length > 3 ? '…' : ''),
      at,
      route: '/sanitary',
    });
  }

  dated.sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    daily: input.hasActiveBatches
      ? {
          hour: settings.dailyEntryHour,
          minute: 0,
          title: 'Saisie du jour',
          body: `Pensez à enregistrer morts, aliment, eau et poids de ${input.farmName}.`,
          route: '/(tabs)',
        }
      : null,
    dated: dated.slice(0, MAX_DATED_REMINDERS),
  };
}

/** Stable fingerprint: reschedule only when the plan actually changes. */
export function planSignature(plan: ReminderPlan): string {
  return JSON.stringify({
    d: plan.daily,
    r: plan.dated.map((r) => [r.key, r.at.getTime(), r.title, r.body]),
  });
}
