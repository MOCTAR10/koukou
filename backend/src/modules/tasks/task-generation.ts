/**
 * Pure rules of the tasks generated from the programmes (no I/O): the
 * services read the lot, its cares and its weighings, build the tasks that
 * should exist (`desired`) and `reconcile` them with the ones stored.
 */
import { TaskSource } from '../../common/enums/task-source.enum.js';
import { TaskStatus } from '../../common/enums/task-status.enum.js';

const DAY_MS = 86_400_000;

export function addDaysIso(day: string, n: number): string {
  return new Date(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** A weighing within this many days before its due date still counts for it. */
export const WEIGHING_EARLY_TOLERANCE_DAYS = 3;
/** Default weighing frequency when the programme gives none. */
export const DEFAULT_WEIGHING_FREQUENCY_DAYS = 7;
/** Default planned duration (days) when the programme gives none. */
export const DEFAULT_WEIGHING_DURATION_DAYS = 45;
/** Non-chair lots (layers) have no planned end: weighings are planned this many cycles ahead. */
export const OPEN_ENDED_WEIGHING_CYCLES = 4;
/** Safety cap on the number of weighing tasks of one lot. */
export const MAX_WEIGHING_TASKS = 60;
/** Cleaning starts within this many days of the closure (never later than the vacancy minimum). */
export const VIDE_SANITAIRE_TASK_DELAY_DAYS = 3;

export type DesiredState = 'OPEN' | 'DONE' | 'CANCELLED';

/** A task that should exist for the lot, according to its programmes. */
export interface DesiredTask {
  source: TaskSource;
  stepId: string;
  title: string;
  dueDate: string;
  state: DesiredState;
  notes?: string | null;
  /** When no task exists yet, do not create it if its due date is before this day. */
  noBackfillBefore?: string;
}

export interface ExistingTask {
  id: string;
  source: TaskSource;
  stepId: string | null;
  title: string;
  dueDate: string;
  status: TaskStatus;
}

export interface ReconcilePlan {
  create: DesiredTask[];
  /** Open tasks whose due date or title moved. */
  update: { id: string; dueDate: string; title: string }[];
  complete: string[];
  cancel: string[];
}

const isOpen = (s: TaskStatus) =>
  s === TaskStatus.A_FAIRE || s === TaskStatus.EN_COURS;

const keyOf = (source: TaskSource, stepId: string | null) =>
  `${source}|${stepId ?? ''}`;

/**
 * Compares what should exist with what is stored. Idempotent: applying the
 * plan then reconciling again gives an empty plan. Only OPEN tasks are ever
 * touched (a done or cancelled task is history); an open generated task of a
 * managed source that no longer matches any step is cancelled.
 */
export function reconcile(
  desired: readonly DesiredTask[],
  existing: readonly ExistingTask[],
  managedSources: readonly TaskSource[],
): ReconcilePlan {
  const plan: ReconcilePlan = { create: [], update: [], complete: [], cancel: [] };
  const byKey = new Map<string, ExistingTask>();
  for (const e of existing) {
    if (e.stepId != null) byKey.set(keyOf(e.source, e.stepId), e);
  }
  const wanted = new Set<string>();
  for (const d of desired) {
    const key = keyOf(d.source, d.stepId);
    wanted.add(key);
    const ex = byKey.get(key);
    if (!ex) {
      if (d.state !== 'OPEN') continue;
      if (d.noBackfillBefore && d.dueDate < d.noBackfillBefore) continue;
      plan.create.push(d);
      continue;
    }
    if (!isOpen(ex.status)) continue;
    if (d.state === 'DONE') plan.complete.push(ex.id);
    else if (d.state === 'CANCELLED') plan.cancel.push(ex.id);
    else if (ex.dueDate.slice(0, 10) !== d.dueDate || ex.title !== d.title) {
      plan.update.push({ id: ex.id, dueDate: d.dueDate, title: d.title });
    }
  }
  for (const e of existing) {
    if (
      e.stepId != null &&
      isOpen(e.status) &&
      managedSources.includes(e.source) &&
      !wanted.has(keyOf(e.source, e.stepId))
    ) {
      plan.cancel.push(e.id);
    }
  }
  return plan;
}

export interface WeighingStep {
  stepId: string;
  ageDays: number;
  dueDate: string;
}

/**
 * Weighing plan of a lot: one weighing every `frequencyDays` of age, from
 * `frequencyDays` up to the planned duration (chicken for meat) or, for an
 * open-ended lot (layers), a few cycles past its current age. Dates are
 * J0 + age, so a lot opened at J+x gets its weighings at the same ages as
 * any other lot; steps before the placement day are dropped.
 */
export function weighingPlan(input: {
  /** Day the birds were at age 0 (J0). */
  ageZeroDay: string;
  integrationDate: string;
  frequencyDays: number | null;
  durationDays: number | null;
  /** Meat lots stop at their planned duration. */
  bounded: boolean;
  today: string;
}): WeighingStep[] {
  const freq = Math.max(
    1,
    Math.floor(input.frequencyDays ?? DEFAULT_WEIGHING_FREQUENCY_DAYS),
  );
  const duration =
    input.durationDays ?? DEFAULT_WEIGHING_DURATION_DAYS;
  const placement = input.integrationDate.slice(0, 10);
  const ageToday = Math.max(
    0,
    Math.round(
      (Date.parse(`${input.today}T00:00:00Z`) -
        Date.parse(`${input.ageZeroDay}T00:00:00Z`)) /
        DAY_MS,
    ),
  );
  const maxAge = input.bounded
    ? duration
    : Math.max(duration, ageToday + OPEN_ENDED_WEIGHING_CYCLES * freq);
  const steps: WeighingStep[] = [];
  for (
    let age = freq;
    age <= maxAge && steps.length < MAX_WEIGHING_TASKS;
    age += freq
  ) {
    const dueDate = addDaysIso(input.ageZeroDay, age);
    if (dueDate < placement) continue;
    steps.push({ stepId: `J${age}`, ageDays: age, dueDate });
  }
  return steps;
}

/**
 * Steps already covered by a recorded weighing. A weighing covers every
 * uncovered step due on or before it; failing that, the first uncovered step
 * due within `WEIGHING_EARLY_TOLERANCE_DAYS` after it (an early weighing).
 */
export function coveredWeighingSteps(
  steps: readonly WeighingStep[],
  weighingDates: readonly string[],
): Set<string> {
  const covered = new Set<string>();
  const sorted = [...weighingDates].map((d) => d.slice(0, 10)).sort();
  for (const w of sorted) {
    let any = false;
    for (const s of steps) {
      if (!covered.has(s.stepId) && s.dueDate <= w) {
        covered.add(s.stepId);
        any = true;
      }
    }
    if (any) continue;
    const limit = addDaysIso(w, WEIGHING_EARLY_TOLERANCE_DAYS);
    const next = steps.find((s) => !covered.has(s.stepId) && s.dueDate <= limit);
    if (next) covered.add(next.stepId);
  }
  return covered;
}

/** Due date of the cleaning task after a closure. */
export function videSanitaireDueDate(
  closedDay: string,
  minVacancyDays: number | null,
): string {
  const delay = Math.max(
    0,
    Math.min(VIDE_SANITAIRE_TASK_DELAY_DAYS, minVacancyDays ?? VIDE_SANITAIRE_TASK_DELAY_DAYS),
  );
  return addDaysIso(closedDay, delay);
}

/** Care states mirrored by a task. */
export function careDesiredState(
  status: 'PLANIFIE' | 'EN_RETARD' | 'FAIT' | 'ANNULE',
): DesiredState {
  if (status === 'FAIT') return 'DONE';
  if (status === 'ANNULE') return 'CANCELLED';
  return 'OPEN';
}

export function careTaskTitle(careType: string, name: string): string {
  return careType === 'VACCIN' ? `Vaccination : ${name}` : `Soin : ${name}`;
}

export function weighingTaskTitle(ageDays: number): string {
  return `Pesée du lot (J${ageDays})`;
}

export const VIDE_SANITAIRE_TASK_TITLE = 'Nettoyage et vide sanitaire du bâtiment';
