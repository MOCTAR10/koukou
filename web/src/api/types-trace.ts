// POUFA L7 « Traçabilité » and L3 band sorties. Shapes of
// `backend/src/modules/trace` (trace-history.service.ts, operators.service.ts,
// public-lot-view.ts) and `backend/src/modules/bandes` (sorties.service.ts).

export type TraceLotKind = 'LOT' | 'SOUS_LOT' | 'DERIVE';
export type TraceLotStatus = 'OUVERT' | 'CEDE' | 'RECU' | 'CLOS';

export interface OperatorView {
  id: string;
  /** `OP-0001`: never changes. */
  code: string;
  /** TYPE_OPERATEUR item code. */
  typeCode: string;
  typeLabel: string | null;
  typeFamily: string | null;
  name: string;
  localite: { id: string; code: string; name: string; provinceCode: string; provinceName: string } | null;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  conventionRef: string | null;
  conventionSignedAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LotOperatorRef {
  id: string;
  code: string;
  name: string;
  typeCode: string;
  typeLabel: string | null;
}

export interface LotView {
  id: string;
  code: string;
  kind: TraceLotKind;
  status: TraceLotStatus;
  farmId: string;
  batchId: string;
  bandeCode: string | null;
  parentId: string | null;
  quantity: number;
  weightKg: number | null;
  operator: LotOperatorRef | null;
  sortieId: string | null;
  cededOn: string | null;
  closedAt: string | null;
  createdAt: string;
  /** Address printed in the QR code. */
  qrUrl: string;
}

export interface LotEventView {
  id: string;
  lotId: string;
  lotCode: string;
  type: string;
  occurredAt: string;
  actor: { id: string; fullName: string | null } | null;
  operator: { id: string; code: string; name: string } | null;
  sortieId: string | null;
  data: Record<string, unknown>;
}

export type RearingKind =
  | 'OUVERTURE'
  | 'SOIN'
  | 'TRAITEMENT'
  | 'MORTALITE'
  | 'PESEE'
  | 'EVENEMENT_SANITAIRE'
  | 'SORTIE'
  | 'CLOTURE'
  // POUFA T2: the inputs a band received (confirmed delivery) and the feed it ate (input lot, kg).
  | 'INTRANT'
  | 'ALIMENT'
  // Technical visit or biosecurity control of an agent (CDC n° 27, n° 45).
  | 'VISITE';

export interface RearingItem {
  date: string;
  kind: RearingKind;
  label: string;
  quantity: number | null;
  details: Record<string, unknown>;
}

export interface ScanIndicators {
  scans: number;
  ok: number;
  badSignature: number;
  afterClosure: number;
  distinctDevices: number;
  distinctAreas: number;
  firstAt: string | null;
  lastAt: string | null;
}

export interface LotHistory {
  lot: LotView;
  root: LotView | null;
  subLots: LotView[];
  farm: { id: string; code: string | null; name: string };
  band: {
    id: string;
    code: string | null;
    batchName: string | null;
    status: string;
    integrationDate: string;
    initialAgeDays: number | null;
    quantityAtStart: number;
    quantityAlive: number;
    closedAt: string | null;
  };
  events: LotEventView[];
  rearing: RearingItem[];
  scans: ScanIndicators;
}

/** `GET /public/lots/:code?s=` (whitelisted `toPublicLotView`). */
export interface PublicLotView {
  code: string;
  kind: TraceLotKind;
  status: TraceLotStatus;
  quantity: number;
  cededOn: string | null;
  product: { species: string; speciesLabel: string; type: string; typeLabel: string };
  producer: { farmName: string; localite: string | null; province: string | null };
  band: { code: string | null; openedOn: string; closedOn: string | null };
  operatorType: string | null;
  consommonsGabonais: { label: string; url: string };
  notice: string;
}

/** `GET/POST /farms/:farmId/bandes/:batchId/sorties`. */
export interface SortieView {
  id: string;
  farmId: string;
  batchId: string;
  sortieDate: string;
  count: number;
  weightKg: number | null;
  reasonCode: string;
  reasonFamily: string;
  reasonLabel: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  operatorId: string | null;
  unitPriceFcfa: number | null;
  priceUnit: 'TETE' | 'KG' | null;
  saleId: string | null;
  slaughterOrderId: string | null;
  saleStatus: string | null;
  slaughterStatus: string | null;
  notes: string | null;
  createdAt: string;
}
