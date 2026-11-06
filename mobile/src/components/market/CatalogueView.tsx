import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { CalendarClock, LogIn, MapPin, Store } from 'lucide-react-native';

import { CATALOGUE_PAGE_SIZE, fetchMarketListings, type MarketKind, type MarketListing, type MarketProduct } from '@/api/market';
import type { Species } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { color, fmtFcfa } from '@/constants/theme';
import { dayLabel, listingTitle, PRODUCT_NAME, SPECIES_NAME, unitName } from './rules';
import { ListingPhoto, marketError, PillRow } from './shared';

const CITY_DEBOUNCE_MS = 400;

function ListingCard({ listing }: { listing: MarketListing }) {
  const router = useRouter();
  return (
    <Card onPress={() => router.push(`/annonces/${listing.id}` as Href)} accessibilityLabel={listingTitle(listing)} style={{ gap: 10 }}>
      <ListingPhoto listing={listing} height={140} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {listing.kind === 'PRE' ? <Chip label="Précommande" tone="brand" /> : <Chip label="Disponible" tone="green" />}
        {listing.deliveryAvailable ? <Chip label="Livraison" tone="neutral" /> : null}
      </View>
      <View style={{ gap: 2 }}>
        <AppText size="bodyM" weight="semibold">
          {listingTitle(listing)}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <MapPin size={12} color={color.ink[400]} />
          <AppText size="caption" color="muted" numberOfLines={1} style={{ flex: 1 }}>
            {listing.farm.name}
            {listing.farm.city ? ` · ${listing.farm.city}` : ''}
          </AppText>
        </View>
        {listing.traceLot ? (
          <AppText size="caption" weight="semibold" color="brand" numberOfLines={1}>
            Lot tracé {listing.traceLot.code}
          </AppText>
        ) : null}
      </View>
      <View>
        <AppText size="bodyM" weight="bold" color="brand">
          {fmtFcfa(listing.unitPriceFcfa)} / {unitName(listing.product)}
        </AppText>
        <AppText size="caption" color="muted">
          {listing.availableQuantity} {unitName(listing.product, listing.availableQuantity)}
          {listing.kind === 'PRE' && listing.readyDate ? ` · prêts le ${dayLabel(listing.readyDate)}` : ' disponibles'}
        </AppText>
      </View>
    </Card>
  );
}

/** The public catalogue. No account needed: one is asked for only when ordering. */
export function CatalogueView({ back = false }: { back?: boolean }) {
  const router = useRouter();
  const { signedIn } = useAuth();
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
      <View style={{ gap: 12 }}>
        <PillRow<MarketKind | 'ALL'>
          value={kind}
          onChange={setKind}
          options={[
            { key: 'ALL', label: 'Tout' },
            { key: 'NOW', label: 'Disponible' },
            { key: 'PRE', label: 'Précommande' },
          ]}
        />
        <PillRow<MarketProduct | 'ALL'>
          value={product}
          onChange={setProduct}
          options={[
            { key: 'ALL', label: 'Tous les produits' },
            ...(Object.keys(PRODUCT_NAME) as MarketProduct[]).map((key) => ({ key, label: PRODUCT_NAME[key] })),
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
        <TextField value={cityText} onChangeText={setCityText} placeholder="Ville" accessibilityLabel="Ville" autoCorrect={false} />

        {query.isLoading ? <Spinner label="Chargement…" /> : null}
        {query.error && items.length === 0 ? (
          <EmptyState icon={Store} title="Annonces indisponibles" description={marketError(query.error)} actionLabel="Réessayer" onAction={() => void query.refetch()} />
        ) : null}
        {!query.isLoading && !query.error && items.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Aucune annonce" description="Rien pour le moment avec ces critères." />
        ) : null}
        {items.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
        {query.hasNextPage ? (
          <Button label="Voir plus d’annonces" tone="ghost" loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} />
        ) : null}
      </View>
    </Screen>
  );
}
