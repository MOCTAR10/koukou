import type { AlertLevel, AlertStatus, BatchWithMetrics, CashSession, Customer, DashboardData, Promotion, Sale, SaleItem, SlaughterOrder } from './types';

export type PointOfSaleKind = 'FERME' | 'BOUTIQUE';

export interface PointOfSale {
  id: string;
  farmId: string;
  kind: PointOfSaleKind;
  name: string;
  isActive: boolean;
  isDefault: boolean;
}

export interface SaleItemFull extends SaleItem {
  label: string | null;
  amountFcfa: number;
  pieceCount: number | null;
  sourceSlaughterOrderId: string | null;
  stockTransferId: string | null;
  parcelleId: string | null;
}

export interface SaleFull extends Omit<Sale, 'items'> {
  items: SaleItemFull[];
  customerId: string | null;
  customer: Pick<Customer, 'id' | 'fullName' | 'phone' | 'code' | 'type'> | null;
  pointOfSaleId: string | null;
  cancelledReason: string | null;
  createdAt: string;
}

export interface SaleCreated {
  sale: { id: string; referenceNumber: string; status: string; totalAmountFcfa: number };
  warnings: string[];
}

export interface PosBatchMetrics {
  ageDays: number;
  liveCount: number;
  readyForSale?: boolean;
  readyReason?: 'READY' | 'TOO_YOUNG' | 'FCR' | 'SANITARY' | 'N_A';
  eggStockAvailableEggs?: number;
  eggStockAvailableAlveoles?: number;
  fcr: number | null;
  gmqGramsPerDay: number | null;
  ipe: number | null;
  layRatePercent: number | null;
  densityPerM2?: number | null;
  totalFeedKg?: number;
  eggBreakdown?: {
    collected: number;
    sellable: number;
    cracked: number;
    small: number;
    doubleYolk: number;
    dirty: number;
  };
}

export type PosBatch = Omit<BatchWithMetrics, 'metrics'> & { metrics: PosBatchMetrics };

export interface CarcassPool extends SlaughterOrder {
  carcassesAvailable: number | null;
  totalWeightKg: number | null;
  rendementPercent: number | null;
  batch?: { batchName: string | null } | null;
}

export interface StockTransfer {
  id: string;
  productType: 'ABATTU' | 'OEUFS' | 'PROVENDE';
  pointOfSaleId: string;
  slaughterOrderId: string | null;
  batchId: string | null;
  inputLotId: string | null;
  unit: string | null;
  quantity: number;
  quantitySold: number;
  status: 'TRANSFERRED' | 'CANCELLED';
  createdAt: string;
  slaughterOrder: { batchId: string; batch?: { batchName: string | null } | null } | null;
  batch: { batchName: string | null } | null;
  inputLot: { productName: string; unitPriceFcfa: number | null } | null;
  pointOfSale: { name: string } | null;
}

export interface ParcelleStock {
  parcelleId: string;
  parcelleName: string;
  cultureName: string | null;
  unit: 'KG' | 'PIECE' | 'SAC';
  harvested: number;
  sold: number;
  available: number;
}

export interface PromotionFull extends Promotion {
  label: string;
}

export interface CashMovement {
  id: string;
  cashSessionId: string | null;
  type: 'IN' | 'OUT';
  source: 'SALE_PAYMENT' | 'MANUAL' | 'REFUND' | 'EXPENSE';
  amountFcfa: number;
  reason: string | null;
  saleId: string | null;
  movementDate: string;
}

export interface CaisseSummary {
  session: CashSession;
  movements: CashMovement[];
  expectedBalanceFcfa: number;
  inFcfa: number;
  outFcfa: number;
}

export type CustomerSegment = 'NOUVEAU' | 'REGULIER' | 'TOP';

export interface CustomerFull extends Customer {
  city: string | null;
}

export interface CustomerSummary {
  total: number;
  debtors: number;
  totalInvoicedFcfa: number;
  paidFcfa: number;
  totalOutstandingFcfa: number;
  byType: Record<string, { count: number; outstandingFcfa: number } | undefined>;
  bySegment: Record<CustomerSegment, number>;
}

export interface CustomerStats {
  visits: number;
  totalSpentFcfa: number;
  avgBasketFcfa: number;
  lastPurchaseDate: string | null;
  favorites: Array<{ productType: string; label: string | null; quantity: number }>;
}

export type NextActionCategory = 'ALERTE' | 'SAISIE' | 'SOIN' | 'STOCK_PROVENDE' | 'VENTE';

export interface NextAction {
  id: string;
  category: NextActionCategory;
  level: AlertLevel;
  title: string;
  description: string | null;
  dueDate: string | null;
  batchId: string | null;
  batchName: string | null;
  acknowledged: boolean;
  alertId: string | null;
  kind?: string | null;
  status: AlertStatus;
  /** POUFA lot A2 sante: the planned care behind a SOIN action. */
  care?: CareActionInfo;
}

/** What the « Fait » form of a SOIN action needs (backend `CareActionInfo`). */
export interface CareActionInfo {
  eventId: string;
  careType: string;
  name: string;
  route: string | null;
  withdrawalDays: number;
  protocolStepId: string | null;
  productCode: string | null;
  isReference: boolean;
  scheduledDate: string;
  originalDate: string | null;
  liveCount: number;
}

export interface AdvisoryNextActions {
  farmId: string;
  generatedAt: string;
  summary: { total: number; rouge: number; jaune: number; vert: number };
  actions: NextAction[];
}

/** What GET /dashboard really returns for the weather (see the backend's FarmWeather). */
export interface WeatherDay {
  date: string;
  tempC: number;
  humidityPct: number;
  thi: number;
  zone: string;
  level: AlertLevel | null;
}

export interface FarmWeather {
  available: boolean;
  reason?: string;
  source: string;
  today: WeatherDay | null;
  forecast: WeatherDay[];
}

export interface BreedStatus {
  breedName: string;
  breedCode: string | null;
  week: number;
  fcrDeviationPct: number | null;
  layRateDeviationPct: number | null;
}

export interface OwnerDashboard extends Omit<DashboardData, 'weather' | 'healthOverview' | 'eggStock'> {
  weather: FarmWeather | null;
  healthOverview: Array<Omit<DashboardData['healthOverview'][number], 'breedStatus'> & { breedStatus: BreedStatus | null }>;
  eggStock: DashboardData['eggStock'] & { collected?: number; soldAlveoles?: number };
  waterConsumptionTodayL: number | null;
  waterDropPercent: number | null;
  buildingsCount: number;
  totalAreaM2: number | null;
  farmDensityPerM2: number | null;
}

export interface OverviewPnl {
  period: { from: string; to: string };
  sales: { count: number; totalFcfa: number };
  collectedFcfa: number;
  outstandingFcfa: number;
  expenses: { count: number; totalFcfa: number };
  netFcfa: number;
}
