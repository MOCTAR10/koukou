export type BatchType = 'CHAIR' | 'PONDEUSE';
export type Species = 'POULET' | 'DINDE' | 'PINTADE' | 'CAILLE' | 'CANARD' | 'OIE' | 'FAISAN' | 'AUTRE';
export type BatchStatus = 'ACTIF' | 'EN_VENTE' | 'FINI' | 'CLOTURE';
export type PointOfSaleKind = 'FERME' | 'BOUTIQUE';

export interface PointOfSale {
  id: string;
  farmId: string;
  kind: PointOfSaleKind;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  isDefault: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StockTransferProductType = 'ABATTU' | 'OEUFS' | 'PROVENDE';
export type StockTransferStatus = 'TRANSFERRED' | 'CANCELLED';

/** Transfert de stock ferme → boutique (abattu, œufs, provende répartis sur un PDV externe). */
export interface StockTransfer {
  id: string;
  farmId: string;
  productType: StockTransferProductType;
  sourcePosId: string;
  pointOfSaleId: string;
  slaughterOrderId: string | null;
  batchId: string | null;
  inputLotId: string | null;
  unit: string | null;
  quantity: number;
  quantitySold: number;
  status: StockTransferStatus;
  cancelledAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  slaughterOrder: SlaughterOrder | null;
  batch: ProductionBatch | null;
  inputLot: any | null;
  sourcePos: PointOfSale;
  pointOfSale: PointOfSale;
}
export type AlertLevel = 'ROUGE' | 'JAUNE' | 'VERT';
export type AlertStatus = 'ACTIVE' | 'RESOLUE' | 'ACQUITTEE';
export type HealthGrade = 'EXCELLENT' | 'BON' | 'MOYEN' | 'CRITIQUE';
export type ReadyReason = 'READY' | 'TOO_YOUNG' | 'FCR' | 'SANITARY' | 'N_A';
/** Écart de mortalité vs attendu à l'âge du lot (référentiel serveur). */
export type MortalityStatus = 'normal' | 'elevated' | 'critical';
export type OrderCanal = 'FERME' | 'LIVRAISON' | 'PRECOMMANDE';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'LIVRE' | 'CANCELLED';

export interface Farm {
  id: string;
  name: string;
  administrativeCity: string;
  defaultSacKg: number;
  isVerified: boolean;
  active: boolean;
}

export type UserRole = 'PROPRIETAIRE' | 'ELEVEUR' | 'PLATFORM_ADMIN';

export interface PublicUser {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  role: UserRole;
}

/** Lien de travail d'un compte Éleveur rattaché à la ferme (GET /farms/:id/eleveurs). */
export interface FarmMember {
  id: string;
  farmId: string;
  userId: string;
  buildingAssignment: string | null;
  user: PublicUser;
}

export interface ReferenceConstant {
  key: string;
  value: number;
  description: string | null;
  isEditable: boolean;
}

export interface EggBreakdown {
  /** Œufs collectés au total (toutes classes confondues). */
  collected: number;
  /** Œufs commercialisables = collectés − (fêlés + petits + double jaune + sales). */
  sellable: number;
  cracked: number;
  small: number;
  doubleYolk: number;
  dirty: number;
}

export interface BatchMetrics {
  ageDays: number;
  totalDeaths: number;
  mortalityPercent: number;
  /** Mortalité cumulée attendue à l'âge du lot (référentiel de la bande). */
  expectedMortalityPct: number;
  /** Écart relatif (actual − attendu) / attendu × 100. */
  mortalityDeviationPct: number | null;
  /** normal | elevated | critical — écart de mortalité vs attendu. */
  mortalityStatus: MortalityStatus;
  viabilityPercent: number;
  liveCount: number;
  totalFeedKg: number;
  totalWeightGainKg: number | null;
  fcr: number | null;
  gmqGramsPerDay: number | null;
  ipe: number | null;
  eggsCollectedTotal: number;
  eggBreakdown: EggBreakdown;
  layRatePercent: number | null;
  status: AlertLevel;
  densityPerM2: number | null;
  moduleFraction: number;
  moduleRatioVsCapacity: number | null;
  /** Legacy compat — mapped from totalFeedKg */
  feedConsumedKg: number;
  /** Legacy compat */
  stockKg: number | null;
  /** Legacy compat — mapped from eggsCollectedTotal */
  eggsCollected: number;
  /** Legacy compat */
  alerts: number;
  /** Prêt à la vente / réforme (auto-signal serveur). */
  readyForSale: boolean;
  readyReason: ReadyReason;
}

export interface Breed {
  id: string;
  name: string;
  /** Code de référence fournisseur/couvoir (ex : BV-300). */
  refCode: string | null;
  type: BatchType;
  species: Species;
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
  stats?: { activeBirds: number; activeLots: number; densityPerM2: number | null };
}

export interface ProductionBatch {
  id: string;
  farmId: string;
  batchName: string | null;
  /** Bâtiment d'accueil du lot (nullable). */
  buildingId?: string | null;
  /** Code de la souche (référentiel fournisseur/couvoir — ex : AA-500). */
  breedCode: string | null;
  breedName: string | null;
  integrationDate: string;
  quantityAtStart: number;
  quantityAlive: number;
  type: BatchType;
  species: Species;
  status: BatchStatus;
  /** Espèce libre — quand species = AUTRE (ex : "Canard") */
  customSpecies?: string | null;
  /** Souche / race libre — quand species = AUTRE (ex : "Coureur indien") */
  customBreed?: string | null;
  /** Identifiant de la souche (comparaisons aux standards de la courbe). */
  breedId?: string | null;
  /** Auto-signal de disponibilité à la vente (persisté côté serveur). */
  readyForSaleAt?: string | null;
}

/** Saisie journalière existante (upsert par date côté serveur). */
export interface DailyEntryRecord {
  id: string;
  batchId: string;
  entryDate: string;
  deaths: number;
  /** Toujours en kg côté serveur (les sacs sont convertis). */
  feedQuantity: number;
  feedUnit: 'SAC' | 'KG' | null;
  /** Poids d'un sac (kg) quand la saisie d'aliment était en sacs. */
  bagSizeKg: number | null;
  feedPhase: string | null;
  customFeedPhaseName: string | null;
  inputLotId: string | null;
  /** Achat externe : consommation enregistrée sans décrémenter le stock suivi. */
  skipStockDeduction: boolean;
  waterL: number;
  avgWeightKg: number | null;
  eggsCollected: number;
  eggsSellable: number;
  eggsCracked: number;
  eggsSmall: number;
  eggsDoubleYolk: number;
  eggsDirty: number;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface BatchWithMetrics extends ProductionBatch {
  metrics: BatchMetrics;
}

export interface DashboardHealth {
  score: number;
  grade: HealthGrade;
  breakdown: { rouge: number; jaune: number; saisiesManquantes: number };
}

export interface BreedStatus {
  breedId: string;
  breedName: string;
  breedCode: string | null;
  breedType: BatchType;
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

export interface HealthOverviewRow {
  batchId: string;
  batchName: string | null;
  status: BatchStatus;
  type: BatchType;
  species: Species;
  customSpecies?: string | null;
  ageDays: number;
  liveCount: number;
  weekDeaths: number;
  mortalityPercent: number;
  /** Mortalité cumulée attendue à l'âge du lot (référentiel de la bande). */
  expectedMortalityPct: number;
  /** normal | elevated | critical — écart de mortalité vs attendu. */
  mortalityStatus: MortalityStatus;
  alertesRouges: number;
  alertesJaunes: number;
  lastEntryDate: string | null;
  lastEntryLagDays: number | null;
  breedStatus: BreedStatus | null;
}

export interface WeeklyDeltas {
  mortalityThisWeek: number;
  mortalityPrevWeek: number;
  mortalityDelta: number;
  feedThisWeekKg: number;
  feedPrevWeekKg: number;
  feedDeltaKg: number;
  layRateThisWeekPct: number | null;
  layRatePrevWeekPct: number | null;
  layRateDeltaPct: number | null;
}

export interface EggStockInfo {
  availableAlveoles: number;
  availableEggs: number;
  warnAlveoles: number;
  collected: number;
  soldAlveoles: number;
}

export interface FarmWeather {
  provider: string;
  location: string;
  temperatureC: number;
  humidityPct: number;
  rainfallMm: number;
  windKmh: number;
  condition: string;
  forecast: { date: string; temperatureC: number; humidityPct: number; condition: string }[];
}

export interface LeaderboardRow {
  batchId: string;
  batchName: string | null;
  status: BatchStatus;
  type: BatchType;
  species: Species;
  customSpecies?: string | null;
  ageDays: number;
  perfIndex: number | null;
  fcr: number | null;
  gmqGramsPerDay: number | null;
  ipe: number | null;
  layRatePercent: number | null;
  mortalityPercent: number;
  liveCount: number;
}

export interface DashboardData {
  farmId: string;
  generatedAt: string;
  liveStock: number;
  batches: { total: number; actif: number; enVente: number; cloture: number };
  mortalityPercent: number | null;
  viabilityPercent: number | null;
  /** Statut mortalité agrégé de la ferme (le plus dégradé). */
  mortalityStatus: MortalityStatus;
  feedAutonomyDays: number | null;
  collectedTodayFcfa: number;
  teamCount: number;
  alerts: { total: number; rouge: number; jaune: number; vert: number };
  health: DashboardHealth;
  healthOverview: HealthOverviewRow[];
  leaderboard: LeaderboardRow[];
  deltas: WeeklyDeltas;
  eggStock: EggStockInfo;
  weather: FarmWeather | null;
  /** Consommation d'eau totale aujourd'hui (litres). */
  waterConsumptionTodayL: number | null;
  /** Variation (%) de consommation d'eau vs veille. */
  waterDropPercent: number | null;
  /** Nombre de bâtiments de la ferme. */
  buildingsCount: number;
  /** Surface totale des bâtiments (m²). */
  totalAreaM2: number | null;
  /** Densité globale ferme = liveStock / totalAreaM2 (oiseaux/m²). */
  farmDensityPerM2: number | null;
}

export interface CurveWeek {
  weekStart: string;
  avgWeightKg: number | null;
  feedKg: number;
  waterL: number;
  waterLPerBird: number | null;
  deaths: number;
  cumFeedKg: number;
  fcrCumulative: number | null;
}

export interface BatchCurve {
  batchId: string;
  liveCount: number;
  startWeightKg: number;
  weekly: CurveWeek[];
}

export interface Alert {
  id: string;
  farmId: string;
  batchId: string | null;
  batchName: string | null;
  kind: string;
  level: AlertLevel;
  status: AlertStatus;
  message: string;
  recommendation: string | null;
  why: string[];
  createdAt: string;
  /** Id de l'alerte backend (POST acknowledge) — null si action advisoriale sans alerte. */
  alertId?: string | null;
}

export interface NextAction {
  id: string;
  level: AlertLevel;
  kind: string;
  title: string;
  message: string;
  recommendation: string | null;
  batchId: string | null;
  batchName: string | null;
  why: string[];
  cta: string;
}

export interface AdvisoryData {
  generatedAt: string;
  pulse: DashboardHealth;
  actions: NextAction[];
  alerts: Alert[];
}

export interface SyncStatus {
  online: boolean;
  freshSince: string;
  pending: number;
}

export type CashSessionStatus = 'OPEN' | 'CLOSED';
export type CashMovementType = 'IN' | 'OUT';
export type CashMovementSource = 'SALE_PAYMENT' | 'MANUAL' | 'REFUND' | 'EXPENSE';

export interface CashSession {
  id: string;
  farmId: string;
  status: CashSessionStatus;
  openedAt: string;
  openingBalanceFcfa: number;
  closingBalanceFcfa: number | null;
  closingExpectedFcfa: number | null;
  closingDifferenceFcfa: number | null;
  closedAt: string | null;
  openedById: string | null;
  closedById: string | null;
  createdAt: string;
}

export interface CashMovement {
  id: string;
  farmId: string;
  cashSessionId: string | null;
  type: CashMovementType;
  source: CashMovementSource;
  amountFcfa: number;
  reason: string | null;
  saleId: string | null;
  movementDate: string;
  createdById: string | null;
  createdAt: string;
}

export interface CaisseSummary {
  session: CashSession;
  movements: CashMovement[];
  inFcfa: number;
  outFcfa: number;
  expectedBalanceFcfa: number;
}

export type FeedPhase =
  | 'POUSSIN'
  | 'DEMARRAGE'
  | 'CROISSANCE'
  | 'PRE_PONTE'
  | 'PONTE_PHASE_1'
  | 'PONTE_PHASE_2'
  | 'PONTE_PHASE_3'
  | 'FINITION'
  | 'PERSONNALISE';

export type FeedEntryType = 'BULKER' | 'BAG' | 'MEDICAMENT' | 'MATIERE_PREMIERE';

export type FeedLossReason = 'HUMIDITE' | 'RONGEURS' | 'AUTRE';

export interface FeedProduct {
  id: string;
  farmId: string;
  name: string;
  entryType: FeedEntryType;
  foodType: string | null;
  feedPhase: FeedPhase | null;
  customFeedPhaseName: string | null;
  defaultSacKg: number | null;
  defaultBagSizeKg: number | null;
  defaultUnitPriceFcfa: number | null;
  defaultCostPerMtFcfa: number | null;
  defaultCostPerBagFcfa: number | null;
  supplier: string | null;
  active: boolean;
}

export interface FeedTypeStock {
  feedPhase: FeedPhase;
  foodType: string | null;
  receivedKg: number;
  usedKg: number;
  lostKg: number;
  soldKg: number;
  availableKg: number;
  autonomyDays: number | null;
  status: AlertLevel;
  /** Lot à déduire en priorité (FEFO) suggéré par le serveur. */
  suggestedLotId: string | null;
  suggestedLotName: string | null;
}

export interface FeedLotStock {
  id: string;
  productName: string;
  supplier: string;
  supplierLotNumber: string;
  batchId: string | null;
  entryType: FeedEntryType;
  feedPhase: FeedPhase | null;
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
}

export interface FeedStockLoss {
  id: string;
  inputLotId: string | null;
  batchId: string | null;
  quantityKg: number;
  reason: FeedLossReason;
  occurredAt: string;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface FeedStockSummary {
  byType: FeedTypeStock[];
  lots: FeedLotStock[];
  losses: FeedStockLoss[];
}

export type FeedMovementType = 'CONSOMMATION' | 'PERTE' | 'VENTE';

export interface FeedMovement {
  id: string;
  type: FeedMovementType;
  date: string;
  quantityKg: number;
  valueFcfa: number | null;
  foodType: string | null;
  feedPhase: FeedPhase | null;
  productName: string | null;
  inputLotId: string | null;
  batchId: string | null;
  source?: string | null;
  reason?: string | null;
  notes?: string | null;
  saleItemId?: string | null;
  createdAt: string;
}

export type CareType =
  | 'VACCIN'
  | 'MEDICAMENT'
  | 'VITAMINE'
  | 'ANTIBIOTIQUE'
  | 'AUTRE';
export type ProphylaxisStatus = 'PLANIFIE' | 'FAIT' | 'EN_RETARD' | 'ANNULE';
export type ScheduleSource = 'PROGRAM' | 'MANUEL';

export interface InputLot {
  id: string;
  farmId: string;
  batchId: string | null;
  kind: string;
  foodType: string | null;
  feedPhase: string | null;
  customFeedPhaseName: string | null;
  entryType: string;
  productId: string | null;
  productName: string;
  supplier: string;
  supplierLotNumber: string;
  receivedDate: string;
  expirationDate: string | null;
  quantity: number;
  unit: string | null;
  doseQuantity: number | null;
  doseUnit: string | null;
  unitPriceFcfa: number | null;
}

export interface SanitaryProtocol {
  id: string;
  code: string;
  species: string;
  type: BatchType;
  name: string;
  isDefault: boolean;
  isEditable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProtocolStep {
  id: string;
  protocolId: string;
  stepOrder: number;
  dayFrom: number;
  dayTo: number;
  careType: CareType;
  name: string;
  dosage: string | null;
  route: string | null;
  withdrawalDays: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SanitaryProtocolWithSteps extends SanitaryProtocol {
  steps: ProtocolStep[];
}

export interface ProphylaxisEvent {
  id: string;
  farmId: string;
  batchId: string;
  buildingId: string | null;
  protocolStepId: string | null;
  /** Protocole dont provient l'événement (résolu par le back via l'étape). */
  protocolId: string | null;
  source: ScheduleSource;
  careType: CareType;
  name: string;
  dosage: string | null;
  route: string | null;
  withdrawalDays: number;
  scheduledDate: string;
  status: ProphylaxisStatus;
  completedAt: string | null;
  performedById: string | null;
  performedNotes: string | null;
  notes: string | null;
  medicationLotId: string | null;
  medicationQty: number | null;
  medicationUnit: string | null;
  decrementStock: boolean;
  stockConsumedAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentRecord {
  id: string;
  farmId: string;
  batchId: string;
  careType: CareType;
  productName: string;
  dosage: string | null;
  route: string | null;
  administeredAt: string;
  withdrawalDays: number;
  withdrawalEndDate: string | null;
  performedById: string | null;
  medicationLotId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type HealthEventKind =
  | 'MALADIE'
  | 'MORTALITE'
  | 'REFORME'
  | 'SYMPTOME'
  | 'VISITE_VETO'
  | 'AUTRE';

export type HealthEventStatus = 'OUVERT' | 'RESOLU';

export type DiseaseSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface HealthEvent {
  id: string;
  farmId: string;
  batchId: string;
  kind: HealthEventKind;
  occurredAt: string;
  severity: AlertLevel;
  status: HealthEventStatus;
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
  resolvedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HealthTrends {
  dates: string[];
  mortality: number[];
  eggs: number[];
}

export interface BatchHealth {
  farmId: string;
  batchId: string;
  batchName: string | null;
  batchType: BatchType;
  computedAt: string;
  ageDays: number;
  quantityAtStart: number;
  liveCount: number;
  totalDeaths: number;
  mortalityPercent: number;
  /** Mortalité cumulée attendue à l'âge du lot (référentiel de la bande). */
  expectedMortalityPct: number;
  /** normal | elevated | critical — écart de mortalité vs attendu. */
  mortalityStatus: MortalityStatus;
  viabilityPercent: number;
  fcr: number | null;
  gmq: number | null;
  ipe: number | null;
  trays: number;
  eggsCollectedTotal: number;
  layRatePercent: number | null;
  feedPerBirdGrams: number;
  waterLPerBird: number | null;
  healthScore: number;
  tips: { level: AlertLevel; text: string }[];
  trends: HealthTrends;
  check: {
    insights: string[];
    advice: string[];
  };
}

export type SlaughterType = 'VIVANT' | 'ABATTU';
export type SlaughterDestination = 'INTERNE' | 'EXTERNE';
export type SlaughterStatus = 'DRAFT' | 'SENT' | 'PROCESSED' | 'CANCELLED';

export interface SlaughterOrder {
  id: string;
  farmId: string;
  batchId: string;
  referenceNumber: string;
  slaughterType: SlaughterType;
  destination: SlaughterDestination;
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
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  batch: ProductionBatch;
  /** Carcasses disponibles (issue d’un order d’abattage ABATTU traité). */
  carcassesAvailable?: number;
}

export type CustomerSegment = 'NOUVEAU' | 'REGULIER' | 'TOP';

export interface CustomerBalance {
  totalInvoicedFcfa: number;
  paidFcfa: number;
  outstandingFcfa: number;
}

export interface Customer {
  id: string;
  farmId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  notes: string | null;
  balance: CustomerBalance;
  segment: CustomerSegment;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerStats {
  visits: number;
  totalSpentFcfa: number;
  avgBasketFcfa: number;
  lastPurchaseDate: string | null;
  favorites: { productType: string; label: string; quantity: number }[];
  segment: CustomerSegment;
  balance: CustomerBalance;
}

export interface SaleItemFull {
  id: string;
  saleId: string;
  productType: string;
  label: string;
  quantity: number;
  unit: string;
  unitPriceFcfa: number;
  amountFcfa: number;
  pieceCount: number | null;
  batchId: string | null;
  inputLotId: string | null;
  sourceSlaughterOrderId?: string | null;
}

export interface SalePaymentFull {
  id: string;
  saleId: string;
  method: string;
  amountFcfa: number;
  status: string;
  paymentDate: string;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface SaleFull {
  id: string;
  farmId: string;
  referenceNumber: string;
  saleDate: string;
  totalAmountFcfa: number;
  discountAmountFcfa: number;
  promotionId: string | null;
  status: string;
  customerId: string | null;
  pointOfSaleId?: string | null;
  batchId: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdById: string | null;
  items: SaleItemFull[];
  payments: SalePaymentFull[];
  createdAt: string;
  updatedAt: string;
}

/** Vente liste (GET /farms/:farmId/sales) — le serveur renvoie les articles. */
export interface SaleSummary {
  id: string;
  farmId: string;
  referenceNumber: string;
  saleDate: string;
  totalAmountFcfa: number;
  discountAmountFcfa: number;
  promotionId: string | null;
  status: string;
  customerId: string | null;
  customer: Customer | null;
  pointOfSaleId?: string | null;
  batchId: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  items: SaleItemFull[];
}

export type ExpenseCategory =
  | 'ACHAT_POUSSINS'
  | 'ALIMENTS'
  | 'TRAITEMENTS_SANITAIRES'
  | 'TRANSPORT'
  | 'ENERGIE_GAZ'
  | 'MAIN_D_OEUVRE'
  | 'AUTRE';

export interface Expense {
  id: string;
  farmId: string;
  expenseDate: string;
  category: ExpenseCategory;
  amountFcfa: number;
  label: string | null;
  supplier: string | null;
  notes: string | null;
  paidByCaisse: boolean;
  batchId: string | null;
  cashMovementId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemSnapshot {
  saleItemId: string;
  productType: string;
  label: string;
  quantity: number;
  unit: string;
  pieceCount: number | null;
  unitPriceFcfa: number;
  amountFcfa: number;
  batchId: string | null;
  inputLotId: string | null;
}

export interface OrderFull {
  id: string;
  farmId: string;
  referenceNumber: string;
  canal: OrderCanal;
  saleId: string;
  status: OrderStatus;
  customerId: string | null;
  customer: Customer | null;
  expectedDate: string | null;
  address: string | null;
  pointOfSaleId?: string | null;
  batchId: string | null;
  batch: ProductionBatch | null;
  totalAmountFcfa: number;
  depositFcfa: number;
  items: OrderItemSnapshot[];
  livredAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  /** Détail de la vente enveloppée (GET :orderId avec paramètre). */
  sale?: SaleFull;
}

export type TaskStatus = 'A_FAIRE' | 'EN_COURS' | 'FAIT' | 'ANNULEE';

/** Tâche d'équipe (GET/POST/PATCH /farms/:farmId/tasks) — PROPRIETAIRE gère tout,
 *  ELEVEUR ne voit et ne modifie que le statut de ses tâches assignées. */
export interface FarmTask {
  id: string;
  farmId: string;
  assigneeId: string | null;
  batchId: string | null;
  title: string;
  notes: string | null;
  /** Échéance au format YYYY-MM-DD (UTC côté serveur). */
  dueDate: string;
  status: TaskStatus;
  completedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PromotionType = 'PCT' | 'FCFA';

export interface Promotion {
  id: string;
  farmId: string;
  code: string;
  label: string;
  type: PromotionType;
  value: number;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  minSubtotalFcfa: number | null;
  customerId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RentabiliteBreakdownProduct {
  productType: string;
  label: string;
  quantity: number;
  amountFcfa: number;
}

export interface RentabiliteBreakdownExpense {
  category: string;
  label: string;
  amountFcfa: number;
}

export interface RentabiliteBreakdownPayment {
  method: string;
  label: string;
  amountFcfa: number;
}

export interface OverviewPnl {
  period: { from: string; to: string };
  sales: { count: number; totalFcfa: number };
  collectedFcfa: number;
  outstandingFcfa: number;
  expenses: { count: number; totalFcfa: number };
  netFcfa: number;
  breakdown: {
    byProduct: RentabiliteBreakdownProduct[];
    byExpenseCategory: RentabiliteBreakdownExpense[];
    byPaymentMethod: RentabiliteBreakdownPayment[];
  };
}

export interface BatchPnl {
  batchId: string;
  batchName: string | null;
  status: BatchStatus;
  revenueFcfa: number;
  expensesFcfa: number;
  netFcfa: number;
  marginPct: number | null;
  costPerKgFcfa: number | null;
  kgSold: number;
  birdsSold: number;
  eggsSold: number;
  breakdown: {
    byProduct: RentabiliteBreakdownProduct[];
    byExpenseCategory: RentabiliteBreakdownExpense[];
  };
  enrichment: {
    chickCostFcfa: number | null;
    feedLotsCostFcfa: number | null;
  };
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
  type: BatchType;
  quantityAtStart: number;
  quantityAlive: number;
  daysRecorded: number;
  totals: {
    collected: number;
    sellable: number;
    cracked: number;
    small: number;
  };
  sellableRatioPercent: number | null;
  eggsPerHen: number | null;
  layRatePercent: number | null;
  weekly: PondageWeek[];
}