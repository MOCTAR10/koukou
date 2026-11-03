export type MarketKind = 'NOW' | 'PRE';
export type MarketProduct = 'BIRDS' | 'EGGS' | 'CARCASS';
export type MarketFulfilment = 'PICKUP' | 'DELIVERY';
export type MarketListingStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'CLOSED';
export type MarketHiddenReason =
  | 'NOT_PUBLISHED'
  | 'FARM_SUSPENDED'
  | 'FARM_NOT_VERIFIED'
  | 'LOT_ENDED'
  | 'SANITARY'
  | 'DATE_PASSED'
  | 'OUT_OF_STOCK';

export type MarketBuyerStatus =
  | 'PENDING'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'REQUEST_EXPIRED'
  | 'AWAITING_DEPOSIT'
  | 'CONFIRMED'
  | 'CANCEL_REQUESTED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'DEPOSIT_EXPIRED';

export type MarketOrderState = 'REQUESTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED' | 'ACCEPTED';

export interface MarketFarm {
  id: string;
  name: string;
  city: string | null;
  logoUrl: string | null;
}

interface MarketListingBase {
  id: string;
  kind: MarketKind;
  product: MarketProduct;
  description: string | null;
  unitPriceFcfa: number;
  availableQuantity: number;
  minOrderQty: number;
  readyDate: string | null;
  previousReadyDate: string | null;
  depositPct: number | null;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  deliveryFeeFcfa: number;
  species: string | null;
  customSpecies: string | null;
  breedName: string | null;
  batchType: string | null;
  slaughteredAt: string | null;
}

export interface MarketListing extends MarketListingBase {
  publishedAt: string | null;
  farm: MarketFarm;
}

export interface MarketCataloguePage {
  items: MarketListing[];
  hasMore: boolean;
}

export interface FarmMarketListing extends MarketListingBase {
  status: MarketListingStatus;
  quantityPublished: number;
  batchId: string;
  batchName: string | null;
  slaughterOrderId: string | null;
  hiddenReason: MarketHiddenReason | null;
}

/** Kind, product and source are fixed at creation: an update leaves them out. */
export interface MarketListingBody {
  kind?: MarketKind;
  product?: MarketProduct;
  batchId?: string;
  slaughterOrderId?: string;
  description?: string;
  unitPriceFcfa: number;
  quantityPublished: number;
  minOrderQty?: number;
  readyDate?: string;
  depositPct?: number | null;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  deliveryFeeFcfa: number;
}

export interface MarketOrderBody {
  listingId: string;
  quantity: number;
  fulfilment: MarketFulfilment;
  address?: string;
  contactPhone?: string;
  note?: string;
  desiredDate?: string;
  idempotencyKey: string;
}

export interface MarketOrderEvent {
  type: string;
  at: string;
}

export interface BuyerMarketOrder {
  id: string;
  status: MarketBuyerStatus;
  kind: MarketKind;
  product: MarketProduct;
  species: string | null;
  breedName: string | null;
  readyDate: string | null;
  previousReadyDate: string | null;
  desiredDate: string | null;
  quantity: number;
  unitPriceFcfa: number;
  deliveryFeeFcfa: number;
  totalFcfa: number;
  depositRequiredFcfa: number;
  depositPaidFcfa: number;
  depositDueAt: string | null;
  cancelRequestedAt: string | null;
  fulfilment: MarketFulfilment;
  address: string | null;
  contactPhone: string | null;
  note: string | null;
  rejectReason: string | null;
  requestExpiresAt: string | null;
  createdAt: string;
  orderReference: string | null;
  farm: MarketFarm & { phone?: string | null };
  timeline: MarketOrderEvent[];
}

export interface FarmMarketOrder {
  id: string;
  state: MarketOrderState;
  status: MarketBuyerStatus;
  listingId: string;
  kind: MarketKind;
  product: MarketProduct;
  batchId: string;
  batchName: string | null;
  readyDate: string | null;
  desiredDate: string | null;
  quantity: number;
  unitPriceFcfa: number;
  deliveryFeeFcfa: number;
  totalFcfa: number;
  depositRequiredFcfa: number;
  depositPaidFcfa: number;
  depositShortFcfa: number;
  depositDueAt: string | null;
  depositExtendedAt: string | null;
  cancelRequestedAt: string | null;
  fulfilment: MarketFulfilment;
  address: string | null;
  contactPhone: string | null;
  note: string | null;
  requestExpiresAt: string | null;
  createdAt: string;
  acceptedAt: string | null;
  orderId: string | null;
  orderReference: string | null;
  oversold: boolean;
  buyer: {
    fullName: string;
    type: string | null;
    organizationName: string | null;
    city: string | null;
  };
}

export interface BuyerProfile {
  type: string;
  organizationName: string | null;
  city: string | null;
}
