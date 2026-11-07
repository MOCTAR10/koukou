/**
 * Events the notify module reports (`NotificationRule.event`). Each one is
 * fed by a `koukouBus` event; the rules saying who hears it, and through
 * which channels, are data edited by the administration.
 */
export enum NotificationEvent {
  /** A new red advisory alert, or one escalated to ROUGE (Fermia `Alert`). */
  ALERT_RAISED = 'ALERT_RAISED',
  /** An official sanitary alert was opened (mortality threshold or suspicion). */
  SANITARY_ALERT_CREATED = 'SANITARY_ALERT_CREATED',
  /** An official sanitary alert changed status (qualification circuit). */
  SANITARY_ALERT_STATUS_CHANGED = 'SANITARY_ALERT_STATUS_CHANGED',
  /** The veterinary authority published an official sanitary alert. */
  SANITARY_ALERT_PUBLISHED = 'SANITARY_ALERT_PUBLISHED',
  /** A farm recorded a sanitary declaration (`HealthEvent`). */
  DECLARATION_RECEIVED = 'DECLARATION_RECEIVED',
  /** A POUFA band missed its weighing. */
  WEIGHING_LATE = 'WEIGHING_LATE',
  /** Offline writes met changes from another device. */
  SYNC_CONFLICT = 'SYNC_CONFLICT',
  /** A scheduled report (PDF) is available (L6, POUFA lot A). */
  REPORT_READY = 'REPORT_READY',
  // POUFA lot A2 vet: CDC n° 26, the farm hears the vets' decision.
  /** The veterinary services examined a declaration (validated, ruled out, alert). */
  DECLARATION_REVIEWED = 'DECLARATION_REVIEWED',
  // Visit reminders: the next technical visit is near, or past.
  /** The planned next visit of a farm is in N days or today. */
  VISIT_REMINDER = 'VISIT_REMINDER',
  /** The planned next visit date passed and no newer visit was recorded. */
  VISIT_OVERDUE = 'VISIT_OVERDUE',
}

/** Delivery channel of one notification. */
export enum NotificationChannel {
  /** The in-app inbox (`GET /notifications`). */
  IN_APP = 'IN_APP',
  /** Server push through `PushService` (Expo). */
  PUSH = 'PUSH',
  /** SMS through the active `SmsSender` (`SMS_PROVIDER`). */
  SMS = 'SMS',
}

/**
 * EN_ATTENTE: to send · ENVOYEE: handed to the channel (inbox stored, push
 * accepted by Expo, SMS accepted by the provider) · DISTRIBUEE: the app
 * confirmed it received it · LUE: opened (stops the escalation) · ECHEC.
 */
export enum NotificationStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  ENVOYEE = 'ENVOYEE',
  DISTRIBUEE = 'DISTRIBUEE',
  LUE = 'LUE',
  ECHEC = 'ECHEC',
}

/**
 * Who a rule addresses. PROFILE: the institutional accounts of one access
 * profile (`NotificationRule.profileCode`) whose scope holds the farm;
 * FARM_MANAGERS: the farm's owner and its active Administrateurs;
 * FARM_TEAM: the owner and every active member.
 */
export enum NotificationAudience {
  PROFILE = 'PROFILE',
  FARM_MANAGERS = 'FARM_MANAGERS',
  FARM_TEAM = 'FARM_TEAM',
  /**
   * REPORT_READY only: the recipients the report template's audience gives
   * (`report_runs.recipients`, POUFA lot A).
   */
  REPORT_RECIPIENTS = 'REPORT_RECIPIENTS',
  /**
   * VISIT_REMINDER / VISIT_OVERDUE only: the agent who recorded the visit
   * that planned the next one.
   */
  VISIT_AGENT = 'VISIT_AGENT',
}
