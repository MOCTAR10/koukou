import { ArrowUpRight, Home, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { MarketListing } from '../../api/types-market';
import { dateFr, fcfa } from '../../lib/format';
import { Skeleton } from '../ui';
import { unitName } from './rules';
import { AvailabilityBadge, FarmAvatar, ListingStage, listingTitle, TraceBadge } from './shared';

const FRAME = 'flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card';

/** One listing of the catalogue: photo stage, farm, then the price as the strongest line. */
export function ListingCard({ listing }: { listing: MarketListing }) {
  const stock = `${listing.availableQuantity.toLocaleString('fr-FR')} ${unitName(listing.product, listing.availableQuantity)}`;
  return (
    <Link
      to={`/marche/${listing.id}`}
      className={`group ${FRAME} transition duration-300 ease-out hover:border-brand-200 hover:shadow-raised motion-safe:hover:-translate-y-1`}
    >
      <div className="relative">
        {/* Square like the photos themselves: the photo fills the stage edge to edge. */}
        <ListingStage listing={listing} className="aspect-square" />
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-1.5">
          <AvailabilityBadge kind={listing.kind} />
          {listing.traceLot ? <TraceBadge /> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900">{listingTitle(listing)}</h2>
          <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <FarmAvatar farm={listing.farm} />
            <span className="truncate">
              <span className="font-medium text-slate-700">{listing.farm.name}</span>
              {listing.farm.city ? ` · ${listing.farm.city}` : ''}
            </span>
          </p>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {listing.pickupAvailable ? (
            <span className="inline-flex items-center gap-1">
              <Home className="h-3.5 w-3.5" /> Retrait
            </span>
          ) : null}
          {listing.deliveryAvailable ? (
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" /> Livraison
            </span>
          ) : null}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight tracking-tight tabular-nums text-brand-800">
              {fcfa(listing.unitPriceFcfa)} <span className="text-xs font-medium tracking-normal text-slate-500">/ {unitName(listing.product)}</span>
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {listing.kind === 'PRE' && listing.readyDate ? `${stock} · prêts le ${dateFr(listing.readyDate)}` : `${stock} disponibles`}
            </p>
          </div>
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition-colors duration-300 group-hover:bg-brand-600 group-hover:text-white"
          >
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** The shape of a card while the catalogue loads. */
export function ListingCardSkeleton() {
  return (
    <div aria-hidden className={FRAME}>
      <Skeleton className="aspect-square rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="border-t border-slate-100 pt-3">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="mt-2 h-3 w-3/5" />
        </div>
      </div>
    </div>
  );
}
