import { apiFetch } from './client';
import type { CustomerType, Species } from './types';

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
  | 'OUT_OF_STOCK'
  // POUFA lot A indic: the farm's programme status is not OPERATIONNELLE.
  | 'FARM_NOT_OPERATIONAL';

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

/** POUFA lot A indic: the band's public traceability page, no personal data. */
export interface ListingTraceLot {
  code: string;
  /** Relative path of the web page (`/l/<code>?t=…`). */
  path: string;
  /** Absolute URL, opened in the browser. */
  url: string;
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
  species: Species | null;
  customSpecies: string | null;
  breedName: string | null;
  batchType: string | null;
  slaughteredAt: string | null;
  traceLot?: ListingTraceLot | null;
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

export interface BuyerMarketOrder {
  id: string;
  status: MarketBuyerStatus;
  kind: MarketKind;
  product: MarketProduct;
  species: Species | null;
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
  timeline: { type: string; at: string }[];
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
    type: CustomerType | null;
    organizationName: string | null;
    city: string | null;
  };
}

export interface BuyerProfile {
  type: CustomerType;
  organizationName: string | null;
  city: string | null;
}

export interface CatalogueFilters {
  kind?: MarketKind;
  product?: MarketProduct;
  species?: Species;
  city?: string;
}

export const CATALOGUE_PAGE_SIZE = 20;

// ---------- Catalogue (public) ----------

export function fetchMarketListings(filters: CatalogueFilters, offset: number): Promise<MarketCataloguePage> {
  const params = [`limit=${CATALOGUE_PAGE_SIZE}`, `offset=${offset}`];
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.push(`${key}=${encodeURIComponent(value)}`);
  }
  return apiFetch(`/market/listings?${params.join('&')}`);
}

export function fetchMarketListing(id: string): Promise<MarketListing> {
  return apiFetch(`/market/listings/${id}`);
}

// ---------- Buyer ----------

export function createMarketOrder(body: MarketOrderBody): Promise<BuyerMarketOrder> {
  return apiFetch('/market/orders', { method: 'POST', body });
}

export function fetchBuyerOrders(): Promise<BuyerMarketOrder[]> {
  return apiFetch('/market/orders');
}

export function fetchBuyerOrder(id: string): Promise<BuyerMarketOrder> {
  return apiFetch(`/market/orders/${id}`);
}

export function withdrawBuyerOrder(id: string): Promise<BuyerMarketOrder> {
  return apiFetch(`/market/orders/${id}/withdraw`, { method: 'POST' });
}

export function cancelBuyerOrder(id: string): Promise<BuyerMarketOrder> {
  return apiFetch(`/market/orders/${id}/cancel`, { method: 'POST' });
}

export function fetchBuyerProfile(): Promise<BuyerProfile | null> {
  return apiFetch('/auth/buyer-profile');
}

export function saveBuyerProfile(body: { type: CustomerType; organizationName?: string; city?: string }): Promise<BuyerProfile> {
  return apiFetch('/auth/buyer-profile', { method: 'PUT', body });
}

// ---------- Farm ----------

export function fetchFarmListings(farmId: string): Promise<FarmMarketListing[]> {
  return apiFetch(`/farms/${farmId}/market/listings`);
}

export function createFarmListing(farmId: string, body: MarketListingBody): Promise<FarmMarketListing> {
  return apiFetch(`/farms/${farmId}/market/listings`, { method: 'POST', body });
}

export function updateFarmListing(farmId: string, id: string, body: MarketListingBody): Promise<FarmMarketListing> {
  return apiFetch(`/farms/${farmId}/market/listings/${id}`, { method: 'PATCH', body });
}

export function farmListingAction(farmId: string, id: string, verb: 'publish' | 'pause' | 'close'): Promise<FarmMarketListing> {
  return apiFetch(`/farms/${farmId}/market/listings/${id}/${verb}`, { method: 'POST' });
}

export function moveListingDate(farmId: string, id: string, readyDate: string): Promise<FarmMarketListing> {
  return apiFetch(`/farms/${farmId}/market/listings/${id}/move-date`, { method: 'POST', body: { readyDate } });
}

export function fetchReadyDateSuggestion(
  farmId: string,
  batchId: string,
  targetWeightKg?: number,
): Promise<{ suggestion: { readyDate: string; source: 'BREED_CURVE' | 'MIN_AGE' } | null }> {
  const weight = targetWeightKg ? `&targetWeightKg=${targetWeightKg}` : '';
  return apiFetch(`/farms/${farmId}/market/ready-date-suggestion?batchId=${batchId}${weight}`);
}

export function fetchFarmMarketOrders(farmId: string): Promise<FarmMarketOrder[]> {
  return apiFetch(`/farms/${farmId}/market/orders`);
}

export function acceptMarketOrder(farmId: string, id: string): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/market/orders/${id}/accept`, { method: 'POST' });
}

export function rejectMarketOrder(farmId: string, id: string, reason?: string): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/market/orders/${id}/reject`, { method: 'POST', body: reason ? { reason } : {} });
}

export function extendMarketDeposit(farmId: string, id: string): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/market/orders/${id}/extend-deposit`, { method: 'POST' });
}
