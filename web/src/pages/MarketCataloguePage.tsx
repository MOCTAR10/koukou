import { useInfiniteQuery } from '@tanstack/react-query';
import { CalendarClock, MapPin, Store, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { MarketCataloguePage, MarketKind, MarketListing, MarketProduct } from '../api/types-market';
import { Button, ErrorNote, inputCls } from '../components/form';
import { listingPhoto, listingTitle, PRODUCT_NAME, SPECIES_LABEL } from '../components/market/shared';
import { unitName } from '../components/market/rules';
import { Pill, Segmented } from '../components/orders/shared';
import { Card, EmptyState, Loading, PageHeader } from '../components/ui';
import { dateFr, fcfa } from '../lib/format';

const PAGE_SIZE = 24;

function ListingCard({ listing }: { listing: MarketListing }) {
  const photo = listingPhoto(listing);
  return (
    <Link to={`/marche/${listing.id}`} className="block rounded-xl transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500">
      <Card className="p-4 flex h-full flex-col gap-3">
        <div className="flex h-36 items-center justify-center rounded-lg bg-white">
          {photo ? <img src={photo} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Store className="h-10 w-10 text-slate-300" />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {listing.kind === 'PRE' ? (
            <Pill tone="bg-sky-50 text-sky-700 ring-sky-200">
              <CalendarClock className="h-3 w-3" /> Précommande
            </Pill>
          ) : (
            <Pill tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Disponible</Pill>
          )}
          {listing.deliveryAvailable ? (
            <Pill tone="bg-slate-100 text-slate-600 ring-slate-200">
              <Truck className="h-3 w-3" /> Livraison
            </Pill>
          ) : null}
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">{listingTitle(listing)}</h2>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
            <MapPin className="h-3 w-3 shrink-0" />
            {listing.farm.name}
            {listing.farm.city ? ` · ${listing.farm.city}` : ''}
          </p>
          {listing.traceLot ? <p className="mt-0.5 truncate text-xs font-medium text-brand-700">Lot tracé {listing.traceLot.code}</p> : null}
        </div>
        <div className="mt-auto">
          <p className="font-bold tabular-nums text-brand-700">
            {fcfa(listing.unitPriceFcfa)} <span className="text-xs font-normal text-slate-500">/ {unitName(listing.product)}</span>
          </p>
          <p className="text-xs text-slate-500">
            {listing.availableQuantity} {unitName(listing.product, listing.availableQuantity)}
            {listing.kind === 'PRE' && listing.readyDate ? ` · prêts le ${dateFr(listing.readyDate)}` : ' disponibles'}
          </p>
        </div>
      </Card>
    </Link>
  );
}

/** The public catalogue. No account needed: one is asked for only when ordering. */
export function MarketCataloguePage() {
  const [kind, setKind] = useState<MarketKind | ''>('');
  const [product, setProduct] = useState<MarketProduct | ''>('');
  const [species, setSpecies] = useState('');
  const [city, setCity] = useState('');
  const cityFilter = city.trim();

  const query = useInfiniteQuery({
    queryKey: ['market-listings', kind, product, species, cityFilter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageParam) });
      if (kind) params.set('kind', kind);
      if (product) params.set('product', product);
      if (species) params.set('species', species);
      if (cityFilter) params.set('city', cityFilter);
      return api.get<MarketCataloguePage>(`/market/listings?${params.toString()}`);
    },
    getNextPageParam: (last, _pages, offset) => (last.hasMore ? offset + PAGE_SIZE : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <PageHeader
        title="Marché"
        subtitle="Volaille, œufs et carcasses de fermes vérifiées. Vous payez directement la ferme."
        icon={<Store className="h-5 w-5" />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="flex flex-wrap items-center gap-3 lg:sticky lg:top-20 lg:flex-col lg:items-stretch lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-4 lg:shadow-card">
        <Segmented<MarketKind | ''>
          ariaLabel="Disponibilité"
          value={kind}
          onChange={setKind}
          options={[
            { key: '', label: 'Tout' },
            { key: 'NOW', label: 'Disponible' },
            { key: 'PRE', label: 'Précommande' },
          ]}
        />
        <select aria-label="Produit" className={`${inputCls} !w-auto lg:!w-full`} value={product} onChange={(e) => setProduct(e.target.value as MarketProduct | '')}>
          <option value="">Tous les produits</option>
          {(Object.keys(PRODUCT_NAME) as MarketProduct[]).map((p) => (
            <option key={p} value={p}>{PRODUCT_NAME[p]}</option>
          ))}
        </select>
        <select aria-label="Espèce" className={`${inputCls} !w-auto lg:!w-full`} value={species} onChange={(e) => setSpecies(e.target.value)}>
          <option value="">Toutes les espèces</option>
          {Object.entries(SPECIES_LABEL).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <input aria-label="Ville" placeholder="Ville" className={`${inputCls} !w-40 lg:!w-full`} value={city} onChange={(e) => setCity(e.target.value)} />
      </aside>

      <div className="min-w-0">
      {query.isLoading ? <Loading /> : null}
      {query.error ? <ErrorNote error={query.error} /> : null}
      {!query.isLoading && !query.error && items.length === 0 ? (
        <EmptyState message="Aucune annonce pour le moment avec ces critères." icon={<Store className="h-5 w-5" />} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
      {query.hasNextPage ? (
        <div className="mt-5 flex justify-center">
          <Button tone="secondary" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            Voir plus d’annonces
          </Button>
        </div>
      ) : null}
      </div>
      </div>
    </div>
  );
}
