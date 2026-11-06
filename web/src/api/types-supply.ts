// POUFA L4 « Intrants »: programme input deliveries and the farm's declarative
// stock. Shapes of `backend/src/modules/supply` (input-deliveries.service.ts,
// declarative-stock.service.ts, supply-rules.ts).

export type DeliveryStatus = 'EXPEDIEE' | 'CONFIRMEE' | 'ANNULEE';
export type DeliverySource = 'ETAT_SMAG' | 'AUTRE';

/** INTRANT list families (`ref-list-families.ts`). */
export type IntrantFamily = 'POUSSIN' | 'ALIMENT' | 'VACCIN' | 'MEDICAMENT' | 'AUTRE';

/** Backend `FeedPhase`. */
export type FeedPhaseCode =
  | 'POUSSIN'
  | 'DEMARRAGE'
  | 'CROISSANCE'
  | 'PRE_PONTE'
  | 'PONTE_PHASE_1'
  | 'PONTE_PHASE_2'
  | 'PONTE_PHASE_3'
  | 'FINITION'
  | 'PERSONNALISE';

/** A list item with its `meta` (`GET /programme/lists/INTRANT|UNITE` returns the entity). */
export interface ListItemWithMeta {
  id: string;
  code: string;
  label: string;
  family: string | null;
  sort: number;
  active: boolean;
  meta?: Record<string, unknown> | null;
}

export interface DeliveryLineView {
  id: string;
  position: number;
  intrantCode: string;
  intrantLabel: string | null;
  intrantFamily: string;
  unitCode: string;
  unitLabel: string | null;
  quantity: number;
  feedPhase: FeedPhaseCode | null;
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
  status: DeliveryStatus;
  source: DeliverySource;
  supplierName: string | null;
  shippedAt: string;
  receivedDate: string | null;
  confirmedAt: string | null;
  confirmedById: string | null;
  hasDiscrepancy: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
  farm: { id: string; code: string | null; name: string; provinceCode: string | null; provinceName: string | null };
  band: { id: string; code: string | null; batchName: string | null } | null;
  lines: DeliveryLineView[];
  totals: {
    shippedValueFcfa: number;
    farmerCostFcfa: number | null;
    subsidyFcfa: number | null;
  };
}

/** `GET /programme/input-deliveries`. */
export interface DeliveryPage {
  total: number;
  page: number;
  pageSize: number;
  items: DeliveryView[];
}

/** Pre-filled band opening after a chick delivery (`openBandHint`). */
export interface OpenBandHint {
  message: string;
  deliveryId: string;
  quantityAtStart: number;
  integrationDate: string;
  couvoirSupplier: string;
  chickLotNumber: string;
  chickCostBooked: boolean;
}

/** `POST /farms/:farmId/input-deliveries/:id/confirm`. */
export interface ConfirmResult extends DeliveryView {
  replay: boolean;
  openBandHint: OpenBandHint | null;
}

/** `GET /farms/:farmId/declarative-stock` row. */
export interface DeclarativeStockRow {
  key: string;
  intrantCode: string;
  intrantFamily: string;
  intrantLabel: string | null;
  /** `KG` (ALIMENT), `TETE` (POUSSIN) or the line's UNITE code. */
  unitCode: string;
  unitLabel: string | null;
  feedPhases: FeedPhaseCode[];
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
