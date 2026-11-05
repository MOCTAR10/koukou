import { EventEmitter } from 'node:events';

export interface BatchClosedEvent {
  farmId: string;
  batchId: string;
  /** POUFA band closed automatically at zero headcount. */
  auto?: boolean;
}

/** A POUFA band missed its weighing (PESEE_FREQUENCE_J); once per due date. */
export interface WeighingLateEvent {
  farmId: string;
  batchId: string;
  code: string | null;
  dueDate: string;
  daysLate: number;
}

/** Offline writes met changes from another device (`sync_conflicts` ids). */
export interface SyncConflictEvent {
  farmId: string;
  batchId: string | null;
  conflictIds: string[];
}

export interface DailyEntryCreatedEvent {
  farmId: string;
  batchId: string;
  entryDate: string;
}

export interface SaleChangedEvent {
  farmId: string;
}

/** A red alert appeared (new, or escalated to ROUGE). */
export interface AlertRaisedEvent {
  farmId: string;
  alertId: string;
  kind: string;
  message: string;
}

/** A task was given to someone other than the person who assigned it. */
export interface TaskAssignedEvent {
  farmId: string;
  taskId: string;
  assigneeId: string;
  assignedById: string;
  title: string;
  dueDate: string;
}

/** Tasks that just went past their due date (each reported once). */
export interface TasksOverdueEvent {
  farmId: string;
  tasks: Array<{
    id: string;
    title: string;
    dueDate: string;
    assigneeId: string | null;
  }>;
}

/**
 * Bus d'événements in-process minimal : permet aux modules de s'abonner à des
 * moments clés sans créer de dépendances circulaires (ex. clôture d'un lot →
 * évaluation du P&L / alertes de rentabilité).
 */
export const KOUKOU_EVENTS = {
  BATCH_CLOSED: 'batch.closed',
  DAILY_ENTRY_CREATED: 'daily.entry.created',
  SALE_CHANGED: 'sale.changed',
  ALERT_RAISED: 'alert.raised',
  TASK_ASSIGNED: 'task.assigned',
  TASKS_OVERDUE: 'tasks.overdue',
  WEIGHING_LATE: 'weighing.late',
  SYNC_CONFLICT: 'sync.conflict',
} as const;

class FermiaBus extends EventEmitter {}

export const koukouBus = new FermiaBus();
koukouBus.setMaxListeners(50);
