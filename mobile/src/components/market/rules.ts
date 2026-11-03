import type { MarketFulfilment, MarketProduct } from '@/api/market';

export const SPECIES_NAME: Record<string, string> = {
  POULET: 'Poulet',
  PINTADE: 'Pintade',
  DINDE: 'Dinde',
  CAILLE: 'Caille',
  CANARD: 'Canard',
  OIE: 'Oie',
  FAISAN: 'Faisan',
  AUTRE: 'Autre',
};

export const PRODUCT_NAME: Record<MarketProduct, string> = {
  BIRDS: 'Volaille',
  EGGS: 'Œufs',
  CARCASS: 'Carcasses',
};

/** Same rule as the server's depositRequired: the delivery fee isn't part of the deposit. */
export function depositFor(quantity: number, unitPriceFcfa: number, depositPct: number | null): number {
  if (!depositPct) return 0;
  return Math.ceil((quantity * unitPriceFcfa * depositPct) / 100);
}

export function orderTotal(
  quantity: number,
  unitPriceFcfa: number,
  fulfilment: MarketFulfilment,
  deliveryFeeFcfa: number,
): number {
  return quantity * unitPriceFcfa + (fulfilment === 'DELIVERY' ? deliveryFeeFcfa : 0);
}

export function unitName(product: MarketProduct, quantity = 1): string {
  const plural = quantity > 1 ? 's' : '';
  if (product === 'EGGS') return `alvéole${plural}`;
  if (product === 'CARCASS') return `carcasse${plural}`;
  return quantity > 1 ? 'oiseaux' : 'oiseau';
}

/** Time left before a deadline, in the largest units that matter. Null once it has passed. */
export function timeLeft(deadlineIso: string, now: number): string | null {
  const ms = new Date(deadlineIso).getTime() - now;
  if (ms <= 0) return null;
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)} jours`;
}

export function listingTitle(l: {
  product: MarketProduct;
  species: string | null;
  breedName: string | null;
  customSpecies?: string | null;
}): string {
  const species = l.customSpecies?.trim() || (l.species ? (SPECIES_NAME[l.species] ?? l.species) : null);
  const name = [species, l.breedName].filter(Boolean).join(' · ');
  if (l.product === 'EGGS') return name ? `Œufs · ${name}` : 'Œufs';
  if (l.product === 'CARCASS') return name ? `Carcasses · ${name}` : 'Carcasses';
  return name || 'Volaille';
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** A calendar day stays that day whatever the time zone: read from the text, not through Date. */
export function dayLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ''} ${year}`;
}

export function dateTimeLabel(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Leaves whole numbers only: what a price or quantity field may hold. */
export function wholeNumber(text: string): number {
  return Number.parseInt(text, 10) || 0;
}
