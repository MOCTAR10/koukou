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

/** A band's `bande_daily_stats` projection was rewritten (after commit). */
export interface BandeStatsRefreshedEvent {
  farmId: string;
  batchId: string;
  programId: string;
}

/** An official sanitary alert was opened, changed status or was published. */
export interface SanitaryAlertEvent {
  alertId: string;
  farmId: string;
  batchId: string | null;
  /** `AS-2026-0001`. */
  code: string;
  /** `SanitaryAlertOrigin`. */
  origin: string;
  statusCode: string;
  statusFamily: string;
  /** `AlertLevel`. */
  severity: string;
  /** The transition that produced the event (status change, publication). */
  transitionId?: string;
}

/** A sanitary declaration (`HealthEvent`) was recorded (after commit). */
export interface DeclarationReceivedEvent {
  farmId: string;
  batchId: string;
  healthEventId: string;
  /** `HealthEventKind`. */
  kind: string;
  /** `AlertLevel`. */
  severity: string;
  suspicion: boolean;
}

// POUFA lot A2 vet (begin): veterinary review of a declaration (CDC n° 26).
/** The veterinary services examined a declaration (after commit). */
export interface DeclarationReviewedEvent {
  farmId: string;
  batchId: string;
  healthEventId: string;
  /** `DeclarationReviewStatus`. */
  status: string;
  /** Declaration date (`YYYY-MM-DD`) and title, for the farm's text. */
  occurredAt: string;
  title: string;
  /** The alert it was converted into (status ALERTE). */
  alertId: string | null;
  alertCode: string | null;
}
// POUFA lot A2 vet (end).

/**
 * A scheduled report was generated (L6 reporting): « rapport disponible » for
 * its recipients, delivered in-app by the notification module (L5).
 */
export interface ReportReadyEvent {
  runId: string;
  templateCode: string;
  title: string;
  level: string;
  periodStart: string;
  periodEnd: string;
  provinceId: string | null;
  farmId: string | null;
  batchId: string | null;
  /** Accounts told the report is available (owner, institutional members). */
  recipientUserIds: string[];
  /** In-app route of the PDF. */
  downloadPath: string;
  // POUFA lot A pilot: what the notification rules of REPORT_READY need.
  programId: string;
  /** The same recipients, with their kind and profile (rule audiences). */
  recipients: {
    userId: string;
    kind: 'OWNER' | 'MEMBER';
    profileCode: string | null;
  }[];
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
  BANDE_STATS_REFRESHED: 'bande.stats.refreshed',
  SANITARY_ALERT_CREATED: 'sanitary.alert.created',
  SANITARY_ALERT_STATUS_CHANGED: 'sanitary.alert.status.changed',
  SANITARY_ALERT_PUBLISHED: 'sanitary.alert.published',
  DECLARATION_RECEIVED: 'sanitary.declaration.received',
  REPORT_READY: 'report.ready',
  // POUFA lot A2 vet.
  DECLARATION_REVIEWED: 'sanitary.declaration.reviewed',
} as const;

class FermiaBus extends EventEmitter {}

export const koukouBus = new FermiaBus();
koukouBus.setMaxListeners(50);
