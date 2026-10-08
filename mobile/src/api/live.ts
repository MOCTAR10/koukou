import { apiFetch } from './client';
import type {
  Alert,
  AlertCategory,
  AlertLevel,
  AlertStatus,
  AdvisoryData,
  BalanceData,
  BilanData,
  BatchCurve,
  BatchHealth,
  BatchMetrics,
  BatchPnl,
  BatchType,
  BatchStatus,
  BatchWithMetrics,
  CaisseSummary,
  CashSession,
  CloseExerciceResult,
  CompteResultatData,
  CreateRegularisationInput,
  ExerciceInfo,
  InitAccountResult,
  JournalData,
  GrandLivreAccount,
  MortalityStatus,
  EggBreakdown,
  Customer,
  CustomerBalance,
  CustomerStats,
  CustomerSummary,
  DashboardData,
  Expense,
  Farm,
  FarmMember,
  FarmMemberProfile,
  AssignableTeamMember,
  PermissionCatalog,
  FarmWeather,
  FeedMovement,
  FeedProduct,
  FeedStockSummary,
  HealthEvent,
  InputLot,
  NextAction,
  OrderCanal,
  OrderFull,
  OrderStatus,
  OverviewPnl,
  PondageSummary,
  PointOfSale,
  StockProvende,
  StockTransfer,
  StockTransferProductType,
  Promotion,
  ProphylaxisEvent,
  ReadyReason,
  ReferenceConstant,
  SaleFull,
  SaleSummary,
  SanitaryProtocol,
  SanitaryProtocolWithSteps,
  SlaughterOrder,
  TreatmentRecord,
  Building,
  Breed,
  BreedStandard,
  FarmTask,
  DailyEntryRecord,
  Species,
  Culture,
  Parcelle,
  ParcelleStock,
  Recolte,
  CropCategory,
} from './types';

interface BackendAdvisoryAction {
  id: string;
  category: AlertCategory;
  level: AlertLevel;
  title: string;
  description: string;
  dueDate: string | null;
  batchId: string | null;
  batchName: string | null;
  buildingId: string | null;
  acknowledged: boolean;
  alertId: string | null;
  /** Kind réel pour les actions issues d'une alerte stockée. */
  kind?: string | null;
  status?: AlertStatus;
}

interface BackendStoredAlert {
  id: string;
  farmId: string;
  batchId: string | null;
  buildingId: string | null;
  kind: string;
  level: AlertLevel;
  status: AlertStatus;
  message: string;
  recommendation: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface BackendAdvisory {
  farmId: string;
  generatedAt: string;
  summary: { total: number; rouge: number; jaune: number; vert: number };
  actions: BackendAdvisoryAction[];
}

interface BackendWeatherDay {
  date: string;
  tempC: number;
  humidityPct: number;
  thi: number;
  zone: string;
  level: string | null;
}

interface BackendWeather {
  available: boolean;
  today: BackendWeatherDay | null;
  forecast: BackendWeatherDay[];
  source: string;
}

const ZONE_CONDITION_FR: Record<string, string> = {
  CONFORT: 'Confort thermique',
  PRUDENCE: 'Prudence',
  MODERE: 'Stress modéré',
  SEVERE: 'Stress sévère',
  DANGER: 'Danger canicule',
};

function zoneCondition(zone: string): string {
  return ZONE_CONDITION_FR[zone] ?? 'Prévision météo';
}

function mapWeather(raw: BackendWeather | null): FarmWeather | null {
  if (!raw || !raw.available || !raw.today) return null;
  const today = raw.today;
  return {
    provider: raw.source,
    location: 'Gabon',
    temperatureC: today.tempC,
    humidityPct: today.humidityPct,
    rainfallMm: 0,
    windKmh: 0,
    condition: zoneCondition(today.zone),
    forecast: raw.forecast.map((d) => ({
      date: d.date,
      temperatureC: d.tempC,
      humidityPct: d.humidityPct,
      condition: zoneCondition(d.zone),
    })),
  };
}

interface RawBatchMetrics {
  ageDays?: number;
  totalDeaths?: number;
  liveCount?: number;
  mortalityPercent?: number;
  viabilityPercent?: number;
  expectedMortalityPct?: number;
  mortalityDeviationPct?: number | null;
  mortalityStatus?: string;
  totalFeedKg?: number;
  totalWeightGainKg?: number | null;
  fcr?: number | null;
  gmqGramsPerDay?: number | null;
  ipe?: number | null;
  eggsCollectedTotal?: number;
  eggBreakdown?: EggBreakdown;
  eggStockAvailableEggs?: number;
  eggStockAvailableAlveoles?: number;
  layRatePercent?: number | null;
  status?: string;
  densityPerM2?: number | null;
  moduleFraction?: number;
  moduleRatioVsCapacity?: number | null;
  feedConsumedKg?: number;
  stockKg?: number | null;
  eggsCollected?: number;
  alerts?: number;
  readyForSale?: boolean;
  readyReason?: string;
}

interface RawBatch {
  id: string;
  farmId: string;
  batchName: string | null;
  buildingId?: string | null;
  breedId: string | null;
  integrationDate: string;
  quantityAtStart: number;
  quantityAlive: number;
  type: BatchType;
  species?: Species;
  customSpecies?: string | null;
  customBreed?: string | null;
  status: BatchStatus;
  metrics: RawBatchMetrics;
}

const CTA_BY_CATEGORY: Record<AlertCategory, string> = {
  ALERTE: "J'ai vu",
  SAISIE: 'Saisir',
  SOIN: 'Fait',
  STOCK_PROVENDE: 'Commander',
  VENTE: 'Encaisser',
};

const GRADE_TABLE: { min: number; grade: 'EXCELLENT' | 'BON' | 'MOYEN' | 'CRITIQUE' }[] = [
  { min: 85, grade: 'EXCELLENT' },
  { min: 70, grade: 'BON' },
  { min: 50, grade: 'MOYEN' },
  { min: 0, grade: 'CRITIQUE' },
];

/** Normalise le statut mortalité. Fallback sur les anciens seuils fixes. */
function toMortalityStatus(v?: string | null, mortalityPercent?: number): MortalityStatus {
  if (v === 'normal' || v === 'elevated' || v === 'critical') return v;
  const pct = mortalityPercent ?? 0;
  if (pct > 5) return 'critical';
  if (pct > 1) return 'elevated';
  return 'normal';
}

function mapMetrics(m: RawBatchMetrics): BatchMetrics {
  return {
    ageDays: m.ageDays ?? 0,
    totalDeaths: m.totalDeaths ?? 0,
    liveCount: m.liveCount ?? 0,
    mortalityPercent: m.mortalityPercent ?? 0,
    expectedMortalityPct: m.expectedMortalityPct ?? m.mortalityPercent ?? 0,
    mortalityDeviationPct: m.mortalityDeviationPct ?? null,
    mortalityStatus: toMortalityStatus(m.mortalityStatus, m.mortalityPercent),
    viabilityPercent: m.viabilityPercent ?? 0,
    totalFeedKg: m.totalFeedKg ?? m.feedConsumedKg ?? 0,
    totalWeightGainKg: m.totalWeightGainKg ?? null,
    fcr: m.fcr ?? null,
    gmqGramsPerDay: m.gmqGramsPerDay ?? null,
    ipe: m.ipe ?? null,
    eggsCollectedTotal: m.eggsCollectedTotal ?? m.eggsCollected ?? 0,
    eggBreakdown: m.eggBreakdown ?? {
      collected: m.eggsCollectedTotal ?? m.eggsCollected ?? 0,
      sellable: 0,
      cracked: 0,
      small: 0,
      doubleYolk: 0,
      dirty: 0,
    },
    layRatePercent: m.layRatePercent ?? null,
    eggStockAvailableEggs: m.eggStockAvailableEggs ?? (m.eggStockAvailableAlveoles ?? 0) * 30,
    eggStockAvailableAlveoles: m.eggStockAvailableAlveoles ?? 0,
    status: (m.status as AlertLevel) ?? 'VERT',
    densityPerM2: m.densityPerM2 ?? null,
    moduleFraction: m.moduleFraction ?? 0,
    moduleRatioVsCapacity: m.moduleRatioVsCapacity ?? null,
    feedConsumedKg: m.feedConsumedKg ?? m.totalFeedKg ?? 0,
    stockKg: m.stockKg ?? null,
    eggsCollected: m.eggsCollected ?? m.eggsCollectedTotal ?? 0,
    alerts: m.alerts ?? 0,
    readyForSale: m.readyForSale ?? false,
    readyReason: (m.readyReason as ReadyReason) ?? 'N_A',
  };
}

const breedsById = new Map<string, { name: string; refCode: string | null }>();

/** Test-only : vide le cache de souches entre deux tests. */
export function _clearBreedCache(): void {
  breedsById.clear();
}

async function ensureBreeds(): Promise<void> {
  if (breedsById.size > 0) return;
  const breeds = await apiFetch<{ id: string; name: string; refCode: string | null }[]>('/breeds');
  for (const b of breeds) breedsById.set(b.id, { name: b.name, refCode: b.refCode ?? null });
}

function mapBatch(b: RawBatch): BatchWithMetrics {
  const cached =
    b.breedId && breedsById.has(b.breedId)
      ? breedsById.get(b.breedId)!
      : null;
  return {
    id: b.id,
    farmId: b.farmId,
    batchName: b.batchName,
    buildingId: b.buildingId ?? null,
    breedCode: b.breedId ? (cached?.refCode ?? null) : null,
    breedName: b.breedId ? (cached?.name ?? null) : (b.customBreed ?? null),
    integrationDate: b.integrationDate,
    quantityAtStart: b.quantityAtStart,
    quantityAlive: b.quantityAlive,
    type: b.type,
    species: b.species ?? 'POULET',
    customSpecies: b.customSpecies ?? null,
    customBreed: b.customBreed ?? null,
    status: b.status,
    metrics: mapMetrics(b.metrics),
  };
}

function mapAction(a: BackendAdvisoryAction): NextAction {
  return {
    id: a.id,
    level: a.level,
    category: a.category,
    kind: a.kind ?? a.category,
    title: a.title,
    message: a.description,
    recommendation: null,
    batchId: a.batchId,
    batchName: a.batchName,
    dueDate: a.dueDate,
    status: actionStatus(a),
    why: [],
    cta: CTA_BY_CATEGORY[a.category],
  };
}

function actionStatus(a: BackendAdvisoryAction): AlertStatus {
  return a.status ?? (a.acknowledged ? 'ACQUITTEE' : 'ACTIVE');
}

/** Alerte stockée (GET /alerts/history) → forme mobile. */
function mapStoredAlert(raw: BackendStoredAlert): Alert {
  return {
    id: `alert:${raw.id}`,
    farmId: raw.farmId,
    batchId: raw.batchId,
    batchName: null,
    category: 'ALERTE',
    kind: raw.kind,
    level: raw.level,
    status: raw.status,
    message: raw.message,
    recommendation: raw.recommendation,
    why: [],
    createdAt: raw.createdAt,
    dueDate: null,
    resolvedAt: raw.resolvedAt,
    alertId: raw.id,
  };
}

export function mapAdvisory(raw: BackendAdvisory): AdvisoryData {
  const { summary } = raw;
  const saisies = raw.actions.filter((a) => a.category === 'SAISIE').length;
  const score = Math.max(0, Math.min(100, 100 - summary.rouge * 20 - summary.jaune * 5 - saisies * 10));
  const grade = GRADE_TABLE.find((g) => score >= g.min)?.grade ?? 'CRITIQUE';

  const alerts: Alert[] = raw.actions.map((a): Alert => {
    const status = actionStatus(a);
    return {
      id: a.id,
      farmId: raw.farmId,
      batchId: a.batchId,
      batchName: a.batchName,
      category: a.category,
      kind: a.kind ?? a.category,
      level: a.level,
      status,
      message: a.title,
      recommendation: null,
      why: a.description ? [a.description] : [],
      createdAt: raw.generatedAt,
      dueDate: a.dueDate,
      alertId: a.alertId ?? null,
    };
  });

  return {
    generatedAt: raw.generatedAt,
    pulse: { score, grade, breakdown: { rouge: summary.rouge, jaune: summary.jaune, saisiesManquantes: saisies } },
    actions: raw.actions.map(mapAction),
    alerts,
  };
}

export class LiveApi {
  async fetchFarms() {
    return apiFetch<Farm[]>('/farms');
  }

  private accountingPeriod(from?: string, to?: string): string {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const query = qs.toString();
    return query ? `?${query}` : '';
  }

  async fetchJournal(farmId: string, from?: string, to?: string): Promise<JournalData> {
    return apiFetch<JournalData>(
      `/farms/${farmId}/accounting/journal${this.accountingPeriod(from, to)}`,
    );
  }

  async fetchGrandLivre(farmId: string, from?: string, to?: string): Promise<GrandLivreAccount[]> {
    return apiFetch<GrandLivreAccount[]>(
      `/farms/${farmId}/accounting/grand-livre${this.accountingPeriod(from, to)}`,
    );
  }

  async fetchBalance(farmId: string, from?: string, to?: string): Promise<BalanceData> {
    return apiFetch<BalanceData>(
      `/farms/${farmId}/accounting/balance${this.accountingPeriod(from, to)}`,
    );
  }

  async fetchCompteResultat(farmId: string, from?: string, to?: string): Promise<CompteResultatData> {
    return apiFetch<CompteResultatData>(
      `/farms/${farmId}/accounting/compte-resultat${this.accountingPeriod(from, to)}`,
    );
  }

  async fetchBilan(farmId: string, from?: string, to?: string): Promise<BilanData> {
    return apiFetch<BilanData>(
      `/farms/${farmId}/accounting/bilan${this.accountingPeriod(from, to)}`,
    );
  }

  async initializeAccounting(farmId: string): Promise<InitAccountResult> {
    return apiFetch<InitAccountResult>(`/farms/${farmId}/accounting/init`, {
      method: 'POST',
      body: {},
    });
  }

  async fetchExercices(farmId: string): Promise<ExerciceInfo[]> {
    return apiFetch<ExerciceInfo[]>(`/farms/${farmId}/accounting/exercices`);
  }

  async fetchStockProvende(farmId: string): Promise<StockProvende> {
    return apiFetch<StockProvende>(`/farms/${farmId}/accounting/stock`);
  }

  async closeExercice(
    farmId: string,
    exerciceId: string,
  ): Promise<CloseExerciceResult> {
    return apiFetch<CloseExerciceResult>(
      `/farms/${farmId}/accounting/exercices/${exerciceId}/close`,
      { method: 'POST', body: {} },
    );
  }

  async createRegularisation(
    farmId: string,
    input: CreateRegularisationInput,
  ): Promise<JournalData['entries'][number]> {
    return apiFetch<JournalData['entries'][number]>(
      `/farms/${farmId}/accounting/entries`,
      { method: 'POST', body: input },
    );
  }

  async fetchDashboard(farmId: string, date?: string, time?: string): Promise<DashboardData> {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (time) params.set('time', time);
    const qs = params.toString();
    const raw = await apiFetch<DashboardData>(`/farms/${farmId}/dashboard${qs ? `?${qs}` : ''}`);
    const weather = mapWeather(raw.weather as unknown as BackendWeather | null);
    return { ...raw, weather };
  }

  async fetchBatches(
    farmId: string,
    asOf?: string,
  ): Promise<BatchWithMetrics[]> {
    await ensureBreeds();
    const raw = await apiFetch<RawBatch[]>(
      `/farms/${farmId}/batches${asOf ? `?asOf=${asOf}` : ''}`,
    );
    return raw.map(mapBatch);
  }

  async fetchBatch(
    farmId: string,
    batchId: string,
    asOf?: string,
  ): Promise<BatchWithMetrics> {
    await ensureBreeds();
    const raw = await apiFetch<RawBatch>(
      `/farms/${farmId}/batches/${batchId}${asOf ? `?asOf=${asOf}` : ''}`,
    );
    return mapBatch(raw);
  }

  async fetchCurve(farmId: string, batchId: string): Promise<BatchCurve> {
    return apiFetch<BatchCurve>(`/farms/${farmId}/batches/${batchId}/curve`);
  }

  async fetchAdvisory(farmId: string): Promise<AdvisoryData> {
    const raw = await apiFetch<BackendAdvisory>(`/farms/${farmId}/advisory/next-actions`);
    return mapAdvisory(raw);
  }

  /** Historique complet des alertes stockées (actives, acquittées, résolues). */
  async fetchAlertHistory(farmId: string): Promise<Alert[]> {
    const raw = await apiFetch<BackendStoredAlert[]>(`/farms/${farmId}/alerts/history`);
    return raw.map(mapStoredAlert);
  }

  async fetchFeedStock(farmId: string): Promise<FeedStockSummary> {
    return apiFetch<FeedStockSummary>(`/farms/${farmId}/feed-stock`);
  }

  async fetchFeedProducts(farmId: string): Promise<FeedProduct[]> {
    return apiFetch<FeedProduct[]>(`/farms/${farmId}/feed-products`);
  }

  async fetchFeedMovements(farmId: string): Promise<FeedMovement[]> {
    return apiFetch<FeedMovement[]>(`/farms/${farmId}/feed-stock/movements`);
  }

  async fetchCaisseCurrent(farmId: string): Promise<CaisseSummary | null> {
    return apiFetch<CaisseSummary | null>(`/farms/${farmId}/caisse/current`);
  }

  async fetchCaisseSessions(farmId: string): Promise<CashSession[]> {
    return apiFetch<CashSession[]>(`/farms/${farmId}/caisse/sessions`);
  }

  async fetchProtocols(species?: string, type?: string): Promise<SanitaryProtocol[]> {
    const params = new URLSearchParams();
    if (species) params.set('species', species);
    if (type) params.set('type', type);
    const qs = params.toString();
    return apiFetch<SanitaryProtocol[]>(
      `/sanitary/protocols${qs ? `?${qs}` : ''}`,
    );
  }

  async fetchSanitaryProgram(id: string): Promise<SanitaryProtocolWithSteps> {
    return apiFetch<SanitaryProtocolWithSteps>(`/sanitary/protocols/${id}`);
  }

  async fetchFarmInputs(farmId: string): Promise<InputLot[]> {
    return apiFetch<InputLot[]>(`/farms/${farmId}/inputs`);
  }

  async fetchProphylaxis(farmId: string, batchId: string): Promise<ProphylaxisEvent[]> {
    return apiFetch<ProphylaxisEvent[]>(`/farms/${farmId}/batches/${batchId}/prophylaxis`);
  }

  async fetchTreatments(farmId: string, batchId: string): Promise<TreatmentRecord[]> {
    return apiFetch<TreatmentRecord[]>(`/farms/${farmId}/batches/${batchId}/treatments`);
  }

  async fetchBatchHealth(farmId: string, batchId: string, asOf?: string): Promise<BatchHealth> {
    return apiFetch<BatchHealth>(`/farms/${farmId}/batches/${batchId}/health${asOf ? `?asOf=${asOf}` : ''}`);
  }

  async fetchHealthEvents(farmId: string, batchId: string): Promise<HealthEvent[]> {
    return apiFetch<HealthEvent[]>(`/farms/${farmId}/batches/${batchId}/health-events`);
  }

  async fetchPondage(farmId: string, batchId: string): Promise<PondageSummary> {
    return apiFetch<PondageSummary>(`/farms/${farmId}/batches/${batchId}/pondage`);
  }

  async fetchSlaughterOrders(farmId: string): Promise<SlaughterOrder[]> {
    return apiFetch<SlaughterOrder[]>(`/farms/${farmId}/slaughter-orders`);
  }

  async fetchCustomers(
    farmId: string,
    filters?: { search?: string; type?: string },
  ): Promise<Customer[]> {
    const qs = new URLSearchParams();
    if (filters?.search?.trim()) qs.set('search', filters.search.trim());
    if (filters?.type) qs.set('type', filters.type);
    const query = qs.toString();
    return apiFetch<Customer[]>(`/farms/${farmId}/customers${query ? `?${query}` : ''}`);
  }

  async fetchCustomersSummary(farmId: string): Promise<CustomerSummary> {
    return apiFetch<CustomerSummary>(`/farms/${farmId}/customers/summary`);
  }

  async updateCustomer(
    farmId: string,
    customerId: string,
    input: {
      type?: string;
      fullName?: string;
      phone?: string;
      city?: string;
      notes?: string;
    },
  ): Promise<Customer> {
    return apiFetch<Customer>(`/farms/${farmId}/customers/${customerId}`, {
      method: 'PATCH',
      body: input,
    });
  }

  async recordCustomerPayment(
    farmId: string,
    customerId: string,
    input: { amountFcfa: number; idempotencyKey?: string },
  ): Promise<{ payments: unknown[]; balance: CustomerBalance }> {
    return apiFetch<{ payments: unknown[]; balance: CustomerBalance }>(
      `/farms/${farmId}/customers/${customerId}/payments`,
      { method: 'POST', body: input },
    );
  }

  async fetchCustomer(farmId: string, customerId: string): Promise<Customer> {
    return apiFetch<Customer>(`/farms/${farmId}/customers/${customerId}`);
  }

  async fetchCustomerStats(farmId: string, customerId: string): Promise<CustomerStats> {
    return apiFetch<CustomerStats>(`/farms/${farmId}/customers/${customerId}/stats`);
  }

  async fetchCustomerHistory(farmId: string, customerId: string): Promise<SaleFull[]> {
    return apiFetch<SaleFull[]>(`/farms/${farmId}/customers/${customerId}/history`);
  }

  async fetchPromotions(farmId: string): Promise<Promotion[]> {
    return apiFetch<Promotion[]>(`/farms/${farmId}/promotions`);
  }

  async fetchPointsOfSale(farmId: string): Promise<PointOfSale[]> {
    return apiFetch<PointOfSale[]>(`/farms/${farmId}/points-of-sale`);
  }

  async fetchPointOfSale(farmId: string, pointOfSaleId: string): Promise<PointOfSale> {
    return apiFetch<PointOfSale>(`/farms/${farmId}/points-of-sale/${pointOfSaleId}`);
  }

  async fetchStockTransfers(
    farmId: string,
    pointOfSaleId?: string,
    productType?: StockTransferProductType,
  ): Promise<StockTransfer[]> {
    const qs = new URLSearchParams();
    if (pointOfSaleId) qs.set('pointOfSaleId', pointOfSaleId);
    if (productType) qs.set('productType', productType);
    const query = qs.toString();
    return apiFetch<StockTransfer[]>(`/farms/${farmId}/stock-transfers${query ? `?${query}` : ''}`);
  }

  async fetchRentabiliteOverview(farmId: string, from?: string, to?: string): Promise<OverviewPnl> {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const query = qs.toString();
    return apiFetch<OverviewPnl>(`/farms/${farmId}/rentabilite/overview${query ? `?${query}` : ''}`);
  }

  async fetchRentabiliteBatch(farmId: string, batchId: string): Promise<BatchPnl> {
    return apiFetch<BatchPnl>(`/farms/${farmId}/rentabilite/batches/${batchId}`);
  }

  async fetchSales(farmId: string, from?: string, to?: string): Promise<SaleSummary[]> {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const query = qs.toString();
    return apiFetch<SaleSummary[]>(`/farms/${farmId}/sales${query ? `?${query}` : ''}`);
  }

  async fetchExpenses(farmId: string, from?: string, to?: string): Promise<Expense[]> {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const query = qs.toString();
    return apiFetch<Expense[]>(`/farms/${farmId}/expenses${query ? `?${query}` : ''}`);
  }

  async fetchOrders(
    farmId: string,
    canal?: OrderCanal,
    status?: OrderStatus,
  ): Promise<OrderFull[]> {
    const qs = new URLSearchParams();
    if (canal) qs.set('canal', canal);
    if (status) qs.set('status', status);
    const query = qs.toString();
    return apiFetch<OrderFull[]>(`/farms/${farmId}/orders${query ? `?${query}` : ''}`);
  }

  async fetchOrder(farmId: string, orderId: string): Promise<OrderFull> {
    return apiFetch<OrderFull>(`/farms/${farmId}/orders/${orderId}`);
  }

  async fetchFarmMembers(farmId: string): Promise<FarmMember[]> {
    return apiFetch<FarmMember[]>(`/farms/${farmId}/eleveurs`);
  }

  async fetchFarmProfile(farmId: string): Promise<FarmMemberProfile> {
    return apiFetch<FarmMemberProfile>(`/farms/${farmId}/me`);
  }

  async fetchPermissionCatalog(farmId: string): Promise<PermissionCatalog> {
    return apiFetch<PermissionCatalog>(`/farms/${farmId}/permissions`);
  }

  async fetchTasks(farmId: string): Promise<FarmTask[]> {
    return apiFetch<FarmTask[]>(`/farms/${farmId}/tasks`);
  }

  async fetchAssignableTeam(farmId: string): Promise<AssignableTeamMember[]> {
    return apiFetch<AssignableTeamMember[]>(`/farms/${farmId}/team`);
  }

  async fetchDailyEntries(farmId: string, batchId: string): Promise<DailyEntryRecord[]> {
    return apiFetch<DailyEntryRecord[]>(`/farms/${farmId}/batches/${batchId}/daily-entries`);
  }

  async fetchReferenceConstants(): Promise<ReferenceConstant[]> {
    return apiFetch<ReferenceConstant[]>('/reference-constants');
  }

  async fetchBuildings(farmId: string): Promise<Building[]> {
    return apiFetch<Building[]>(`/farms/${farmId}/buildings`);
  }

  async fetchBreeds(): Promise<Breed[]> {
    return apiFetch<Breed[]>('/breeds');
  }

  async fetchBreedStandards(breedId: string): Promise<BreedStandard[]> {
    const res = await apiFetch<{
      breedId: string;
      breedName: string;
      type: string;
      standards: BreedStandard[];
    }>(`/breeds/${breedId}/standards`);
    return res.standards;
  }

  async fetchCultures(): Promise<Culture[]> {
    return apiFetch<Culture[]>('/cultures');
  }

  async createCulture(input: {
    name: string;
    category: CropCategory;
    defaultCycleDays?: number;
    waterNeedsLPlantDay?: number;
    notes?: string;
  }): Promise<Culture> {
    return apiFetch<Culture>('/cultures', { method: 'POST', body: input });
  }

  async fetchParcelles(farmId: string): Promise<Parcelle[]> {
    return apiFetch<Parcelle[]>(`/farms/${farmId}/parcelles`);
  }

  async fetchRecoltes(farmId: string): Promise<Recolte[]> {
    return apiFetch<Recolte[]>(`/farms/${farmId}/recoltes`);
  }

  async fetchRecolteStock(farmId: string): Promise<ParcelleStock[]> {
    return apiFetch<ParcelleStock[]>(`/farms/${farmId}/recoltes/stock`);
  }

  async fetchParcelle(farmId: string, parcelleId: string): Promise<Parcelle> {
    return apiFetch<Parcelle>(`/farms/${farmId}/parcelles/${parcelleId}`);
  }

  async createParcelle(
    farmId: string,
    input: {
      name: string;
      cultureId: string;
      areaHa?: number;
      boundaryGeoJson?: Parcelle['boundaryGeoJson'];
      plantedAt?: string;
      status?: Parcelle['status'];
      notes?: string;
    },
  ): Promise<Parcelle> {
    return apiFetch<Parcelle>(`/farms/${farmId}/parcelles`, {
      method: 'POST',
      body: input,
    });
  }

  async updateParcelle(
    farmId: string,
    parcelleId: string,
    input: Partial<{
      name: string;
      cultureId: string;
      areaHa: number;
      boundaryGeoJson: Parcelle['boundaryGeoJson'];
      plantedAt: string | null;
      status: Parcelle['status'];
      notes: string | null;
    }>,
  ): Promise<Parcelle> {
    return apiFetch<Parcelle>(`/farms/${farmId}/parcelles/${parcelleId}`, {
      method: 'PATCH',
      body: input,
    });
  }

  async deleteParcelle(
    farmId: string,
    parcelleId: string,
  ): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(
      `/farms/${farmId}/parcelles/${parcelleId}`,
      { method: 'DELETE' },
    );
  }
}