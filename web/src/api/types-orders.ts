import type { BatchMetrics, BatchWithMetrics, Customer, ProductionBatch } from './types';

// ---------- Orders ----------

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'LIVRE' | 'CANCELLED';
export type OrderCanal = 'FERME' | 'PRECOMMANDE' | 'LIVRAISON';
export type OrderProductType = 'POULET_PIECE' | 'POULET_KG' | 'OEUFS';
export type OrderUnit = 'PIECE' | 'KG' | 'ALVEOLES';

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

export interface OrderPassport {
  batchId: string;
  batchLabel: string;
  speciesLabel: string;
  breedName: string | null;
  batchTypeLabel: string;
  integrationDate: string;
  ageDays: number;
  liveCount: number;
  statusLabel: string;
  readiness: {
    readyForSale: boolean;
    readyReason: string;
    label: string;
    note: string;
  };
  metrics: { label: string; value: string }[];
  vaccinations: {
    completed: number;
    planned: number;
    last: { name: string; date: string | null } | null;
  };
  withdrawals: {
    careTypeLabel: string;
    productName: string;
    administeredAt: string;
    withdrawalEndDate: string;
  }[];
  sanitary: {
    level: string;
    conformity: 'CONFORME' | 'PRECONFORMITE' | 'EN_ATTENTE';
    conformityNote: string;
    alerts: { kind: string; level: string; message: string }[];
    events: { title: string; occurredAt: string; severity: string }[];
    vetVisited: boolean;
  };
  generatedAt: string;
}

export interface Order {
  id: string;
  farmId: string;
  referenceNumber: string;
  canal: OrderCanal;
  /** MARKET: created by accepting a buyer's request on the Market. */
  source?: string;
  saleId: string;
  status: OrderStatus;
  customerId: string | null;
  customer: Customer | null;
  expectedDate: string | null;
  address: string | null;
  deliveryProvince?: string | null;
  pointOfSaleId?: string | null;
  batchId: string | null;
  batch: ProductionBatch | null;
  totalAmountFcfa: number;
  depositFcfa: number;
  items: OrderItemSnapshot[];
  passport: OrderPassport | null;
  livredAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
}

export interface CreateOrderBody {
  canal: OrderCanal;
  idempotencyKey: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  expectedDate: string;
  pointOfSaleId?: string;
  address?: string;
  province?: string;
  latitude?: number;
  longitude?: number;
  items: {
    productType: OrderProductType;
    label: string;
    quantity: number;
    unitPriceFcfa: number;
    batchId?: string;
    pieceCount?: number;
    unit: OrderUnit;
  }[];
  deposit?: { amountFcfa: number };
}

/** Batch list row, with the sale-readiness and egg metrics these screens read. */
export interface SellableBatch extends BatchWithMetrics {
  breedName?: string | null;
  breedCode?: string | null;
  metrics: BatchMetrics & {
    readyForSale?: boolean;
    readyReason?: string;
    eggsCollectedTotal?: number;
    eggStockAvailableEggs?: number;
    eggStockAvailableAlveoles?: number;
  };
}

// ---------- Points of sale ----------

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
  createdAt: string;
}

export interface PointOfSaleBody {
  name: string;
  kind: PointOfSaleKind;
  isActive: boolean;
  address?: string;
  province?: string;
  latitude?: number;
  longitude?: number;
  idempotencyKey?: string;
}

export type StockTransferProductType = 'ABATTU' | 'OEUFS' | 'PROVENDE';

export interface CarcassPool {
  id: string;
  referenceNumber: string;
  slaughterType: string;
  status: string;
  carcassesAvailable: number | null;
  batch: (ProductionBatch & { breedName?: string | null }) | null;
}

export interface StockTransfer {
  id: string;
  productType: StockTransferProductType;
  pointOfSaleId: string;
  slaughterOrderId: string | null;
  batchId: string | null;
  inputLotId: string | null;
  unit: string | null;
  quantity: number;
  quantitySold: number;
  status: 'TRANSFERRED' | 'CANCELLED';
  createdAt: string;
  slaughterOrder: CarcassPool | null;
  batch: ProductionBatch | null;
  inputLot: { productName?: string | null; supplierLotNumber?: string | null } | null;
  pointOfSale: PointOfSale;
}

export interface StockTransferBody {
  productType: StockTransferProductType;
  pointOfSaleId: string;
  quantity: number;
  idempotencyKey: string;
  slaughterOrderId?: string;
  batchId?: string;
  inputLotId?: string;
  unit?: 'SAC' | 'KG';
}

/** Sale list row, as far as the per-point-of-sale statistics need it. */
export interface PosSale {
  id: string;
  saleDate: string;
  status: string;
  totalAmountFcfa: number;
  pointOfSaleId?: string | null;
  items: { productType: string; amountFcfa: number }[];
}
