/**
 * Official sanitary surveillance and notifications (POUFA L5). Shapes of
 * `backend/src/modules/surveillance` (`sanitary-alerts.service.ts`),
 * `modules/notify` (`notify.service.ts`, `notification-rule.entity.ts`) and
 * `modules/sanitary` (declaration photos, sanitary lots, calendars).
 */

export type AlertLevel = 'VERT' | 'JAUNE' | 'ROUGE';

/** STATUT_ALERTE families (`sanitary-alert-rules.ts` `ALERT_FAMILY`). */
export const ALERT_FAMILIES = ['NOUVELLE', 'EN_ANALYSE', 'CONFIRMEE', 'INFIRMEE', 'CLOSE'] as const;
export type AlertFamily = (typeof ALERT_FAMILIES)[number];

export type SanitaryAlertOrigin = 'MORTALITE' | 'DECLARATION';

/** `SanitaryAlertView`: an official alert `AS-AAAA-NNNN` (never an advisory `Alert`). */
export interface SanitaryAlert {
  id: string;
  code: string;
  origin: SanitaryAlertOrigin;
  farmId: string;
  farmCode: string | null;
  farmName: string | null;
  batchId: string | null;
  batchCode: string | null;
  provinceId: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  healthEventId: string | null;
  statusCode: string;
  statusFamily: string;
  /** CONFIRMEE or INFIRMEE once decided, kept afterwards. */
  outcome: string | null;
  severity: AlertLevel;
  /** First fact day (`YYYY-MM-DD`). */
  factDay: string;
  lastFactDay: string;
  mortalityPct: number | null;
  thresholdPct: number | null;
  deaths: number | null;
  presentStart: number | null;
  clinicalSigns: string[];
  summary: string;
  published: boolean;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SanitaryAlertTransitionKind = 'CREATION' | 'STATUT' | 'PUBLICATION';

export interface SanitaryAlertTransition {
  id: string;
  kind: SanitaryAlertTransitionKind;
  fromStatusCode: string | null;
  toStatusCode: string;
  toFamily: string;
  comment: string | null;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
}

export interface SanitaryAlertDetail extends SanitaryAlert {
  transitions: SanitaryAlertTransition[];
}

export interface SanitaryAlertPage {
  items: SanitaryAlert[];
  total: number;
}

/** `POST /surveillance/alerts/:id/transitions`. */
export interface TransitionBody {
  statusCode: string;
  comment?: string;
}

// ---------------------------------------------------------------------------
// Declarations (health events): photos, bands for the vets
// ---------------------------------------------------------------------------

/** `HealthEventPhotoView` (no path: read the bytes through the photo route). */
export interface HealthEventPhoto {
  id: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** `GET /farms/:farmId/sanitary/lots` row (SANITAIRE: what a vet can read). */
export interface SanitaryLotView {
  id: string;
  code: string | null;
  name: string | null;
  species: string;
  type: string;
  status: string;
  integrationDate: string;
  ageDays: number;
  quantityAtStart: number;
  quantityAlive: number;
  closedAt: string | null;
  building: { id: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Reference vaccination calendars (`/surveillance/vaccination-calendars`)
// ---------------------------------------------------------------------------

export type CareTypeCode = 'VACCIN' | 'MEDICAMENT' | 'VITAMINE' | 'ANTIBIOTIQUE' | 'AUTRE';

export interface CalendarStep {
  id: string;
  protocolId?: string;
  stepOrder: number;
  dayFrom: number;
  dayTo: number;
  careType: CareTypeCode;
  name: string;
  dosage: string | null;
  route: string | null;
  withdrawalDays: number;
  active: boolean;
}

/** A sanitary protocol as `GET /sanitary/protocols[/:id]` serves it. */
export interface CalendarProtocol {
  id: string;
  code: string;
  farmId: string | null;
  species: string;
  type: string;
  name: string;
  /** The reference calendar of its species and type. */
  isDefault: boolean;
  steps?: CalendarStep[];
}

export interface CalendarStepBody {
  stepOrder: number;
  dayFrom: number;
  dayTo: number;
  careType: CareTypeCode;
  name: string;
  dosage?: string;
  route?: string;
  withdrawalDays?: number;
}

export interface CreateCalendarBody {
  name: string;
  species: string;
  type: string;
  steps: CalendarStepBody[];
  reference?: boolean;
}

// ---------------------------------------------------------------------------
// Notifications (`/notifications`, `/programme/notification-rules`)
// ---------------------------------------------------------------------------

export const NOTIFICATION_EVENTS = [
  'ALERT_RAISED',
  'SANITARY_ALERT_CREATED',
  'SANITARY_ALERT_STATUS_CHANGED',
  'SANITARY_ALERT_PUBLISHED',
  'DECLARATION_RECEIVED',
  'WEIGHING_LATE',
  'SYNC_CONFLICT',
  // POUFA lot A pilot: a programme report was produced.
  'REPORT_READY',
  // POUFA lot A2 vet: the vets examined a declaration.
  'DECLARATION_REVIEWED',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export type NotificationChannel = 'IN_APP' | 'PUSH' | 'SMS';
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ['IN_APP', 'PUSH', 'SMS'];

/** REPORT_RECIPIENTS (POUFA lot A): the report's recipients, for REPORT_READY only. */
export type NotificationAudience = 'PROFILE' | 'FARM_MANAGERS' | 'FARM_TEAM' | 'REPORT_RECIPIENTS';
export const NOTIFICATION_AUDIENCES: readonly NotificationAudience[] = ['PROFILE', 'FARM_MANAGERS', 'FARM_TEAM', 'REPORT_RECIPIENTS'];

export type NotificationStatus = 'EN_ATTENTE' | 'ENVOYEE' | 'DISTRIBUEE' | 'LUE' | 'ECHEC';

/** `InboxItem`. */
export interface InboxItem {
  id: string;
  event: NotificationEvent;
  severity: AlertLevel;
  title: string;
  body: string;
  farmId: string | null;
  subjectId: string | null;
  /** The server's app route (`/sanitary-alerts/:id`…), mapped by `notificationRoutes.ts`. */
  route: string;
  status: NotificationStatus;
  createdAt: string;
  readAt: string | null;
}

export interface InboxPage {
  items: InboxItem[];
  unread: number;
}

/** `GET /programme/notification-rules/events`. */
export interface NotificationEventInfo {
  event: NotificationEvent;
  label: string;
  /** Unpublished sanitary data: only the farm and the veterinary services. */
  confidential: boolean;
}

export interface NotificationRule {
  id: string;
  programId: string;
  code: string;
  label: string;
  event: NotificationEvent;
  audience: NotificationAudience;
  profileCode: string | null;
  channels: NotificationChannel[];
  escalateAfterMin: number | null;
  severityMin: AlertLevel;
  active: boolean;
  /** Seeded default (still editable). */
  system: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuleBody {
  label: string;
  audience: NotificationAudience;
  profileCode: string | null;
  channels: NotificationChannel[];
  escalateAfterMin: number | null;
  severityMin: AlertLevel;
  active: boolean;
}

export interface CreateRuleBody extends RuleBody {
  code: string;
  event: NotificationEvent;
}

// POUFA lot A2 vet: register and review of the declarations (`/surveillance/declarations`, CDC n° 26).
export type DeclarationReviewDecision = 'VALIDEE' | 'INFIRMEE' | 'ALERTE';
export type DeclarationReviewState = 'A_EXAMINER' | DeclarationReviewDecision;

export interface SanitaryDeclaration {
  id: string;
  farmId: string;
  farmCode: string | null;
  farmName: string | null;
  batchId: string;
  batchCode: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  kind: string;
  occurredAt: string;
  severity: AlertLevel;
  quantity: number;
  title: string;
  description: string | null;
  symptoms: string | null;
  disease: string | null;
  clinicalSigns: string[];
  suspicion: boolean;
  createdByName: string | null;
  photos: HealthEventPhoto[];
  alertId: string | null;
  alertCode: string | null;
  alertStatusCode: string | null;
  reviewStatus: DeclarationReviewDecision | null;
  reviewComment: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewState: DeclarationReviewState;
}

export interface SanitaryDeclarationPage {
  items: SanitaryDeclaration[];
  total: number;
}
