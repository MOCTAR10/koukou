import type { QueryClient } from '@tanstack/react-query';
import { CalendarClock, QrCode, Store, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { MarketBuyerStatus, MarketFarm, MarketHiddenReason, MarketListing, MarketProduct } from '../../api/types-market';
import { EGG_IMAGES, lotImage } from '../../lib/animalImages';
import { classNames } from '../../lib/format';
import { farmLogoSrc } from '../org/shared';
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

/**
 * The frame every listing photo sits in. The photos are studio shots on a plain
 * background (white or grey), shown whole: a blurred copy fills the rest of the
 * stage, so the photo has no visible edge whatever its background.
 * Inside a `group`, the photo grows a little on hover.
 */
export function ListingStage({ listing, className, eager = false }: { listing: Named; className?: string; eager?: boolean }) {
  const photo = listingPhoto(listing);
  return (
    <div className={classNames('relative flex items-center justify-center overflow-hidden bg-slate-100', className)}>
      {photo ? (
        <>
          <img src={photo} alt="" aria-hidden loading={eager ? 'eager' : 'lazy'} className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl" />
          <img
            src={photo}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            className="relative h-full w-full object-contain transition-transform duration-500 ease-out motion-safe:group-hover:scale-105"
          />
          {/* A faint floor shade gives the stage some depth. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-brand-950/[0.07]" />
        </>
      ) : (
        <Store className="h-10 w-10 text-slate-300" />
      )}
    </div>
  );
}

const OVERLAY_BADGE =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold shadow-sm ring-1 ring-slate-900/5 backdrop-blur';

/** Available now (green dot) or pre-order: sits on the photo stage. */
export function AvailabilityBadge({ kind }: { kind: MarketListing['kind'] }) {
  return kind === 'PRE' ? (
    <span className={classNames(OVERLAY_BADGE, 'text-brand-700')}>
      <CalendarClock className="h-3.5 w-3.5" /> Précommande
    </span>
  ) : (
    <span className={classNames(OVERLAY_BADGE, 'text-emerald-700')}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Disponible
    </span>
  );
}

export function TraceBadge() {
  return (
    <span className={classNames(OVERLAY_BADGE, 'text-slate-700')}>
      <QrCode className="h-3.5 w-3.5 text-brand-600" /> Lot tracé
    </span>
  );
}

/** The farm's logo, or its initial on a brand tint. */
export function FarmAvatar({ farm, className = 'h-6 w-6 text-[11px]' }: { farm: MarketFarm; className?: string }) {
  const logo = farmLogoSrc(farm);
  return logo ? (
    <img src={logo} alt="" loading="lazy" className={classNames('shrink-0 rounded-full bg-white object-cover ring-1 ring-slate-200', className)} />
  ) : (
    <span aria-hidden className={classNames('flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold uppercase text-brand-700', className)}>
      {farm.name.trim().charAt(0) || 'F'}
    </span>
  );
}

/** The white panel of the Market pages. */
export const MARKET_PANEL = 'rounded-3xl border border-slate-200 bg-white shadow-card';

/** One fact of a listing or an order: icon, small label, value. */
export function FactTile({ icon: Icon, label, value, muted = false }: { icon: LucideIcon; label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-card">
      <span className={classNames('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', muted ? 'bg-slate-100 text-slate-400' : 'bg-brand-50 text-brand-600')}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-slate-500">{label}</span>
        <span className={classNames('line-clamp-2 text-sm font-semibold leading-snug tabular-nums', muted ? 'text-slate-500' : 'text-slate-900')}>{value}</span>
      </span>
    </div>
  );
}

/** Title block of a buyer page, in the Market's own type scale. */
export function MarketTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: ReactNode }) {
  return (
    <header className="mb-6">
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p> : null}
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
      {subtitle ? <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p> : null}
    </header>
  );
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
  FARM_NOT_OPERATIONAL: 'Masquée : la ferme n’est pas encore opérationnelle dans le programme',
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
