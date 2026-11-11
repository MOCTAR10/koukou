import { useInfiniteQuery } from '@tanstack/react-query';
import { Bird, Drumstick, Egg, LayoutGrid, RotateCcw, SearchX, type LucideIcon } from 'lucide-react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { MarketCataloguePage, MarketKind, MarketProduct } from '../api/types-market';
import { Button, ErrorNote, inlineInputCls } from '../components/form';
import { ListingCard, ListingCardSkeleton } from '../components/market/ListingCard';
import { MarketHero } from '../components/market/MarketHero';
import { SPECIES_LABEL } from '../components/market/shared';
import { Segmented } from '../components/orders/shared';
import { classNames } from '../lib/format';
import { staggerItem } from '../lib/motion';

const PAGE_SIZE = 24;
const CITY_DEBOUNCE_MS = 350;

const CATEGORIES: { key: MarketProduct | ''; label: string; hint: string; icon: LucideIcon }[] = [
  { key: '', label: 'Tout le marché', hint: 'Toutes les annonces', icon: LayoutGrid },
  { key: 'BIRDS', label: 'Volaille vivante', hint: 'Poulets, pintades, canards…', icon: Bird },
  { key: 'EGGS', label: 'Œufs', hint: 'Vendus par alvéole', icon: Egg },
  { key: 'CARCASS', label: 'Carcasses', hint: 'Volaille abattue', icon: Drumstick },
];

const GRID = 'grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

/** Quicker than the shared stagger: a page holds up to 24 cards. */
const gridStagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.035 } } };

/** The public catalogue. No account needed: one is asked for only when ordering. */
export function MarketCataloguePage() {
  const reduceMotion = useReducedMotion();
  const [kind, setKind] = useState<MarketKind | ''>('');
  const [product, setProduct] = useState<MarketProduct | ''>('');
  const [species, setSpecies] = useState('');
  const [cityText, setCityText] = useState('');
  const [cityFilter, setCityFilter] = useState('');

  // Don't ask the server at every letter of the city.
  useEffect(() => {
    const timer = setTimeout(() => setCityFilter(cityText.trim()), CITY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [cityText]);

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
  const filtered = Boolean(kind || product || species || cityText.trim());
  const reset = () => {
    setKind('');
    setProduct('');
    setSpecies('');
    setCityText('');
    setCityFilter('');
  };

  return (
    <div>
      <MarketHero city={cityText} onCity={setCityText} />

      {/* Filters: a raised panel that overlaps the bottom of the hero. */}
      <div className="relative z-10 -mt-14 rounded-3xl border border-slate-200 bg-white p-3 shadow-raised sm:p-4">
        <div role="group" aria-label="Produit" className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
          {CATEGORIES.map(({ key, label, hint, icon: Icon }) => {
            const on = product === key;
            return (
              <button
                key={key || 'ALL'}
                type="button"
                aria-pressed={on}
                onClick={() => setProduct(key)}
                className={classNames(
                  'flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-colors duration-200 sm:gap-3 sm:p-3',
                  on ? 'border-brand-950 bg-brand-950 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-800 hover:border-brand-200 hover:bg-brand-50',
                )}
              >
                <span
                  className={classNames(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10',
                    on ? 'bg-white/10 text-emerald-300' : 'bg-brand-50 text-brand-600',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight sm:truncate sm:text-sm sm:leading-normal">{label}</span>
                  <span className={classNames('hidden truncate text-xs sm:block', on ? 'text-brand-200' : 'text-slate-500')}>{hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
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
          <select
            aria-label="Espèce"
            className={classNames(inlineInputCls, 'w-auto rounded-full py-1.5 text-xs font-semibold text-slate-600')}
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
          >
            <option value="">Toutes les espèces</option>
            {Object.entries(SPECIES_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <p aria-live="polite" className="ml-auto text-sm text-slate-500">
            {query.isLoading ? (
              'Recherche…'
            ) : (
              <>
                <span className="font-semibold tabular-nums text-slate-900">
                  {items.length}
                  {query.hasNextPage ? '+' : ''}
                </span>{' '}
                annonce{items.length > 1 ? 's' : ''}
              </>
            )}
          </p>
          {filtered ? (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
              <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        {query.error ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : null}

        {query.isLoading ? (
          <div role="status" className={GRID}>
            <span className="sr-only">Chargement des annonces…</span>
            {Array.from({ length: 10 }, (_, i) => (
              <ListingCardSkeleton key={i} />
            ))}
          </div>
        ) : null}

        {!query.isLoading && !query.error && items.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <SearchX className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">Aucune annonce pour le moment</h2>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              {filtered ? 'Rien ne correspond à ces critères. Élargissez votre recherche.' : 'Les fermes publient régulièrement : revenez bientôt.'}
            </p>
            {filtered ? (
              <Button tone="secondary" className="mt-5" onClick={reset}>
                <RotateCcw className="h-4 w-4" /> Voir toutes les annonces
              </Button>
            ) : null}
          </div>
        ) : null}

        {items.length > 0 ? (
          <motion.div
            // A new search plays the entrance again.
            key={[kind, product, species, cityFilter].join('|')}
            variants={gridStagger}
            initial={reduceMotion ? false : 'hidden'}
            animate="show"
            className={GRID}
          >
            {items.map((l) => (
              <motion.div key={l.id} variants={staggerItem} className="h-full">
                <ListingCard listing={l} />
              </motion.div>
            ))}
          </motion.div>
        ) : null}

        {query.hasNextPage ? (
          <div className="mt-8 flex justify-center">
            <Button tone="secondary" className="rounded-full px-6 py-2.5" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              Voir plus d’annonces
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
