/**
 * Programme steering (POUFA L6, `backend/src/modules/reporting`) and POUFA
 * band summaries (L3, `backend/src/modules/bandes`): the shapes the server
 * serves, copied from its services (never guessed).
 */
import type { ScopeKind } from './types-access';

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export interface PilotagePeriod {
  from: string;
  to: string;
}

/** `PilotageView['kind']`: PLATEFORME (platform admin), SYSTEME (report) or the scope kind. */
export type PilotageScopeKind = 'PLATEFORME' | 'SYSTEME' | ScopeKind;

/** `ScopeInfo` of the dashboard and the map. */
export interface PilotageScopeInfo {
  kind: PilotageScopeKind;
  aggregateOnly: boolean;
  /** k: minimal number of farms behind an aggregate shown to an aggregate-only view. */
  minGroupSize: number;
  note: string | null;
}

export type ColourLevel = 'VERT' | 'JAUNE' | 'ROUGE';

// ---------------------------------------------------------------------------
// GET /pilotage/dashboard
// ---------------------------------------------------------------------------

export interface PilotageMetrics {
  farms: number;
  farmsReporting: number;
  bands: number;
  activeBands: number;
  headcount: number;
  bandsOpened: number;
  placedHeads: number;
  deaths: number;
  mortalityPct: number | null;
  produced: { heads: number; kg: number; tonnes: number };
  sold: {
    liveHeads: number;
    liveKg: number;
    carcassHeads: number;
    carcassKg: number;
    revenueFcfa: number;
    avgPricePerHeadFcfa: number | null;
    avgPricePerKgFcfa: number | null;
    avgCarcassPricePerPieceFcfa: number | null;
    avgCarcassPricePerKgFcfa: number | null;
  };
  completeness: { pct: number | null; daysEntered: number; daysElapsed: number };
  alerts: {
    raised: number;
    raisedRed: number;
    activeNow: number;
    activeRedNow: number;
    published: number;
  };
}

export interface GroupFigures {
  farms: number;
  suppressed: boolean;
  metrics: PilotageMetrics | null;
}

export interface ProvinceFigures extends GroupFigures {
  provinceId: string;
  code: string;
  name: string;
}

export interface CountItem {
  code: string | null;
  label: string;
  count: number;
}

export interface WeekFigures {
  weekStart: string;
  suppressed: boolean;
  farms: number;
  deaths: number | null;
  mortalityPct: number | null;
  producedHeads: number | null;
  producedTonnes: number | null;
  completenessPct: number | null;
}

export interface InputGapFigures {
  farms: number;
  deliveries: { pending: number; confirmed: number; cancelled: number; withGap: number };
  stockLinesCounted: number;
  stockLinesOverThreshold: number;
  farmsWithStockGap: number;
}

export interface PilotageDashboard {
  generatedAt: string;
  period: PilotagePeriod;
  filters: { provinces: string[] | null; cohort: string | null; status: string | null };
  scope: PilotageScopeInfo;
  totals: GroupFigures;
  provinces: ProvinceFigures[];
  farms: { total: number; producing: number; byStatus: CountItem[]; byCohort: CountItem[] };
  series: WeekFigures[];
  publishedAlerts: { available: boolean; count: number };
  inputs: { available: boolean; thresholdPct: number; suppressed: boolean; figures: InputGapFigures | null };
  notes: string[];
}

// ---------------------------------------------------------------------------
// GET /pilotage/map
// ---------------------------------------------------------------------------

export interface MapColours {
  mortality: ColourLevel | null;
  completeness: ColourLevel | null;
  alert: ColourLevel;
}

export interface MapAlerts {
  activeNow: number;
  activeRedNow: number;
  published: number;
}

export interface MapPoint {
  farmId: string;
  code: string | null;
  name: string;
  provinceCode: string | null;
  latitude: number;
  longitude: number;
  statusCode: string | null;
  cohort: string | null;
  activeBands: number;
  headcount: number;
  mortalityPct: number | null;
  completenessPct: number | null;
  alerts: MapAlerts;
  colours: MapColours;
}

export interface MapCluster {
  provinceId: string;
  code: string;
  name: string;
  centroid: { latitude: number; longitude: number } | null;
  farms: number;
  farmsWithGps: number;
  suppressed: boolean;
  headcount: number | null;
  mortalityPct: number | null;
  completenessPct: number | null;
  alerts: MapAlerts | null;
  colours: MapColours | null;
}

export interface MapThresholds {
  jaune: number;
  rouge: number;
  unit: '%';
  description: string;
}

export interface PilotageMap {
  generatedAt: string;
  period: PilotagePeriod;
  scope: PilotageScopeInfo;
  legend: {
    mortality: MapThresholds;
    completeness: MapThresholds;
    alert: { description: string };
  };
  points: MapPoint[];
  farmsWithoutGps: number;
  clusters: MapCluster[];
}

// ---------------------------------------------------------------------------
// GET /pilotage/objective
// ---------------------------------------------------------------------------

export interface ProjectionInputView {
  key: string;
  label: string;
  value: number;
  unit: string;
  source: 'OBSERVE' | 'PARAMETRE';
  detail: string;
}

export interface ProjectedYear {
  year: number;
  annualTonnes: number;
  cumulativeTonnes: number;
  objectiveSharePct: number | null;
}

export interface PilotageObjective {
  generatedAt: string;
  scope: { kind: PilotageScopeKind; aggregateOnly: boolean; provinces: string[] | null };
  objective: { tonnes: number; unit: string; parameterKey: string };
  suppressed: boolean;
  actual: {
    since: string;
    heads: number;
    tonnes: number;
    yearToDateTonnes: number;
    last12MonthsTonnes: number;
    last12MonthsSharePct: number | null;
  } | null;
  capacity: { farms: number; farmsWithoutCapacity: number; places: number } | null;
  projection: {
    method: string[];
    inputs: ProjectionInputView[];
    annualPotentialTonnes: number;
    years: ProjectedYear[];
  } | null;
  caveat: string;
}

// ---------------------------------------------------------------------------
// /pilotage/reports
// ---------------------------------------------------------------------------

export type ReportPeriodicity = 'HEBDOMADAIRE' | 'MENSUEL' | 'FIN_DE_BANDE';
export type ReportLevel = 'NATIONAL' | 'PROVINCE' | 'BANDE';
export type ReportSection =
  | 'SYNTHESE'
  | 'PROVINCES'
  | 'PRODUCTION'
  | 'FERMES'
  | 'ALERTES'
  | 'COMPLETUDE'
  | 'OBJECTIF'
  | 'FERMES_A_SUIVRE'
  | 'BILAN'
  | 'COMPARAISON';

export interface ReportAudience {
  scopeKinds: ScopeKind[];
  profileCodes: string[];
  farmOwners: boolean;
}

/** `GET /pilotage/reports/templates` (`TemplateView`). */
export interface ReportTemplate {
  id: string;
  code: string;
  label: string;
  periodicity: ReportPeriodicity;
  level: ReportLevel;
  sections: { code: ReportSection; label: string }[];
  audience: ReportAudience;
  active: boolean;
  hasFarmRows: boolean;
  updatedAt: string;
}

/** `PATCH /pilotage/reports/templates/:code` (`UpdateReportTemplateDto`). */
export interface UpdateReportTemplateBody {
  label?: string;
  periodicity?: ReportPeriodicity;
  sections?: ReportSection[];
  audience?: Partial<ReportAudience>;
  active?: boolean;
}

/** `POST /pilotage/reports/templates/:code/runs` (`GenerateReportDto`). */
export interface GenerateReportBody {
  periodStart?: string;
  provinceCode?: string;
  batchId?: string;
}

export interface ReportRecipient {
  userId: string;
  kind: 'OWNER' | 'MEMBER';
  profileCode: string | null;
}

/** `RunView`: a run without its PDF. */
export interface ReportRun {
  id: string;
  templateId: string;
  programId: string;
  templateCode: string;
  title: string;
  level: ReportLevel;
  scopeKey: string;
  provinceId: string | null;
  farmId: string | null;
  batchId: string | null;
  periodStart: string;
  periodEnd: string;
  hasFarmRows: boolean;
  sizeBytes: number;
  /** SHA-256 of the PDF, hex: the same value as the download's `X-Report-Sha256` header. */
  sha256: string;
  recipients: ReportRecipient[];
  generatedById: string | null;
  createdAt: string;
  downloadPath: string;
}

export interface GenerateReportResult {
  created: boolean;
  run: ReportRun;
}

// ---------------------------------------------------------------------------
// POUFA bands: /farms/:farmId/bandes/:batchId…
// ---------------------------------------------------------------------------

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

/** `GET /farms/:farmId/bandes/:batchId` (`BandSheet`). */
export interface BandSheet {
  id: string;
  code: string | null;
  batchName: string | null;
  status: string;
  integrationDate: string;
  initialAgeDays: number | null;
  initialAvgWeightG: number | null;
  referenceDurationDays: number | null;
  expectedEndDate: string | null;
  ageDays: number;
  quantityAtStart: number;
  quantityAlive: number;
  closedAt: string | null;
  completenessPct: number | null;
  weighing: WeighingStatus;
  lastSnapshotVersion: number | null;
}

/** One official indicator of a band summary (no formula version ids). */
export interface BandSummaryIndicator {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  expression: string;
}

/**
 * Official headline of a band (`band-summary.ts`): BILAN = latest frozen
 * bilan of a closed band, EN_COURS = indicators in force today.
 */
export interface BandSummary {
  source: 'BILAN' | 'EN_COURS';
  asOf: string;
  ageDays: number;
  durationDays: number | null;
  snapshotVersion: number | null;
  indicators: BandSummaryIndicator[];
  revenueFcfa: number | null;
  chargesFcfa: number | null;
  marginFcfa: number | null;
  completenessPct: number | null;
}

/** `GET /farms/:farmId/bandes[?status=CLOTURE|EN_COURS]`: the farm's band history. */
export type BandHistoryRow = BandSheet & { summary: BandSummary | null };

/** One official indicator with the formula in force (`OfficialIndicator`). */
export interface OfficialIndicator {
  key: string;
  label: string;
  unit: string;
  expression: string;
  parameterKey: string;
  /** Null when no version is stored: the catalog « Proposé » default applies. */
  parameterVersionId: string | null;
  validFrom: string | null;
  value: number | null;
}

/** `GET /farms/:farmId/bandes/:batchId/indicators` (`BandeIndicators`). */
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

export type BandeSnapshotTrigger = 'CLOTURE_AUTO' | 'CLOTURE_MANUELLE' | 'CORRECTION';

/** `GET …/snapshots`: one frozen bilan version. */
export interface BandeSnapshot {
  id: string;
  batchId: string;
  farmId: string;
  version: number;
  trigger: BandeSnapshotTrigger;
  reason: string | null;
  asOf: string;
  durationDays: number;
  ageDays: number;
  variables: Record<string, number | null>;
  indicators: OfficialIndicator[];
  revenueFcfa: number | null;
  chargesFcfa: number | null;
  marginFcfa: number | null;
  completenessPct: number | null;
  createdById: string | null;
  createdAt: string;
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

/** `GET /farms/:farmId/bandes/:batchId/comparison`. */
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

/** `POST …/corrections` (`CorrectClosedBandeDto`). */
export interface CorrectClosedBandeBody {
  entryDate: string;
  deaths?: number;
  feedQuantityKg?: number;
  waterL?: number;
  avgWeightKg?: number;
  sampleSize?: number;
  reason: string;
}
