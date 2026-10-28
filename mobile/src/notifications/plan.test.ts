import { describe, expect, it } from 'vitest';

import type { FarmTask, NextAction } from '@/api/types';
import {
  buildReminderPlan,
  DEFAULT_REMINDER_SETTINGS,
  localAt,
  MAX_DATED_REMINDERS,
  planSignature,
} from './plan';

const task = (id: string, dueDate: string, over: Partial<FarmTask> = {}): FarmTask => ({
  id,
  farmId: 'f',
  assigneeId: null,
  batchId: null,
  title: `Tâche ${id}`,
  notes: null,
  dueDate,
  status: 'A_FAIRE',
  completedAt: null,
  createdById: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...over,
});

const care = (id: string, dueDate: string, batchName = 'Bande A'): NextAction => ({
  id: `care:${id}`,
  level: 'JAUNE',
  category: 'SOIN',
  kind: 'SOIN',
  title: `Soin à venir : Vaccin ${id}`,
  message: '',
  recommendation: null,
  batchId: 'b',
  batchName,
  dueDate,
  status: 'ACTIVE',
  why: [],
  cta: 'Fait',
} as NextAction);

// 28 Oct 2026, 10:00 local.
const now = new Date(2026, 9, 28, 10, 0, 0);
const base = {
  now,
  settings: DEFAULT_REMINDER_SETTINGS,
  farmName: 'Ferme Test',
  hasActiveBatches: true,
  tasks: [] as FarmTask[],
  actions: [] as NextAction[],
};

describe('buildReminderPlan', () => {
  it('rappel quotidien de saisie à l’heure choisie, seulement avec des lots actifs', () => {
    const plan = buildReminderPlan({ ...base, settings: { ...DEFAULT_REMINDER_SETTINGS, dailyEntryHour: 19 } });
    expect(plan.daily).toMatchObject({ hour: 19, minute: 0, title: 'Saisie du jour' });
    expect(plan.daily?.body).toContain('Ferme Test');
    expect(buildReminderPlan({ ...base, hasActiveBatches: false }).daily).toBeNull();
  });

  it('tâches ouvertes : un rappel à 7 h le jour d’échéance, groupé par jour, passé ignoré', () => {
    const plan = buildReminderPlan({
      ...base,
      tasks: [
        task('1', '2026-10-30'),
        task('2', '2026-10-30'),
        task('3', '2026-10-31', { status: 'FAIT' }),
        task('4', '2026-10-28'), // 7 h already passed today
        task('5', '2026-10-20'), // overdue: in-app alert covers it
      ],
    });
    expect(plan.dated).toHaveLength(1);
    expect(plan.dated[0]).toMatchObject({
      key: 'task:2026-10-30',
      title: '2 tâches prévues aujourd’hui',
      body: 'Tâche 1 · Tâche 2',
      route: '/tasks',
    });
    expect(plan.dated[0].at).toEqual(localAt('2026-10-30', 7));
  });

  it('soins prévus (actions SOIN) : rappel le matin du jour prévu, avec le lot', () => {
    const plan = buildReminderPlan({
      ...base,
      actions: [care('Newcastle', '2026-10-29'), { ...care('x', '2026-10-29'), category: 'STOCK_PROVENDE' } as NextAction],
    });
    expect(plan.dated).toEqual([
      expect.objectContaining({
        key: 'care:2026-10-29',
        title: 'Soin prévu aujourd’hui',
        body: 'Vaccin Newcastle — Bande A',
        route: '/sanitary',
      }),
    ]);
  });

  it('désactivé → aucun rappel ; plafond iOS respecté ; signature stable', () => {
    expect(buildReminderPlan({ ...base, settings: { ...DEFAULT_REMINDER_SETTINGS, enabled: false } })).toEqual({
      daily: null,
      dated: [],
    });
    const many = Array.from({ length: 80 }, (_, i) => {
      const d = new Date(2026, 10, 1 + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return task(String(i), iso);
    });
    const plan = buildReminderPlan({ ...base, tasks: many });
    expect(plan.dated).toHaveLength(MAX_DATED_REMINDERS);
    expect(plan.dated[0].key).toBe('task:2026-11-01');
    expect(planSignature(plan)).toBe(planSignature(buildReminderPlan({ ...base, tasks: many })));
  });
});
