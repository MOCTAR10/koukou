import { LiveApi } from './live';
import type {
  AdvisoryData,
  Alert,
  BalanceData,
  BatchCurve,
  BatchHealth,
  BatchPnl,
  BatchWithMetrics,
  BilanData,
  CaisseSummary,
  CashSession,
  CloseExerciceResult,
  CompteResultatData,
  CreateRegularisationInput,
  Customer,
  CustomerStats,
  CustomerSummary,
  DashboardData,
  Expense,
  ExerciceInfo,
  FarmMember,
  FarmMemberProfile,
  AssignableTeamMember,
  PermissionCatalog,
  FarmTask,
  DailyEntryRecord,
  FeedMovement,
  FeedProduct,
  FeedStockSummary,
  GrandLivreAccount,
  HealthEvent,
  InitAccountResult,
  InputLot,
  JournalData,
  OrderCanal,
  OrderFull,
  OrderStatus,
  OverviewPnl,
  PondageSummary,
  PointOfSale,
  StockTransfer,
  StockTransferProductType,
  Promotion,
  ProphylaxisEvent,
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
  StockProvende,
  Culture,
  CropCategory,
  Parcelle,
} from './types';

const live = new LiveApi();

/**
 * L'application est désormais 100 % connectée (plus de démo en local) :
 * chaque appel part vers le serveur. Conservée pour compatibilité API.
 */
export function isLive(): boolean {
  return true;
}

export function fetchAccountJournal(
  farmId: string,
  from?: string,
  to?: string,
): Promise<JournalData> {
  return live.fetchJournal(farmId, from, to);
}

export function fetchAccountGrandLivre(
  farmId: string,
  from?: string,
  to?: string,
): Promise<GrandLivreAccount[]> {
  return live.fetchGrandLivre(farmId, from, to);
}

export function fetchAccountBalance(
  farmId: string,
  from?: string,
  to?: string,
): Promise<BalanceData> {
  return live.fetchBalance(farmId, from, to);
}

export function fetchAccountCompteResultat(
  farmId: string,
  from?: string,
  to?: string,
): Promise<CompteResultatData> {
  return live.fetchCompteResultat(farmId, from, to);
}

export function fetchAccountBilan(
  farmId: string,
  from?: string,
  to?: string,
): Promise<BilanData> {
  return live.fetchBilan(farmId, from, to);
}

export function initializeAccounting(farmId: string): Promise<InitAccountResult> {
  return live.initializeAccounting(farmId);
}

export function fetchAccountExercices(farmId: string): Promise<ExerciceInfo[]> {
  return live.fetchExercices(farmId);
}

export function fetchAccountStockProvende(farmId: string): Promise<StockProvende> {
  return live.fetchStockProvende(farmId);
}

export function closeAccountExercice(
  farmId: string,
  exerciceId: string,
): Promise<CloseExerciceResult> {
  return live.closeExercice(farmId, exerciceId);
}

export function createRegularisation(
  farmId: string,
  input: CreateRegularisationInput,
): Promise<JournalData['entries'][number]> {
  return live.createRegularisation(farmId, input);
}

export function fetchDashboard(farmId: string, date?: string, time?: string): Promise<DashboardData> {
  return live.fetchDashboard(farmId, date, time);
}

export function fetchBatches(farmId: string, asOf?: string): Promise<BatchWithMetrics[]> {
  return live.fetchBatches(farmId, asOf);
}

export function fetchBatch(farmId: string, batchId: string, asOf?: string): Promise<BatchWithMetrics> {
  return live.fetchBatch(farmId, batchId, asOf);
}

export function fetchCurve(farmId: string, batchId: string): Promise<BatchCurve> {
  return live.fetchCurve(farmId, batchId);
}

export function fetchAdvisory(farmId: string): Promise<AdvisoryData> {
  return live.fetchAdvisory(farmId);
}

export function fetchAlertHistory(farmId: string): Promise<Alert[]> {
  return live.fetchAlertHistory(farmId);
}

export function fetchFeedStock(farmId: string): Promise<FeedStockSummary> {
  return live.fetchFeedStock(farmId);
}

export function fetchFeedProducts(farmId: string): Promise<FeedProduct[]> {
  return live.fetchFeedProducts(farmId);
}

export function fetchFeedMovements(farmId: string): Promise<FeedMovement[]> {
  return live.fetchFeedMovements(farmId);
}

export function fetchCaisseCurrent(farmId: string): Promise<CaisseSummary | null> {
  return live.fetchCaisseCurrent(farmId);
}

export function fetchCaisseSessions(farmId: string): Promise<CashSession[]> {
  return live.fetchCaisseSessions(farmId);
}

export function fetchProtocols(
  species?: string,
  type?: string,
): Promise<SanitaryProtocol[]> {
  return live.fetchProtocols(species, type);
}

export function fetchSanitaryProgram(
  id: string,
): Promise<SanitaryProtocolWithSteps> {
  return live.fetchSanitaryProgram(id);
}

export function fetchFarmInputs(farmId: string): Promise<InputLot[]> {
  return live.fetchFarmInputs(farmId);
}

export function fetchProphylaxis(farmId: string, batchId: string): Promise<ProphylaxisEvent[]> {
  return live.fetchProphylaxis(farmId, batchId);
}

export function fetchTreatments(farmId: string, batchId: string): Promise<TreatmentRecord[]> {
  return live.fetchTreatments(farmId, batchId);
}

export function fetchBatchHealth(farmId: string, batchId: string, asOf?: string): Promise<BatchHealth> {
  return live.fetchBatchHealth(farmId, batchId, asOf);
}

export function fetchHealthEvents(farmId: string, batchId: string): Promise<HealthEvent[]> {
  return live.fetchHealthEvents(farmId, batchId);
}

export function fetchSlaughterOrders(farmId: string): Promise<SlaughterOrder[]> {
  return live.fetchSlaughterOrders(farmId);
}

export function fetchCustomers(farmId: string, filters?: { search?: string; type?: string }): Promise<Customer[]> {
  return live.fetchCustomers(farmId, filters);
}

export function fetchCustomersSummary(farmId: string): Promise<CustomerSummary> {
  return live.fetchCustomersSummary(farmId);
}

export function updateCustomer(
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
  return live.updateCustomer(farmId, customerId, input);
}

export function recordCustomerPayment(
  farmId: string,
  customerId: string,
  input: { amountFcfa: number; idempotencyKey?: string },
) {
  return live.recordCustomerPayment(farmId, customerId, input);
}

export function fetchCustomer(farmId: string, customerId: string): Promise<Customer> {
  return live.fetchCustomer(farmId, customerId);
}

export function fetchCustomerStats(farmId: string, customerId: string): Promise<CustomerStats> {
  return live.fetchCustomerStats(farmId, customerId);
}

export function fetchCustomerHistory(farmId: string, customerId: string): Promise<SaleFull[]> {
  return live.fetchCustomerHistory(farmId, customerId);
}

export function fetchPromotions(farmId: string): Promise<Promotion[]> {
  return live.fetchPromotions(farmId);
}

export function fetchPointsOfSale(farmId: string): Promise<PointOfSale[]> {
  return live.fetchPointsOfSale(farmId);
}

export function fetchPointOfSale(farmId: string, pointOfSaleId: string): Promise<PointOfSale> {
  return live.fetchPointOfSale(farmId, pointOfSaleId);
}

export function fetchStockTransfers(
  farmId: string,
  pointOfSaleId?: string,
  productType?: StockTransferProductType,
): Promise<StockTransfer[]> {
  return live.fetchStockTransfers(farmId, pointOfSaleId, productType);
}

export function fetchRentabiliteOverview(farmId: string, from?: string, to?: string): Promise<OverviewPnl> {
  return live.fetchRentabiliteOverview(farmId, from, to);
}

export function fetchRentabiliteBatch(farmId: string, batchId: string): Promise<BatchPnl> {
  return live.fetchRentabiliteBatch(farmId, batchId);
}

export function fetchSales(farmId: string, from?: string, to?: string): Promise<SaleSummary[]> {
  return live.fetchSales(farmId, from, to);
}

export function fetchExpenses(farmId: string, from?: string, to?: string): Promise<Expense[]> {
  return live.fetchExpenses(farmId, from, to);
}

export function fetchOrders(
  farmId: string,
  canal?: OrderCanal,
  status?: OrderStatus,
): Promise<OrderFull[]> {
  return live.fetchOrders(farmId, canal, status);
}

export function fetchOrder(farmId: string, orderId: string): Promise<OrderFull> {
  return live.fetchOrder(farmId, orderId);
}

export function fetchPondage(farmId: string, batchId: string): Promise<PondageSummary> {
  return live.fetchPondage(farmId, batchId);
}

export function fetchFarmMembers(farmId: string): Promise<FarmMember[]> {
  return live.fetchFarmMembers(farmId);
}

export function fetchFarmProfile(farmId: string): Promise<FarmMemberProfile> {
  return live.fetchFarmProfile(farmId);
}

export function fetchPermissionCatalog(farmId: string): Promise<PermissionCatalog> {
  return live.fetchPermissionCatalog(farmId);
}

export function fetchDailyEntries(farmId: string, batchId: string): Promise<DailyEntryRecord[]> {
  return live.fetchDailyEntries(farmId, batchId);
}

export function fetchTasks(farmId: string): Promise<FarmTask[]> {
  return live.fetchTasks(farmId);
}

export function fetchAssignableTeam(farmId: string): Promise<AssignableTeamMember[]> {
  return live.fetchAssignableTeam(farmId);
}

export function fetchReferenceConstants(): Promise<ReferenceConstant[]> {
  return live.fetchReferenceConstants();
}

export function fetchBuildings(farmId: string): Promise<Building[]> {
  return live.fetchBuildings(farmId);
}

export function fetchBreeds(): Promise<Breed[]> {
  return live.fetchBreeds();
}

export function fetchBreedStandards(breedId: string): Promise<BreedStandard[]> {
  return live.fetchBreedStandards(breedId);
}

export function fetchCultures(): Promise<Culture[]> {
  return live.fetchCultures();
}

export function createCulture(
  input: {
    name: string;
    category: CropCategory;
    defaultCycleDays?: number;
    waterNeedsLPlantDay?: number;
    notes?: string;
  },
): Promise<Culture> {
  return live.createCulture(input);
}

export function fetchParcelles(farmId: string): Promise<Parcelle[]> {
  return live.fetchParcelles(farmId);
}

export function fetchParcelle(farmId: string, parcelleId: string): Promise<Parcelle> {
  return live.fetchParcelle(farmId, parcelleId);
}

export function createParcelle(
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
  return live.createParcelle(farmId, input);
}

export function updateParcelle(
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
  return live.updateParcelle(farmId, parcelleId, input);
}

export function deleteParcelle(
  farmId: string,
  parcelleId: string,
): Promise<{ deleted: boolean }> {
  return live.deleteParcelle(farmId, parcelleId);
}