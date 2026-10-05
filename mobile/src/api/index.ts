import { LiveApi } from './live';
import type {
  AdvisoryData,
  BatchCurve,
  BatchHealth,
  BatchPnl,
  BatchWithMetrics,
  CaisseSummary,
  CashSession,
  Customer,
  CustomerStats,
  DashboardData,
  Expense,
  FarmMember,
  FarmTask,
  DailyEntryRecord,
  FeedMovement,
  FeedProduct,
  FeedStockSummary,
  HealthEvent,
  InputLot,
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
} from './types';

const live = new LiveApi();

/**
 * L'application est désormais 100 % connectée (plus de démo en local) :
 * chaque appel part vers le serveur. Conservée pour compatibilité API.
 */
export function isLive(): boolean {
  return true;
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

export function fetchCustomers(farmId: string): Promise<Customer[]> {
  return live.fetchCustomers(farmId);
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

export function fetchDailyEntries(farmId: string, batchId: string): Promise<DailyEntryRecord[]> {
  return live.fetchDailyEntries(farmId, batchId);
}

export function fetchTasks(farmId: string): Promise<FarmTask[]> {
  return live.fetchTasks(farmId);
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