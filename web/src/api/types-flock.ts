// Types of the flock area (lots, sanitary, feed stock, slaughter, activities).
// `api/types.ts` stays the shared source for what it already defines.
import type { AlertStatus, BatchMetrics, BatchType, DashboardData, ProductionBatch } from './types';

export type AlertLevel = 'ROUGE' | 'JAUNE' | 'VERT';
export type ReadyReason = 'READY' | 'TOO_YOUNG' | 'FCR' | 'SANITARY' | 'N_A';

export interface EggBreakdown {
  collected: number;
  sellable: number;
  cracked: number;
  small: number;
  doubleYolk: number;
  dirty: number;
}

export interface LotMetrics extends BatchMetrics {
  status: AlertLevel;
  totalDeaths: number;
  totalFeedKg: number;
  ipeTarget: number | null;
  lastWeighingDate: string | null;
  lastWeighingAgeDays: number | null;
  eggsCollectedTotal: number;
  eggBreakdown?: EggBreakdown;
  densityPerM2: number | null;
  readyForSale: boolean;
  readyReason: ReadyReason;
}

export interface Lot extends Omit<ProductionBatch, 'species'> {
  species: string;
  customSpecies?: string | null;
  customBreed?: string | null;
  breedName: string | null;
  breedCode: string | null;
  readyForSaleAt?: string | null;
  metrics: LotMetrics;
}

export interface Breed {
  id: string;
  name: string;
  refCode: string | null;
  type: BatchType;
  species: string;
  isCustom: boolean;
  active: boolean;
}

export interface BreedStandard {
  week: number;
  targetAvgWeightKg: number | null;
  targetFcr: number | null;
  targetLayRatePercent: number | null;
}

export interface Building {
  id: string;
  farmId: string;
  name: string;
  buildingAreaM2: number | null;
  capacity: number | null;
  lastVideSanitaireAt: string | null;
  stats?: {
    activeBirds: number;
    activeLots: number;
    densityPerM2: number | null;
    lastLotEndedAt?: string | null;
  };
}

export interface LotCurveWeek {
  weekStart: string;
  avgWeightKg: number | null;
  feedKg: number;
  waterL: number;
  waterLPerBird: number | null;
  deaths: number;
  cumFeedKg: number;
  fcrCumulative: number | null;
}

export interface LotCurve {
  batchId: string;
  liveCount: number;
  startWeightKg: number;
  weekly: LotCurveWeek[];
}

export interface DailyEntryRecord {
  id: string;
  batchId: string;
  entryDate: string;
  deaths: number;
  feedQuantity: number;
  feedUnit: 'SAC' | 'KG' | null;
  bagSizeKg: number | null;
  feedPhase: string | null;
  customFeedPhaseName: string | null;
  inputLotId: string | null;
  skipStockDeduction: boolean;
  waterL: number;
  avgWeightKg: number | null;
  eggsCollected: number;
  eggsSellable: number;
  eggsCracked: number;
  eggsSmall: number;
  eggsDoubleYolk: number;
  eggsDirty: number;
  /** Birds weighed with `avgWeightKg` (CDC « nombre pesé »). */
  sampleSize?: number | null;
  /** Last write: sent back as `baseUpdatedAt` by an edit (offline conflict rule). */
  updatedAt?: string;
}

export interface PondageWeek {
  weekStart: string;
  collected: number;
  sellable: number;
  cracked: number;
  small: number;
  daysRecorded: number;
  layRatePercent: number | null;
}

export interface PondageSummary {
  batchId: string;
  daysRecorded: number;
  sellableRatioPercent: number | null;
  eggsPerHen: number | null;
  layRatePercent: number | null;
  weekly: PondageWeek[];
}

export interface BatchPnl {
  batchId: string;
  revenueFcfa: number;
  expensesFcfa: number;
  netFcfa: number;
  marginPct: number | null;
  costPerKgFcfa: number | null;
  kgSold: number;
  birdsSold: number;
  eggsSold: number;
  breakdown: {
    byProduct: Array<{ label: string; quantity: number; amountFcfa: number }>;
    byExpenseCategory: Array<{ label: string; amountFcfa: number }>;
  };
  enrichment: { chickCostFcfa: number | null; feedLotsCostFcfa: number | null };
}

export interface OverviewPnl {
  period: { from: string; to: string };
  sales: { count: number; totalFcfa: number };
  collectedFcfa: number;
  outstandingFcfa: number;
  expenses: { count: number; totalFcfa: number };
  netFcfa: number;
}

export type CareType = 'VACCIN' | 'MEDICAMENT' | 'VITAMINE' | 'ANTIBIOTIQUE' | 'AUTRE';
export type ProphylaxisStatus = 'PLANIFIE' | 'FAIT' | 'EN_RETARD' | 'ANNULE';

export interface SanitaryProtocol {
  id: string;
  code: string;
  species: string;
  type: BatchType;
  name: string;
  isDefault: boolean;
}

export interface ProtocolStep {
  id: string;
  dayFrom: number;
  dayTo: number;
  careType: CareType;
  name: string;
  dosage: string | null;
  route: string | null;
  withdrawalDays: number;
  active: boolean;
}

export interface SanitaryProtocolWithSteps extends SanitaryProtocol {
  steps: ProtocolStep[];
}

export interface ProphylaxisEvent {
  id: string;
  batchId: string;
  protocolStepId: string | null;
  protocolId: string | null;
  source: string;
  careType: CareType;
  name: string;
  dosage: string | null;
  route: string | null;
  withdrawalDays: number;
  scheduledDate: string;
  status: ProphylaxisStatus;
  completedAt: string | null;
  /** Birds vaccinated or treated, given at completion (CDC n° 22). */
  animalCount?: number | null;
  notes: string | null;
  medicationLotId: string | null;
  medicationQty: number | null;
  medicationUnit: string | null;
  decrementStock: boolean;
}

export interface TreatmentRecord {
  id: string;
  careType: CareType;
  productName: string;
  /** PRODUIT_TRAITEMENT code; null for free text (list empty). */
  productCode?: string | null;
  dosage: string | null;
  route: string | null;
  administeredAt: string;
  /** Last day of the treatment (CDC n° 23); null = one day. */
  endDate?: string | null;
  reason?: string | null;
  animalCount?: number | null;
  withdrawalDays: number;
  withdrawalEndDate: string | null;
  notes: string | null;
}

export type HealthEventKind = 'MALADIE' | 'MORTALITE' | 'REFORME' | 'SYMPTOME' | 'VISITE_VETO' | 'AUTRE';
export type DiseaseSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface HealthEvent {
  id: string;
  batchId: string;
  kind: HealthEventKind;
  occurredAt: string;
  severity: AlertLevel;
  status: 'OUVERT' | 'RESOLU';
  quantity: number;
  title: string;
  description: string | null;
  symptoms: string | null;
  notes: string | null;
  disease?: string | null;
  diseaseSeverity?: DiseaseSeverity | null;
  treatmentGiven?: string | null;
  vetConsulted?: boolean;
  vetName?: string | null;
  /** POUFA L5 declaration: SIGNE_CLINIQUE codes, suspicion (opens an official alert), photos. */
  clinicalSigns?: string[];
  suspicion?: boolean;
  photos?: import('./types-surveillance').HealthEventPhoto[];
}

export interface BatchHealth {
  batchId: string;
  ageDays: number;
  liveCount: number;
  mortalityPercent: number;
  viabilityPercent: number;
  fcr: number | null;
  trays: number;
  eggsCollectedTotal: number;
  layRatePercent: number | null;
  feedPerBirdGrams: number;
  waterLPerBird: number | null;
  healthScore: number;
  tips: Array<{ level: AlertLevel; text: string }>;
  trends: { dates: string[]; mortality: number[]; eggs: number[] };
  check: { insights: string[]; advice: string[] };
}

export interface GenerateProgramResult {
  planned: number;
  skipped: number;
}

export interface InputLot {
  id: string;
  entryType: string;
  productName: string;
  quantity: number;
  doseUnit: string | null;
}

export type FeedEntryType = 'BULKER' | 'BAG' | 'MEDICAMENT' | 'MATIERE_PREMIERE';
export type FeedLossReason = 'HUMIDITE' | 'RONGEURS' | 'AUTRE';
export type FeedMovementType = 'CONSOMMATION' | 'PERTE' | 'VENTE';

export interface FeedMovement {
  id: string;
  type: FeedMovementType;
  date: string;
  quantityKg: number;
  valueFcfa: number | null;
  feedPhase: string | null;
  productName: string | null;
  reason?: string | null;
}

export type SlaughterStatus = 'DRAFT' | 'SENT' | 'PROCESSED' | 'CANCELLED';

export interface SlaughterOrderFull {
  id: string;
  batchId: string;
  referenceNumber: string;
  slaughterType: 'VIVANT' | 'ABATTU';
  destination: 'INTERNE' | 'EXTERNE';
  plannedDate: string;
  birdCount: number;
  totalWeightKg: number | null;
  carcassWeightKg: number | null;
  rendementPercent: number | null;
  internalBatchCode: string | null;
  abattoirLotCode: string | null;
  status: SlaughterStatus;
  processedAt: string | null;
  abattoirNotes: string | null;
  createdAt: string;
  batch?: { batchName: string | null; species?: string } | null;
}

export type TaskStatus = 'A_FAIRE' | 'EN_COURS' | 'FAIT' | 'ANNULE';

export interface FarmTask {
  id: string;
  batchId: string | null;
  title: string;
  dueDate: string;
  status: TaskStatus;
  completedAt: string | null;
}

export interface AdvisoryAction {
  id: string;
  category: string;
  level: AlertLevel;
  title: string;
  description: string;
  dueDate: string | null;
  batchId: string | null;
  batchName: string | null;
  acknowledged: boolean;
  alertId: string | null;
  kind?: string | null;
  status?: AlertStatus;
}

export interface AdvisoryResponse {
  generatedAt: string;
  actions: AdvisoryAction[];
}

export interface BreedStatus {
  breedId: string;
  week: number;
  targetAvgWeightKg: number | null;
  actualAvgWeightKg: number | null;
  avgWeightDeviationPct: number | null;
  targetFcr: number | null;
  actualFcr: number | null;
  fcrDeviationPct: number | null;
  targetLayRatePercent: number | null;
  actualLayRatePercent: number | null;
  layRateDeviationPct: number | null;
}

export interface FlockHealthRow {
  batchId: string;
  batchName: string | null;
  ageDays: number;
  liveCount: number;
  weekDeaths: number;
  mortalityPercent: number;
  alertesRouges: number;
  alertesJaunes: number;
  lastEntryDate: string | null;
  lastEntryLagDays: number | null;
  breedStatus: BreedStatus | null;
}

/** Payload actually returned by the dashboard (thermal comfort, not a weather report). */
export interface FarmWeather {
  available: boolean;
  today: { date: string; tempC: number; humidityPct: number; thi: number; zone: string; level: AlertLevel } | null;
  forecast: Array<{ date: string; tempC: number; humidityPct: number; thi: number; zone: string; level: AlertLevel }>;
}

export interface FlockDashboard extends Omit<DashboardData, 'healthOverview' | 'weather'> {
  healthOverview: FlockHealthRow[];
  buildingsCount: number;
  weather: FarmWeather | null;
}

export interface CaisseSummary {
  session: { status: string };
  movements: Array<{
    id: string;
    type: 'IN' | 'OUT';
    source: string;
    reason: string | null;
    amountFcfa: number;
    createdAt: string;
  }>;
  inFcfa: number;
  outFcfa: number;
  expectedBalanceFcfa: number;
}
