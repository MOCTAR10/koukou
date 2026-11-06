// POUFA field work (mobile M2): programme lists, sanitary declarations and
// official alerts, input deliveries, band exits, official indicators,
// notification inbox, GPS capture. Shapes mirror the backend views exactly
// (see backend/src/modules/{sanitary,surveillance,supply,bandes,reporting,
// notify,trace,programme,access}).
import { apiFetch, apiUpload } from './client';
import type { AlertLevel, DiseaseSeverity, HealthEventKind } from './types';

// ── Programme lists (REFERENCE domain) ─────────────────────────────────

export type ProgramListType =
  | 'SIGNE_CLINIQUE'
  | 'MOTIF_SORTIE'
  | 'TYPE_OPERATEUR'
  | 'STATUT_ALERTE'
  | 'INTRANT'
  | 'UNITE';

export interface RefItem {
  id: string;
  listType: ProgramListType;
  code: string;
  label: string;
  family: string | null;
  meta: Record<string, unknown> | null;
  sort: number;
  active: boolean;
}

export function fetchProgramList(listType: ProgramListType): Promise<RefItem[]> {
  return apiFetch<RefItem[]>(`/programme/lists/${listType}`);
}

// ── Institutional access (SESSION) ─────────────────────────────────────

export type AccessDomain =
  | 'REGISTRE'
  | 'TECHNIQUE'
  | 'INTRANTS'
  | 'SANITAIRE'
  | 'ECONOMIQUE'
  | 'TRACABILITE'
  | 'PILOTAGE'
  | 'PARAMETRES'
  | 'AUDIT'
  | 'ADMINISTRATION';
export type AccessAction = 'CONSULTER' | 'CREER' | 'MODIFIER' | 'VALIDER' | 'ADMINISTRER' | 'EXPORTER';
export type AccessMatrix = Partial<Record<string, string[]>>;

export interface ProgrammeAccessMe {
  profile: { id: string; code: string; label: string; scopeKind: string; matrix: AccessMatrix };
  provinceCodes: string[];
  farmIds: string[];
  validUntil: string | null;
}

/** GET /programme/access/me — institutional accounts only. */
export function fetchProgrammeAccessMe(): Promise<ProgrammeAccessMe> {
  return apiFetch<ProgrammeAccessMe>('/programme/access/me');
}

// ── Sanitary: band picker, declarations, photos, official alerts ──────

/** `GET /farms/:farmId/sanitary/lots` (SANITAIRE): no economics. */
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

export function fetchSanitaryLots(farmId: string, openOnly = true): Promise<SanitaryLotView[]> {
  return apiFetch<SanitaryLotView[]>(`/farms/${farmId}/sanitary/lots${openOnly ? '?open=true' : ''}`);
}

/** CreateHealthEventDto (backend sanitary/dto/create-health-event.dto.ts). */
export interface DeclarationPayload {
  kind: HealthEventKind;
  occurredAt: string;
  severity: AlertLevel;
  quantity?: number;
  title: string;
  description?: string;
  symptoms?: string;
  notes?: string;
  disease?: string;
  diseaseSeverity?: DiseaseSeverity;
  treatmentGiven?: string;
  vetConsulted?: boolean;
  vetName?: string;
  resolved?: boolean;
  /** Codes of the SIGNE_CLINIQUE list. */
  clinicalSigns?: string[];
  /** Opens an official sanitary alert in the same transaction. */
  suspicion?: boolean;
  idempotencyKey?: string;
}

export function createDeclaration(
  farmId: string,
  batchId: string,
  payload: DeclarationPayload,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/farms/${farmId}/batches/${batchId}/health-events`, {
    method: 'POST',
    body: payload,
  });
}

/** A photo to attach to a declaration (local file on the phone). */
export interface DeclarationPhoto {
  uri: string;
  name: string;
  mimeType: string;
}

/** POST …/health-events/:eventId/photos (multipart « file »; same bytes = same photo). */
export function uploadDeclarationPhoto(
  farmId: string,
  batchId: string,
  eventId: string,
  photo: DeclarationPhoto,
): Promise<{ id: string }> {
  const form = new FormData();
  form.append('file', { uri: photo.uri, name: photo.name, type: photo.mimeType } as unknown as Blob);
  return apiUpload<{ id: string }>(`/farms/${farmId}/batches/${batchId}/health-events/${eventId}/photos`, form);
}

export type SanitaryAlertOrigin = 'MORTALITE' | 'DECLARATION';

export interface SanitaryAlertView {
  id: string;
  code: string;
  origin: SanitaryAlertOrigin;
  farmId: string;
  batchId: string | null;
  batchCode: string | null;
  healthEventId: string | null;
  statusCode: string;
  statusFamily: string;
  outcome: string | null;
  severity: AlertLevel;
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
}

/** Official alerts of the farm (read-only for the farm). */
export function fetchFarmSanitaryAlerts(farmId: string): Promise<{ items: SanitaryAlertView[]; total: number }> {
  return apiFetch(`/farms/${farmId}/sanitary-alerts`);
}

// ── Input deliveries (INTRANTS) ────────────────────────────────────────

export type InputDeliveryStatus = 'EXPEDIEE' | 'CONFIRMEE' | 'ANNULEE';

export interface DeliveryLineView {
  id: string;
  position: number;
  intrantCode: string;
  intrantLabel: string | null;
  intrantFamily: string;
  unitCode: string;
  unitLabel: string | null;
  quantity: number;
  feedPhase: string | null;
  bagSizeKg: number | null;
  subsidized: boolean;
  subsidyRate: number | null;
  unitValueFcfa: number | null;
  supplierLotNumber: string | null;
  expirationDate: string | null;
  receivedQuantity: number | null;
  discrepancyReason: string | null;
  farmerCostFcfa: number | null;
  subsidyFcfa: number | null;
  inputLotId: string | null;
}

export interface DeliveryView {
  id: string;
  code: string;
  status: InputDeliveryStatus;
  source: 'ETAT_SMAG' | 'AUTRE';
  supplierName: string | null;
  shippedAt: string;
  receivedDate: string | null;
  confirmedAt: string | null;
  hasDiscrepancy: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  createdAt: string;
  band: { id: string; code: string | null; batchName: string | null } | null;
  lines: DeliveryLineView[];
  totals: { shippedValueFcfa: number; farmerCostFcfa: number | null; subsidyFcfa: number | null };
}

export interface OpenBandHint {
  message: string;
  deliveryId: string;
  quantityAtStart: number;
  integrationDate: string;
  couvoirSupplier: string;
  chickLotNumber: string;
  chickCostBooked: boolean;
}

export interface ConfirmResult extends DeliveryView {
  replay: boolean;
  openBandHint: OpenBandHint | null;
}

export interface ConfirmDeliveryPayload {
  receivedDate?: string;
  lines?: { lineId: string; receivedQuantity: number; discrepancyReason?: string }[];
  idempotencyKey?: string;
}

export function fetchFarmDeliveries(farmId: string, status?: InputDeliveryStatus): Promise<DeliveryView[]> {
  return apiFetch<DeliveryView[]>(`/farms/${farmId}/input-deliveries${status ? `?status=${status}` : ''}`);
}

export function fetchFarmDelivery(farmId: string, id: string): Promise<DeliveryView> {
  return apiFetch<DeliveryView>(`/farms/${farmId}/input-deliveries/${id}`);
}

export function confirmDelivery(farmId: string, id: string, payload: ConfirmDeliveryPayload): Promise<ConfirmResult> {
  return apiFetch<ConfirmResult>(`/farms/${farmId}/input-deliveries/${id}/confirm`, { method: 'POST', body: payload });
}

export function attachDeliveryBand(farmId: string, id: string, bandId: string): Promise<DeliveryView> {
  return apiFetch<DeliveryView>(`/farms/${farmId}/input-deliveries/${id}/band`, { method: 'PUT', body: { bandId } });
}

export interface DeclarativeStockRow {
  key: string;
  intrantCode: string;
  intrantFamily: string;
  intrantLabel: string | null;
  unitCode: string;
  unitLabel: string | null;
  trackedSince: string;
  shipped: number;
  received: number;
  consumed: number;
  lost: number;
  sold: number;
  used: number;
  stock: number;
  physicalStock: number | null;
  negative: boolean;
}

export interface DeclarativeStock {
  farmId: string;
  rows: DeclarativeStockRow[];
  negative: boolean;
}

export function fetchDeclarativeStock(farmId: string): Promise<DeclarativeStock> {
  return apiFetch<DeclarativeStock>(`/farms/${farmId}/declarative-stock`);
}

// ── Band exits (sorties), indicators, snapshots, comparison ───────────

export interface SortieView {
  id: string;
  batchId: string;
  sortieDate: string;
  count: number;
  weightKg: number | null;
  reasonCode: string;
  reasonFamily: string;
  reasonLabel: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  operatorId: string | null;
  unitPriceFcfa: number | null;
  priceUnit: 'TETE' | 'KG' | null;
  notes: string | null;
  saleStatus: string | null;
  slaughterStatus: string | null;
  createdAt: string;
}

/** CreateSortieDto (backend bandes/dto/sortie.dto.ts). */
export interface SortiePayload {
  sortieDate: string;
  count: number;
  weightKg?: number;
  reasonCode: string;
  recipientName?: string;
  recipientPhone?: string;
  operatorId?: string;
  unitPriceFcfa?: number;
  priceUnit?: 'TETE' | 'KG';
  notes?: string;
  idempotencyKey?: string;
  capturedAt?: string;
  deviceSentAt?: string;
}

export function fetchSorties(farmId: string, batchId: string): Promise<SortieView[]> {
  return apiFetch<SortieView[]>(`/farms/${farmId}/bandes/${batchId}/sorties`);
}

export function createSortie(farmId: string, batchId: string, payload: SortiePayload): Promise<SortieView> {
  return apiFetch<SortieView>(`/farms/${farmId}/bandes/${batchId}/sorties`, { method: 'POST', body: payload });
}

// POUFA lot A bande: band sheet (weighing schedule) and offline conflicts.

/** `weighing` of the band sheet (backend batches/poufa/bande-rules.ts `WeighingStatus`). */
export interface WeighingStatus {
  frequencyDays: number;
  expectedSampleSize: number;
  lastWeighingDate: string | null;
  lastSampleSize: number | null;
  lastSampleBelowExpected: boolean;
  nextDueDate: string;
  daysLate: number;
  late: boolean;
}

/** `GET /farms/:farmId/bandes/:batchId` (backend bandes.service.ts `BandSheet`). */
export interface BandSheet {
  id: string;
  code: string | null;
  status: string;
  integrationDate: string;
  quantityAlive: number;
  completenessPct: number | null;
  weighing: WeighingStatus;
}

export function fetchBandSheet(farmId: string, batchId: string): Promise<BandSheet> {
  return apiFetch<BandSheet>(`/farms/${farmId}/bandes/${batchId}`);
}

/** One recorded offline conflict (backend sync/entities/sync-conflict.entity.ts). */
export interface SyncConflictView {
  id: string;
  batchId: string | null;
  entityType: string;
  entityLabel: string | null;
  field: string;
  /** SERVEUR: the value already recorded was kept; APPAREIL: the value sent won. */
  winner: 'SERVEUR' | 'APPAREIL';
  serverValue: unknown;
  incomingValue: unknown;
  serverCapturedAt: string | null;
  serverDeviceId: string | null;
  incomingCapturedAt: string;
  incomingCapturedAtRaw: string | null;
  incomingDeviceId: string | null;
  clockCorrected: boolean;
  createdAt: string;
}

export function fetchSyncConflicts(farmId: string, batchId: string): Promise<SyncConflictView[]> {
  return apiFetch<SyncConflictView[]>(`/farms/${farmId}/sync-conflicts?batchId=${encodeURIComponent(batchId)}`);
}

export interface OfficialIndicator {
  key: string;
  label: string;
  unit: string;
  expression: string;
  value: number | null;
  parameterKey: string;
  parameterVersionId: string | null;
  validFrom: string | null;
}

export interface BandeIndicators {
  batchId: string;
  code: string | null;
  asOf: string;
  ageDays: number;
  parametersAt: string;
  variables: Record<string, number | null>;
  indicators: OfficialIndicator[];
  completenessPct: number | null;
}

export function fetchBandIndicators(farmId: string, batchId: string): Promise<BandeIndicators> {
  return apiFetch<BandeIndicators>(`/farms/${farmId}/bandes/${batchId}/indicators`);
}

export interface BandeSnapshot {
  id: string;
  batchId: string;
  version: number;
  trigger: string;
  reason: string | null;
  asOf: string;
  durationDays: number;
  ageDays: number;
  indicators: Omit<OfficialIndicator, 'parameterVersionId'>[];
  revenueFcfa: number | null;
  chargesFcfa: number | null;
  marginFcfa: number | null;
  completenessPct: number | null;
  createdAt: string;
}

export function fetchBandSnapshots(farmId: string, batchId: string): Promise<BandeSnapshot[]> {
  return apiFetch<BandeSnapshot[]>(`/farms/${farmId}/bandes/${batchId}/snapshots`);
}

export interface ComparisonValues {
  mortalityPct: number | null;
  fcr: number | null;
  gmqG: number | null;
}

export interface ComparisonWeek {
  week: number;
  ageFrom: number;
  ageTo: number;
  band: ComparisonValues | null;
  programme: (ComparisonValues & { bands: number; farms: number }) | null;
  suppressed: boolean;
}

export interface BandComparison {
  batchId: string;
  code: string | null;
  species: string;
  type: string;
  ageDays: number | null;
  currentWeek: number | null;
  minGroupSize: number;
  weeks: ComparisonWeek[];
  method: string[];
}

export function fetchBandComparison(farmId: string, batchId: string): Promise<BandComparison> {
  return apiFetch<BandComparison>(`/farms/${farmId}/bandes/${batchId}/comparison`);
}

export interface TraceOperator {
  id: string;
  code: string;
  name: string;
  typeCode: string;
  active: boolean;
}

/** Active operators of the programme (REFERENCE). */
export function fetchOperators(): Promise<TraceOperator[]> {
  return apiFetch<TraceOperator[]>('/trace/operators');
}

// ── Notification inbox (SESSION) ───────────────────────────────────────

export interface InboxItem {
  id: string;
  event: string;
  severity: AlertLevel;
  title: string;
  body: string;
  farmId: string | null;
  subjectId: string | null;
  route: string;
  status: string;
  createdAt: string;
  readAt: string | null;
}

export function fetchInbox(options: { unread?: boolean; before?: string; limit?: number } = {}): Promise<{ items: InboxItem[]; unread: number }> {
  const q = new URLSearchParams();
  if (options.unread) q.set('unread', 'true');
  if (options.before) q.set('before', options.before);
  if (options.limit) q.set('limit', String(options.limit));
  const qs = q.toString();
  return apiFetch(`/notifications${qs ? `?${qs}` : ''}`);
}

export function fetchUnreadCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>('/notifications/unread-count');
}

export function markNotificationRead(id: string): Promise<InboxItem> {
  return apiFetch<InboxItem>(`/notifications/${id}/read`, { method: 'POST' });
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>('/notifications/read-all', { method: 'POST' });
}

// ── Registry GPS (REGISTRE) ────────────────────────────────────────────

/** SetFarmGpsDto (backend programme/dto/programme-farm.dto.ts). */
export interface FarmGpsPayload {
  latitude: number;
  longitude: number;
  capturedAt?: string;
  source?: 'APPAREIL' | 'MANUEL';
  accuracyM?: number;
  reason?: string;
}

export interface FarmGpsResult {
  gps: { latitude: number; longitude: number; capturedAt: string; source: string; accuracyM: number | null } | null;
  previous: { latitude: number; longitude: number } | null;
  provinceWarning: string | null;
}

export function setFarmGps(farmId: string, payload: FarmGpsPayload): Promise<FarmGpsResult> {
  return apiFetch<FarmGpsResult>(`/programme/farms/${farmId}/gps`, { method: 'PUT', body: payload });
}
