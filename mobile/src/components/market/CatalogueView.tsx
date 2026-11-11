import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { Bird, Drumstick, Egg, LayoutGrid, LogIn, RotateCcw, SearchX, Store, type LucideIcon } from 'lucide-react-native';

import { CATALOGUE_PAGE_SIZE, fetchMarketListings, type MarketKind, type MarketProduct } from '@/api/market';
import type { Species } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { color, layout, radii, semantic, spacing } from '@/constants/theme';
import { ListingCard, ListingCardSkeleton } from './ListingCard';
import { MarketHero } from './MarketHero';
import { SPECIES_NAME } from './rules';
import { marketError, PillRow } from './shared';

const CITY_DEBOUNCE_MS = 400;

const CATEGORIES: { key: MarketProduct | 'ALL'; label: string; icon: LucideIcon }[] = [
  { key: 'ALL', label: 'Tout', icon: LayoutGrid },
  { key: 'BIRDS', label: 'Volaille', icon: Bird },
  { key: 'EGGS', label: 'Œufs', icon: Egg },
  { key: 'CARCASS', label: 'Carcasses', icon: Drumstick },
];

const GRID_GAP = spacing.md;

/** Two cards side by side on a phone, three on a tablet, one on a very narrow screen. */
function useCardWidth(): number {
  const { width } = useWindowDimensions();
  const inner = Math.min(width, layout.maxW) - 2 * layout.contentPadding;
  const columns = inner < 320 ? 1 : inner >= 640 ? 3 : 2;
  return Math.floor((inner - GRID_GAP * (columns - 1)) / columns);
}

/** The public catalogue. No account needed: one is asked for only when ordering. */
export function CatalogueView({ back = false }: { back?: boolean }) {
  const router = useRouter();
  const { signedIn } = useAuth();
  const cardWidth = useCardWidth();
  const [kind, setKind] = useState<MarketKind | 'ALL'>('ALL');
  const [product, setProduct] = useState<MarketProduct | 'ALL'>('ALL');
  const [species, setSpecies] = useState<Species | 'ALL'>('ALL');
  const [cityText, setCityText] = useState('');
  const [city, setCity] = useState('');

  // Phones are on metered data: don't ask the server at every letter.
  useEffect(() => {
    const timer = setTimeout(() => setCity(cityText.trim()), CITY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [cityText]);

  const query = useInfiniteQuery({
    queryKey: ['market-listings', kind, product, species, city],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchMarketListings(
        {
          kind: kind === 'ALL' ? undefined : kind,
          product: product === 'ALL' ? undefined : product,
          species: species === 'ALL' ? undefined : species,
          city: city || undefined,
        },
        pageParam,
      ),
    getNextPageParam: (last, _pages, offset) => (last.hasMore ? offset + CATALOGUE_PAGE_SIZE : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = kind !== 'ALL' || product !== 'ALL' || species !== 'ALL' || cityText.trim() !== '';
  const reset = () => {
    setKind('ALL');
    setProduct('ALL');
    setSpecies('ALL');
    setCityText('');
    setCity('');
  };

  return (
    <Screen
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          title="Marché"
          subtitle="Vous payez directement la ferme"
          back={back}
          right={
            signedIn ? undefined : (
              <Button label="Connexion" icon={LogIn} size="sm" tone="ghost" block={false} onPress={() => router.push('/login?from=/annonces' as Href)} />
            )
          }
        />
      }>
      <View style={styles.page}>
        <MarketHero city={cityText} onCity={setCityText} />

        <View style={styles.categories}>
          {CATEGORIES.map(({ key, label, icon: Icon }) => {
            const on = product === key;
            return (
              <Pressable
                key={key}
                onPress={() => setProduct(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={label}
                style={({ pressed }) => [styles.category, on && styles.categoryOn, pressed && styles.pressed]}>
                <View style={[styles.categoryIcon, on && styles.categoryIconOn]}>
                  <Icon size={20} color={on ? color.green[300] : color.brand[600]} />
                </View>
                <AppText size="small" weight="semibold" numberOfLines={1} style={{ color: on ? semantic.textOnFill : color.ink[800] }}>
                  {label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <Segmented<MarketKind | 'ALL'>
          value={kind}
          onChange={setKind}
          options={[
            { key: 'ALL', label: 'Tout' },
            { key: 'NOW', label: 'Disponible' },
            { key: 'PRE', label: 'Précommande' },
          ]}
        />
        <PillRow<Species | 'ALL'>
          value={species}
          onChange={setSpecies}
          options={[
            { key: 'ALL', label: 'Toutes les espèces' },
            ...(Object.keys(SPECIES_NAME) as Species[]).map((key) => ({ key, label: SPECIES_NAME[key] ?? key })),
          ]}
        />

        {!query.isLoading && items.length > 0 ? (
          <View style={styles.resultRow}>
            <AppText size="small" color="muted">
              <AppText size="small" weight="bold">
                {items.length}
                {query.hasNextPage ? '+' : ''}
              </AppText>{' '}
              annonce{items.length > 1 ? 's' : ''}
            </AppText>
            {filtered ? <Button label="Réinitialiser" icon={RotateCcw} size="xs" tone="ghost" block={false} onPress={reset} /> : null}
          </View>
        ) : null}

        {query.isLoading ? (
          <View style={styles.grid} accessibilityLabel="Chargement des annonces">
            {[0, 1, 2, 3].map((i) => (
              <ListingCardSkeleton key={i} width={cardWidth} />
            ))}
          </View>
        ) : null}
        {query.error && items.length === 0 ? (
          <EmptyState icon={Store} title="Annonces indisponibles" description={marketError(query.error)} actionLabel="Réessayer" onAction={() => void query.refetch()} />
        ) : null}
        {!query.isLoading && !query.error && items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Aucune annonce"
            description={filtered ? 'Rien ne correspond à ces critères. Élargissez votre recherche.' : 'Les fermes publient régulièrement : revenez bientôt.'}
            actionLabel={filtered ? 'Voir toutes les annonces' : undefined}
            onAction={filtered ? reset : undefined}
          />
        ) : null}
        {items.length > 0 ? (
          <View style={styles.grid}>
            {items.map((l) => (
              <ListingCard key={l.id} listing={l} width={cardWidth} />
            ))}
          </View>
        ) : null}
        {query.hasNextPage ? (
          <Button label="Voir plus d’annonces" tone="ghost" loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.md,
  },
  categories: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  category: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  categoryOn: {
    backgroundColor: semantic.heroBg,
    borderColor: semantic.heroBg,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.primarySoft,
  },
  categoryIconOn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  pressed: {
    opacity: 0.85,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
});
