import type { Role } from './client';

export interface PublicUser {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  role: Role;
  active: boolean;
}

/** How a programme farm's GPS point was obtained. */
export type GpsSource = 'APPAREIL' | 'MANUEL' | 'IMPORT';

/**
 * A farm as `GET /farms` returns it: always a programme farm (POUFA-only
 * instance), created by the registry with its sheet.
 */
export interface Farm {
  id: string;
  name: string;
  administrativeCity: string;
  buildingCount: number | null;
  capacityPerBuilding: number | null;
  buildingAreaM2: number | null;
  defaultSacKg: number;
  /** Farm-wide credit defaults for customers without their own (null = none). */
  defaultCreditLimitFcfa?: number | null;
  defaultPaymentTermDays?: number | null;
  longitude: number | null;
  latitude: number | null;
  isVerified: boolean;
  /** Follows the programme status: false while SUSPENDUE. */
  active: boolean;
  /** Null until the exploitant's account is activated: fall back to `exploitantName`/`exploitantPhone`. */
  ownerId: string | null;
  /** Not loaded by `GET /farms`; some admin lists join it. */
  owner?: PublicUser | null;
  // ----- Registry sheet -----
  programId?: string;
  /** `G1-0012`: never changes once set. */
  code?: string | null;
  provinceId?: string | null;
  /** Added by `GET /farms` (null without a province); absent from other farm answers. */
  provinceCode?: string | null;
  provinceName?: string | null;
  localiteId?: string | null;
  amiRef?: string | null;
  /** Code of a COHORTE list item. */
  cohort?: string | null;
  /** Bird places: base of the occupation rate. */
  capacityPlaces?: number | null;
  exploitantName?: string | null;
  exploitantPhone?: string | null;
  /** Current STATUT_FERME code (EN_PREPARATION, OPERATIONNELLE, SUSPENDUE…). */
  statusCode?: string | null;
  statusSince?: string | null;
  gpsCapturedAt?: string | null;
  gpsSource?: GpsSource | null;
  gpsAccuracyM?: number | null;
  /** GPS outside the farm's province: a warning, never a block. */
  gpsProvinceWarning?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Name to show for the farm's exploitant: his account, else the registry sheet. */
export function exploitantNameOf(farm: Pick<Farm, 'owner' | 'exploitantName'> | null | undefined): string | null {
  return farm?.owner?.fullName ?? farm?.exploitantName ?? null;
}

export function exploitantPhoneOf(farm: Pick<Farm, 'owner' | 'exploitantPhone'> | null | undefined): string | null {
  return farm?.owner?.phone ?? farm?.exploitantPhone ?? null;
}

export type BatchType = 'CHAIR' | 'PONDEUSE';
export type BatchStatus = 'ACTIF' | 'EN_VENTE' | 'CLOTURE';
export type Species = 'POULET' | 'PINTADE' | 'DINDE' | 'CAILLE' | 'CANARD' | 'OIE' | 'FAISAN' | 'AUTRE';

export interface ProductionBatch {
  id: string;
  farmId: string;
  buildingId: string | null;
  breedId: string | null;
  batchName: string | null;
  /** Opening (arrival) day of the band; age = `initialAgeDays` + days since it. */
  integrationDate: string;
  /** Age of the birds at opening (J+x, POUFA); null / 0 = day-old chicks. */
  initialAgeDays?: number | null;
  quantityAtStart: number;
  quantityAlive: number;
  chickUnitPriceFcfa: number | null;
  type: BatchType;
  species: Species;
  status: BatchStatus;
  buildingAreaM2: number | null;
  feedUnitSacKg: number | null;
  lastComputedFcr: number;
  couvoirSupplier: string | null;
  chickLotNumber: string | null;
  hatchDate: string | null;
  createdAt: string;
}

export interface BatchWithMetrics extends ProductionBatch {
  metrics: BatchMetrics;
}

export interface BatchMetrics {
  ageDays: number;
  liveCount: number;
  mortalityPercent: number;
  viabilityPercent: number;
  fcr: number | null;
  gmqGramsPerDay: number | null;
  ipe: number | null;
  layRatePercent: number | null;
  feedConsumedKg: number;
  stockKg: number | null;
  eggsCollected: number;
  alerts: number;
}

export interface DashboardHealth {
  score: number;
  grade: 'EXCELLENT' | 'BON' | 'MOYEN' | 'CRITIQUE';
  breakdown: { rouge: number; jaune: number; saisiesManquantes: number };
}

export interface DashboardData {
  farmId: string;
  generatedAt: string;
  liveStock: number;
  batches: { total: number; actif: number; enVente: number; cloture: number };
  mortalityPercent: number | null;
  viabilityPercent: number | null;
  feedAutonomyDays: number | null;
  /** POUFA lot A droits (F6): null for an institution reading neither ECONOMIQUE nor VENTES. */
  collectedTodayFcfa: number | null;
  teamCount: number;
  alerts: { total: number; rouge: number; jaune: number; vert: number };
  health: DashboardHealth;
  healthOverview: Array<{
    batchId: string;
    batchName: string | null;
    status: BatchStatus;
    type: BatchType;
    ageDays: number;
    liveCount: number;
    weekDeaths: number;
    mortalityPercent: number;
    alertesRouges: number;
    alertesJaunes: number;
    lastEntryDate: string | null;
    lastEntryLagDays: number | null;
    breedStatus: string | null;
  }>;
  leaderboard: Array<{
    batchId: string;
    batchName: string | null;
    status: BatchStatus;
    type: BatchType;
    ageDays: number;
    perfIndex: number | null;
    fcr: number | null;
    gmqGramsPerDay: number | null;
    ipe: number | null;
    layRatePercent: number | null;
    mortalityPercent: number;
    liveCount: number;
  }>;
  deltas: {
    mortalityThisWeek: number;
    mortalityPrevWeek: number;
    mortalityDelta: number;
    feedThisWeekKg: number;
    feedPrevWeekKg: number;
    feedDeltaKg: number;
    layRateThisWeekPct: number | null;
    layRatePrevWeekPct: number | null;
    layRateDeltaPct: number | null;
  };
  eggStock: { availableAlveoles: number; availableEggs: number; warnAlveoles: number };
  weather: {
    provider: string;
    location: string;
    temperatureC: number;
    humidityPct: number;
    rainfallMm: number;
    windKmh: number;
    condition: string;
    forecast: Array<{ date: string; temperatureC: number; humidityPct: number }>;
  } | null;
}

export interface BatchCurve {
  batchId: string;
  liveCount: number;
  startWeightKg: number;
  weekly: Array<{
    weekStart: string;
    avgWeightKg: number | null;
    feedKg: number;
    deaths: number;
    cumFeedKg: number;
    fcrCumulative: number | null;
  }>;
}

export type AlertLevel = 'ROUGE' | 'JAUNE' | 'VERT';
export type AlertStatus = 'ACTIVE' | 'RESOLUE' | 'ACQUITTEE';

export interface Alert {
  id: string;
  farmId: string;
  batchId: string | null;
  buildingId: string | null;
  ruleId: string | null;
  kind: string;
  level: AlertLevel;
  status: AlertStatus;
  message: string;
  recommendation: string | null;
  context: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Customer {
  id: string;
  farmId: string;
  fullName: string;
  phone: string | null;
  /** Code client généré côté serveur (CL-####, séquentiel par ferme). */
  code: string | null;
  /** Type commercial (défaut PARTICULIER) — purement indicatif. */
  type: string;
  segment: string;
  /** Programme operator this customer is (POUFA traceability), when linked. */
  operatorId?: string | null;
  createdAt: string;
  balance?: CustomerBalance;
  /** Credit ceiling of this customer (FCFA); null = the farm default applies. */
  creditLimitFcfa?: number | null;
  /** Payment term in days; null = the farm default applies. */
  paymentTermDays?: number | null;
  /** Ceiling and term in force (own, else farm default) and the lateness, computed by the server. */
  effectiveCreditLimitFcfa?: number | null;
  effectivePaymentTermDays?: number | null;
  overdueAmount?: number;
  oldestOverdueDays?: number;
  /** « Plafond atteint ». */
  limitReached?: boolean;
  /** « En retard ». */
  overdue?: boolean;
}

export interface CustomerBalance {
  totalInvoicedFcfa: number;
  paidFcfa: number;
  outstandingFcfa: number;
}

export interface Promotion {
  id: string;
  farmId: string;
  code: string;
  type: 'PCT' | 'FCFA';
  value: number;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  minSubtotalFcfa: number | null;
  customerId: string | null;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  productType: string;
  quantity: number;
  unit: string;
  unitPriceFcfa: number;
  batchId: string | null;
  inputLotId: string | null;
}

export interface Payment {
  id: string;
  saleId: string;
  method: string;
  amountFcfa: number;
  status: string;
  paymentDate: string;
}

export interface Sale {
  id: string;
  farmId: string;
  referenceNumber: string;
  saleDate: string;
  totalAmountFcfa: number;
  discountAmountFcfa: number;
  status: string;
  items: SaleItem[];
  payments: Payment[];
}

export interface CashSession {
  id: string;
  farmId: string;
  openingBalanceFcfa: number;
  closingBalanceFcfa: number | null;
  closingExpectedFcfa: number | null;
  closingDifferenceFcfa: number | null;
  status: string;
  openedAt: string;
  closedAt: string | null;
}

export interface FeedStockSummary {
  /** Découvert (kg consommés « depuis le stock » sans lot disponible) ; absent des anciens serveurs. */
  deficitKg?: number;
  byType: Array<{
    feedPhase: string | null;
    foodType: string | null;
    receivedKg: number;
    usedKg: number;
    lostKg: number;
    soldKg: number;
    availableKg: number;
    autonomyDays: number | null;
    status: string;
    suggestedLotId: string | null;
    suggestedLotName: string | null;
  }>;
  lots: Array<{
    id: string;
    productName: string;
    supplier: string;
    supplierLotNumber: string;
    batchId: string | null;
    entryType: string;
    feedPhase: string | null;
    customFeedPhaseName: string | null;
    productId: string | null;
    foodType: string | null;
    receivedDate: string;
    expirationDate: string | null;
    quantity: number;
    unit: string | null;
    receivedKg: number;
    usedKg: number;
    lostKg: number;
    soldKg: number;
    availableKg: number;
    expired: boolean;
  }>;
  losses: Array<{
    id: string;
    inputLotId: string | null;
    batchId: string | null;
    quantityKg: number;
    reason: string;
    occurredAt: string;
    notes: string | null;
    createdAt: string;
  }>;
}

export interface FeedProduct {
  id: string;
  farmId: string;
  name: string;
  entryType: string;
  foodType: string | null;
  feedPhase: string | null;
  customFeedPhaseName: string | null;
  defaultSacKg: number | null;
  defaultBagSizeKg: number | null;
  defaultUnitPriceFcfa: number | null;
  defaultCostPerMtFcfa: number | null;
  defaultCostPerBagFcfa: number | null;
  supplier: string | null;
  active: boolean;
}

export interface SlaughterOrder {
  id: string;
  farmId: string;
  batchId: string;
  referenceNumber: string;
  slaughterType: string;
  destination: string;
  status: string;
  birdCount: number;
  plannedDate: string | null;
  internalBatchCode: string | null;
  externalSlaughterhouseCode: string | null;
  createdAt: string;
}

export interface RuleResistryEntry {
  id: string;
  code: string;
  category: string;
  kind: string;
  isActive: boolean;
  params?: Record<string, unknown> | null;
}

export interface ReferenceConstant {
  key: string;
  value: number;
  /** What the threshold means (and its unit), as seeded. */
  description: string | null;
  isEditable: boolean;
  /** POUFA lot A droits (F8): the profile that owns the threshold (older servers omit it). */
  ownerProfile?: 'DGE' | 'VETERINAIRE';
  /** POUFA lot A droits: sanitary thresholds (veterinary services) or conduct ones (DGE). */
  group?: 'SANITAIRE' | 'CONDUITE';
}

export interface PlatformMetrics {
  farms: { total: number; active: number };
  users: { total: number; suspended: number; byRole: Array<{ role: Role; count: number; suspended: number }> };
  lots: { active: number; cheptel: number };
  sales: { count: number; revenueFcfa: number; discountsFcfa: number };
  paidFcfa: number;
  alerts: { total: number; byLevel: Array<{ level: string; count: number }> };
  customersCount: number;
  period: { from: string | null; to: string | null };
}

export interface PlatformFarmRow {
  farm: { id: string; name: string; administrativeCity: string | null; isVerified: boolean; active: boolean; createdAt: string };
  owner: PublicUser | null;
  lots: { active: number; cheptel: number };
  sales: { count: number; revenueFcfa: number; discountsFcfa: number };
  paidFcfa: number;
  alertsActive: number;
  customersCount: number;
}