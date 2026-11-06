import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { CalendarClock, MapPin, QrCode, Store } from 'lucide-react-native';

import { ApiError } from '@/api/client';
import { fetchMarketListing } from '@/api/market';
import { useAuth } from '@/auth/AuthContext';
import { OrderSheet } from '@/components/market/OrderSheet';
import { dayLabel, listingTitle, unitName } from '@/components/market/rules';
import { ListingPhoto, marketError } from '@/components/market/shared';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Spinner } from '@/components/ui/Spinner';
import { color, fmtFcfa } from '@/constants/theme';

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { signedIn } = useAuth();
  const [ordering, setOrdering] = useState(false);
  const query = useQuery({ queryKey: ['market-listing', id], queryFn: () => fetchMarketListing(id) });
  const listing = query.data;
  const from = encodeURIComponent(`/annonces/${id}`);
  const gone = query.error instanceof ApiError && query.error.status === 404;

  return (
    <Screen header={<ScreenHeader title="Annonce" back />}>
      {query.isLoading ? <Spinner label="Chargement…" /> : null}
      {!listing && query.error ? (
        <EmptyState
          icon={Store}
          title={gone ? 'Annonce indisponible' : 'Chargement impossible'}
          description={gone ? 'Cette annonce n’est plus disponible.' : marketError(query.error)}
        />
      ) : null}
      {listing ? (
        <View style={{ gap: 12 }}>
          <Card style={{ gap: 10 }}>
            <ListingPhoto listing={listing} height={200} />
            <AppText size="h2" weight="bold">
              {listingTitle(listing)}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MapPin size={14} color={color.ink[400]} />
              <AppText size="small" color="muted" style={{ flex: 1 }}>
                {listing.farm.name}
                {listing.farm.city ? ` · ${listing.farm.city}` : ''}
              </AppText>
            </View>
            <AppText size="h2" weight="bold" color="brand">
              {fmtFcfa(listing.unitPriceFcfa)} / {unitName(listing.product)}
            </AppText>
            <AppText size="small" color="muted">
              {listing.availableQuantity} {unitName(listing.product, listing.availableQuantity)} · minimum {listing.minOrderQty}
            </AppText>
            {listing.description ? <AppText size="body">{listing.description}</AppText> : null}
            {listing.traceLot ? (
              // POUFA lot A indic: the band's public traceability page.
              <Button
                label={`Lot tracé ${listing.traceLot.code}`}
                tone="ghost"
                size="sm"
                block={false}
                icon={QrCode}
                onPress={() => void Linking.openURL(listing.traceLot!.url)}
              />
            ) : null}
          </Card>

          {listing.kind === 'PRE' && listing.readyDate ? (
            <Card style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <CalendarClock size={16} color={color.brand[600]} />
                <AppText size="body" weight="semibold">
                  Prêts le {dayLabel(listing.readyDate)}
                </AppText>
              </View>
              {listing.previousReadyDate ? (
                <AppText size="small" color="muted">
                  Date modifiée par la ferme (auparavant le {dayLabel(listing.previousReadyDate)}).
                </AppText>
              ) : null}
            </Card>
          ) : null}
          {listing.product === 'CARCASS' && listing.slaughteredAt ? (
            <Card style={{ gap: 4 }}>
              <AppText size="body" weight="semibold">
                Abattus le {dayLabel(listing.slaughteredAt)}
              </AppText>
              <AppText size="small" color="muted">
                Demandez à la ferme comment les carcasses sont conservées.
              </AppText>
            </Card>
          ) : null}

          {signedIn ? (
            <Button label={listing.kind === 'PRE' ? 'Précommander' : 'Commander'} onPress={() => setOrdering(true)} />
          ) : (
            <Card style={{ gap: 10 }}>
              <AppText size="small" color="muted">
                Créez un compte gratuit ou connectez-vous pour envoyer votre demande à la ferme.
              </AppText>
              <Button label="Créer un compte" onPress={() => router.push(`/inscription-acheteur?from=${from}` as Href)} />
              <Button label="Me connecter" tone="ghost" onPress={() => router.push(`/login?from=${from}` as Href)} />
            </Card>
          )}
          {signedIn ? <OrderSheet listing={listing} visible={ordering} onClose={() => setOrdering(false)} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}
