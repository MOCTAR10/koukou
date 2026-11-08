import { describe, expect, it } from 'vitest';
import { TaskSource } from '../../common/enums/task-source.enum.js';
import { TaskStatus } from '../../common/enums/task-status.enum.js';
import {
  careDesiredState,
  careTaskTitle,
  coveredWeighingSteps,
  reconcile,
  videSanitaireDueDate,
  weighingPlan,
  type DesiredTask,
  type ExistingTask,
} from './task-generation.js';

const MANAGED = [
  TaskSource.PROGRAMME_VACCIN,
  TaskSource.PESEE,
  TaskSource.VIDE_SANITAIRE,
];

const desired = (over: Partial<DesiredTask> = {}): DesiredTask => ({
  source: TaskSource.PROGRAMME_VACCIN,
  stepId: 'e1',
  title: 'Vaccination : Gumboro',
  dueDate: '2026-11-10',
  state: 'OPEN',
  ...over,
});
const stored = (over: Partial<ExistingTask> = {}): ExistingTask => ({
  id: 't1',
  source: TaskSource.PROGRAMME_VACCIN,
  stepId: 'e1',
  title: 'Vaccination : Gumboro',
  dueDate: '2026-11-10',
  status: TaskStatus.A_FAIRE,
  ...over,
});

describe('weighingPlan', () => {
  const base = {
    ageZeroDay: '2026-11-01',
    integrationDate: '2026-11-01',
    frequencyDays: 7,
    durationDays: 28,
    bounded: true,
    today: '2026-11-01',
  };

  it('one weighing per frequency, J0 + age, up to the planned duration', () => {
    const plan = weighingPlan(base);
    expect(plan.map((s) => s.stepId)).toEqual(['J7', 'J14', 'J21', 'J28']);
    expect(plan.map((s) => s.dueDate)).toEqual([
      '2026-11-08',
      '2026-11-15',
      '2026-11-22',
      '2026-11-29',
    ]);
  });

  it('a lot opened at J+x keeps the ages: dates move earlier, past ones are dropped', () => {
    // 10-day-old birds placed on 11-01: J0 = 10-22 ; J7 = 10-29 (before placement).
    const plan = weighingPlan({
      ...base,
      ageZeroDay: '2026-10-22',
    });
    expect(plan[0]).toEqual({ stepId: 'J14', ageDays: 14, dueDate: '2026-11-05' });
    expect(plan.map((s) => s.stepId)).toEqual(['J14', 'J21', 'J28']);
  });

  it('an open-ended lot (layers) is planned a few cycles ahead of its age', () => {
    const plan = weighingPlan({
      ...base,
      bounded: false,
      durationDays: 10,
      today: '2026-11-15',
    });
    // age 14 now, 4 cycles ahead => up to J42.
    expect(plan[plan.length - 1].stepId).toBe('J42');
  });

  it('falls back to a weekly plan without programme parameters', () => {
    const plan = weighingPlan({ ...base, frequencyDays: null, durationDays: null });
    expect(plan[0].stepId).toBe('J7');
    expect(plan[plan.length - 1].stepId).toBe('J42');
  });
});

describe('coveredWeighingSteps', () => {
  const steps = weighingPlan({
    ageZeroDay: '2026-11-01',
    integrationDate: '2026-11-01',
    frequencyDays: 7,
    durationDays: 28,
    bounded: true,
    today: '2026-11-01',
  });

  it('a weighing covers the steps due on or before it', () => {
    expect([...coveredWeighingSteps(steps, ['2026-11-16'])].sort()).toEqual([
      'J14',
      'J7',
    ]);
  });

  it('an early weighing (within 3 days) covers the next step only', () => {
    expect(
      [...coveredWeighingSteps(steps, ['2026-11-08', '2026-11-13'])].sort(),
    ).toEqual(['J14', 'J7']);
    expect(coveredWeighingSteps(steps, ['2026-11-13']).size).toBe(1);
  });

  it('a weighing too early covers nothing', () => {
    expect(coveredWeighingSteps(steps, ['2026-11-03']).size).toBe(0);
  });
});

describe('reconcile', () => {
  it('creates the missing tasks', () => {
    const plan = reconcile([desired()], [], MANAGED);
    expect(plan.create).toHaveLength(1);
  });

  it('is idempotent: nothing to do once the task exists with the same data', () => {
    const plan = reconcile([desired()], [stored()], MANAGED);
    expect(plan).toEqual({ create: [], update: [], complete: [], cancel: [] });
  });

  it('reschedules an open task whose date moved', () => {
    const plan = reconcile([desired({ dueDate: '2026-11-12' })], [stored()], MANAGED);
    expect(plan.update).toEqual([
      { id: 't1', dueDate: '2026-11-12', title: 'Vaccination : Gumboro' },
    ]);
  });

  it('never touches a done or cancelled task', () => {
    for (const status of [TaskStatus.FAIT, TaskStatus.ANNULEE]) {
      const plan = reconcile(
        [desired({ dueDate: '2026-11-20' })],
        [stored({ status })],
        MANAGED,
      );
      expect(plan).toEqual({ create: [], update: [], complete: [], cancel: [] });
    }
  });

  it('completes or cancels the open task following the source', () => {
    expect(reconcile([desired({ state: 'DONE' })], [stored()], MANAGED).complete).toEqual(['t1']);
    expect(reconcile([desired({ state: 'CANCELLED' })], [stored()], MANAGED).cancel).toEqual(['t1']);
  });

  it('does not create a task already done or cancelled, nor a past one flagged noBackfill', () => {
    expect(reconcile([desired({ state: 'DONE' })], [], MANAGED).create).toEqual([]);
    expect(
      reconcile(
        [desired({ dueDate: '2026-11-01', noBackfillBefore: '2026-11-05' })],
        [],
        MANAGED,
      ).create,
    ).toEqual([]);
  });

  it('cancels an open generated task that no longer matches a step, never a manual one', () => {
    const plan = reconcile(
      [],
      [
        stored({ id: 'orphan' }),
        stored({ id: 'manual', source: TaskSource.MANUELLE, stepId: null }),
      ],
      MANAGED,
    );
    expect(plan.cancel).toEqual(['orphan']);
  });
});

describe('small helpers', () => {
  it('cleaning is due within 3 days of the closure, sooner if the vacancy minimum is shorter', () => {
    expect(videSanitaireDueDate('2026-11-10', 7)).toBe('2026-11-13');
    expect(videSanitaireDueDate('2026-11-10', 1)).toBe('2026-11-11');
    expect(videSanitaireDueDate('2026-11-10', null)).toBe('2026-11-13');
  });

  it('maps care statuses to task states and titles', () => {
    expect(careDesiredState('PLANIFIE')).toBe('OPEN');
    expect(careDesiredState('EN_RETARD')).toBe('OPEN');
    expect(careDesiredState('FAIT')).toBe('DONE');
    expect(careDesiredState('ANNULE')).toBe('CANCELLED');
    expect(careTaskTitle('VACCIN', 'Newcastle')).toBe('Vaccination : Newcastle');
    expect(careTaskTitle('MEDICAMENT', 'Amprolium')).toBe('Soin : Amprolium');
  });
});
