import type { QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { MarketBuyerStatus, MarketHiddenReason, MarketListing, MarketProduct } from '../../api/types-market';
import { EGG_IMAGES, lotImage } from '../../lib/animalImages';
import { Pill } from '../orders/shared';

export const SPECIES_LABEL: Record<string, string> = {
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
  BIRDS: 'Volaille vivante',
  EGGS: 'Œufs',
  CARCASS: 'Carcasses',
};

/** The types a buyer can choose: the server's CustomerType, without the farm's own. */
export const BUYER_TYPES: { key: string; label: string }[] = [
  { key: 'PARTICULIER', label: 'Particulier' },
  { key: 'RESTAURANT', label: 'Restaurant' },
  { key: 'HOTEL', label: 'Hôtel' },
  { key: 'TRAITEUR', label: 'Traiteur' },
  { key: 'EVENEMENT', label: 'Événementiel' },
  { key: 'COMMERCE', label: 'Commerce' },
  { key: 'REVENDEUR', label: 'Revendeur' },
  { key: 'GROSSISTE', label: 'Grossiste' },
  { key: 'BOULANGERIE', label: 'Boulangerie' },
  { key: 'COLLECTIVITE', label: 'Collectivité' },
  { key: 'ENTREPRISE', label: 'Entreprise' },
];

export function buyerTypeLabel(type: string | null | undefined): string {
  return BUYER_TYPES.find((t) => t.key === type)?.label ?? 'Acheteur';
}

type Named = Pick<MarketListing, 'product' | 'species' | 'breedName'> & { customSpecies?: string | null };

export function listingTitle(l: Named): string {
  const species = l.customSpecies?.trim() || (l.species ? SPECIES_LABEL[l.species] ?? l.species : null);
  const name = [species, l.breedName].filter(Boolean).join(' · ');
  if (l.product === 'EGGS') return name ? `Œufs · ${name}` : 'Œufs';
  if (l.product === 'CARCASS') return name ? `Carcasses · ${name}` : 'Carcasses';
  return name || 'Volaille';
}

export function listingPhoto(l: Named): string | null {
  if (l.product === 'EGGS') return EGG_IMAGES.alveole;
  return lotImage(l.breedName, l.species);
}

const STATUS: Record<MarketBuyerStatus, { label: string; tone: string }> = {
  PENDING: { label: 'En attente de la ferme', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  REJECTED: { label: 'Refusée', tone: 'bg-red-50 text-red-700 ring-red-200' },
  WITHDRAWN: { label: 'Retirée', tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  REQUEST_EXPIRED: { label: 'Sans réponse', tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  AWAITING_DEPOSIT: { label: 'Acompte attendu', tone: 'bg-orange-50 text-orange-700 ring-orange-200' },
  CONFIRMED: { label: 'Confirmée', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  CANCEL_REQUESTED: { label: 'Annulation demandée', tone: 'bg-orange-50 text-orange-700 ring-orange-200' },
  DELIVERED: { label: 'Livrée', tone: 'bg-sky-50 text-sky-700 ring-sky-200' },
  CANCELLED: { label: 'Annulée', tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  DEPOSIT_EXPIRED: { label: 'Annulée : acompte non reçu', tone: 'bg-red-50 text-red-700 ring-red-200' },
};

export function MarketStatusBadge({ status }: { status: MarketBuyerStatus }) {
  const s = STATUS[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export const TIMELINE_LABEL: Record<string, string> = {
  REQUESTED: 'Demande envoyée',
  ACCEPTED: 'Acceptée par la ferme',
  REJECTED: 'Refusée par la ferme',
  WITHDRAWN: 'Demande retirée',
  REQUEST_EXPIRED: 'Pas de réponse de la ferme sous 48 h',
  DEPOSIT_EXTENDED: 'Délai d’acompte prolongé de 24 h',
  DATE_MOVED: 'Date de disponibilité modifiée par la ferme',
  CANCEL_REQUESTED: 'Annulation demandée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  DEPOSIT_EXPIRED: 'Annulée : acompte non reçu dans le délai',
};

export const HIDDEN_REASON: Record<MarketHiddenReason, string> = {
  NOT_PUBLISHED: 'Non publiée',
  FARM_SUSPENDED: 'Masquée : ferme suspendue',
  FARM_NOT_VERIFIED: 'Masquée : ferme non vérifiée',
  LOT_ENDED: 'Masquée : lot terminé',
  SANITARY: 'Masquée : délai d’attente ou soin en retard sur le lot',
  DATE_PASSED: 'Masquée : date de disponibilité dépassée',
  OUT_OF_STOCK: 'Masquée : plus de stock disponible',
};

/** Re-renders every 30 s, so a countdown stays right on a page left open. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** What a buyer's action changes: their orders, and the quantities in the catalogue. */
export function invalidateBuyerQueries(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['market-orders'] });
  void client.invalidateQueries({ queryKey: ['market-order'] });
  void client.invalidateQueries({ queryKey: ['market-listings'] });
  void client.invalidateQueries({ queryKey: ['market-listing'] });
}
