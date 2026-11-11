import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { safeExternalUrl } from '@/utils/safeUrl';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  ArrowUpRight,
  Boxes,
  CalendarCheck,
  CalendarClock,
  House,
  MapPin,
  Package,
  QrCode,
  ShieldCheck,
  Store,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';

import { ApiError } from '@/api/client';
import { fetchMarketListing, type MarketListing } from '@/api/market';
import { useAuth } from '@/auth/AuthContext';
import { OrderSheet } from '@/components/market/OrderSheet';
import { dayLabel, listingTitle, PRODUCT_NAME, unitName } from '@/components/market/rules';
import { AvailabilityPill, ListingPhoto, marketError, Notice, TracePill } from '@/components/market/shared';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FarmLogo } from '@/components/ui/FarmLogo';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Skeleton } from '@/components/ui/Skeleton';
import { color, fmt, fmtFcfa, radii, semantic, shadow, spacing } from '@/constants/theme';

function Fact({ icon: Icon, label, value, muted = false }: { icon: LucideIcon; label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.fact}>
      <View style={[styles.factIcon, muted && styles.factIconMuted]}>
        <Icon size={18} color={muted ? color.ink[400] : color.brand[600]} />
      </View>
      <View style={styles.shrink}>
        <AppText size="label" color="muted" numberOfLines={1}>
          {label}
        </AppText>
        <AppText size="small" weight="semibold" color={muted ? 'muted' : 'text'} numberOfLines={1}>
          {value}
        </AppText>
      </View>
    </View>
  );
}

function Facts({ listing }: { listing: MarketListing }) {
  const unit = (n: number) => unitName(listing.product, n);
  return (
    <View style={styles.facts}>
      <Fact icon={Package} label="Disponible" value={`${fmt(listing.availableQuantity)} ${unit(listing.availableQuantity)}`} />
      <Fact icon={Boxes} label="Commande minimum" value={`${fmt(listing.minOrderQty)} ${unit(listing.minOrderQty)}`} />
      <Fact icon={Wallet} label="Acompte" value={listing.depositPct ? `${listing.depositPct} %` : 'Aucun'} />
      <Fact icon={House} label="Retrait" value={listing.pickupAvailable ? 'À la ferme' : 'Non proposé'} muted={!listing.pickupAvailable} />
      <Fact
        icon={Truck}
        label="Livraison"
        value={listing.deliveryAvailable ? (listing.deliveryFeeFcfa ? fmtFcfa(listing.deliveryFeeFcfa) : 'Proposée') : 'Non proposée'}
        muted={!listing.deliveryAvailable}
      />
      {listing.kind === 'PRE' && listing.readyDate ? <Fact icon={CalendarClock} label="Prêts le" value={dayLabel(listing.readyDate)} /> : null}
      {listing.product === 'CARCASS' && listing.slaughteredAt ? <Fact icon={CalendarCheck} label="Abattus le" value={dayLabel(listing.slaughteredAt)} /> : null}
    </View>
  );
}

function ListingSkeleton() {
  return (
    <View style={styles.page} accessibilityLabel="Chargement de l’annonce">
      <View style={[styles.stage, { aspectRatio: 16 / 10 }]}>
        <Skeleton height="100%" radius={0} />
      </View>
      <Skeleton width="70%" height={24} />
      <Skeleton width="45%" height={14} />
      <Skeleton width="50%" height={28} />
      <View style={styles.facts}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={62} radius={radii.lg} style={styles.factSkeleton} />
        ))}
      </View>
    </View>
  );
}

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { signedIn } = useAuth();
  const [ordering, setOrdering] = useState(false);
  const query = useQuery({ queryKey: ['market-listing', id], queryFn: () => fetchMarketListing(id) });
  const listing = query.data;
  const from = encodeURIComponent(`/annonces/${id}`);
  const gone = query.error instanceof ApiError && query.error.status === 404;

  // The main action stays in reach under the page: order when signed in, otherwise open an account.
  const footer = !listing ? undefined : signedIn ? (
    <View style={styles.bar}>
      <View style={styles.shrink}>
        <AppText size="h3" weight="bold" numberOfLines={1} adjustsFontSizeToFit>
          {fmtFcfa(listing.unitPriceFcfa)}
        </AppText>
        <AppText size="caption" color="muted" numberOfLines={1}>
          par {unitName(listing.product)}
        </AppText>
      </View>
      <Button label={listing.kind === 'PRE' ? 'Précommander' : 'Commander'} tone="accent" size="lg" block={false} onPress={() => setOrdering(true)} />
    </View>
  ) : (
    <View style={styles.barButtons}>
      <Button label="Me connecter" tone="ghost" size="lg" style={styles.barButton} onPress={() => router.push(`/login?from=${from}` as Href)} />
      <Button label="Créer un compte" tone="accent" size="lg" style={styles.barButton} onPress={() => router.push(`/inscription-acheteur?from=${from}` as Href)} />
    </View>
  );

  return (
    <Screen header={<ScreenHeader title="Annonce" back />} bottomPad={spacing.xxl} footer={footer}>
      {query.isLoading ? <ListingSkeleton /> : null}
      {!listing && query.error ? (
        <EmptyState
          icon={Store}
          title={gone ? 'Annonce indisponible' : 'Chargement impossible'}
          description={gone ? 'Cette annonce n’est plus disponible.' : marketError(query.error)}
        />
      ) : null}
      {listing ? (
        <View style={styles.page}>
          <ListingPhoto listing={listing} ratio={16 / 10} style={styles.stage}>
            <AvailabilityPill kind={listing.kind} />
            {listing.traceLot ? <TracePill /> : null}
          </ListingPhoto>

          <View style={styles.titleBlock}>
            <AppText size="label" weight="semibold" color="muted" style={styles.eyebrow}>
              {PRODUCT_NAME[listing.product].toUpperCase()}
            </AppText>
            <AppText size="h1" weight="bold" accessibilityRole="header">
              {listingTitle(listing)}
            </AppText>
            <AppText size="h1" weight="bold" color={color.brand[800]}>
              {fmtFcfa(listing.unitPriceFcfa)}
              <AppText size="bodyM" color="muted">
                {' '}
                / {unitName(listing.product)}
              </AppText>
            </AppText>
          </View>

          <Facts listing={listing} />

          {listing.kind === 'PRE' && listing.readyDate && listing.previousReadyDate ? (
            <Notice tone="info" icon={CalendarClock}>
              Date modifiée par la ferme (auparavant le {dayLabel(listing.previousReadyDate)}).
            </Notice>
          ) : null}
          {listing.product === 'CARCASS' && listing.slaughteredAt ? (
            <Notice tone="info">Demandez à la ferme comment les carcasses sont conservées.</Notice>
          ) : null}

          {listing.description ? (
            <Card style={styles.cardGap}>
              <AppText size="small" weight="semibold">
                Le mot de la ferme
              </AppText>
              <AppText size="bodyM" color="muted">
                {listing.description}
              </AppText>
            </Card>
          ) : null}

          <Card style={styles.row}>
            <FarmLogo farm={listing.farm} size={48} />
            <View style={styles.shrink}>
              <AppText size="body" weight="semibold" numberOfLines={1}>
                {listing.farm.name}
              </AppText>
              {listing.farm.city ? (
                <View style={styles.inline}>
                  <MapPin size={13} color={color.ink[400]} />
                  <AppText size="small" color="muted" numberOfLines={1} style={styles.shrink}>
                    {listing.farm.city}
                  </AppText>
                </View>
              ) : null}
              <View style={styles.inline}>
                <ShieldCheck size={13} color={semantic.successText} />
                <AppText size="caption" weight="semibold" color={semantic.successText}>
                  Ferme vérifiée
                </AppText>
              </View>
            </View>
          </Card>

          {listing.traceLot ? (
            // POUFA lot A indic: the band's public traceability page.
            <Card
              style={styles.row}
              accessibilityLabel={`Lot tracé ${listing.traceLot.code}, voir la fiche de traçabilité`}
              onPress={() => {
                const url = safeExternalUrl(listing.traceLot!.url);
                if (url) void Linking.openURL(url);
              }}>
              <View style={styles.traceIcon}>
                <QrCode size={24} color={color.green[300]} />
              </View>
              <View style={styles.shrink}>
                <AppText size="body" weight="semibold" numberOfLines={1}>
                  Lot tracé {listing.traceLot.code}
                </AppText>
                <AppText size="small" color="muted">
                  Voir la fiche de traçabilité
                </AppText>
              </View>
              <ArrowUpRight size={20} color={color.ink[400]} />
            </Card>
          ) : null}

          {signedIn ? null : (
            <AppText size="small" color="muted" align="center">
              Créez un compte gratuit ou connectez-vous pour envoyer votre demande à la ferme. Vous la payez directement : Fermia n’encaisse rien.
            </AppText>
          )}
          {signedIn ? <OrderSheet listing={listing} visible={ordering} onClose={() => setOrdering(false)} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.lg,
  },
  stage: {
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: semantic.border,
    ...shadow.card,
  },
  titleBlock: {
    gap: spacing.xs,
  },
  eyebrow: {
    letterSpacing: 1.2,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fact: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  factSkeleton: {
    flexGrow: 1,
    flexBasis: '45%',
    width: undefined,
  },
  factIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.primarySoft,
  },
  factIconMuted: {
    backgroundColor: semantic.surfaceAlt,
  },
  cardGap: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  traceIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.heroBg,
  },
  shrink: {
    flex: 1,
    minWidth: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  barButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  barButton: {
    flex: 1,
  },
});
