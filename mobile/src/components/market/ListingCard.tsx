import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { House, Truck } from 'lucide-react-native';

import type { MarketListing } from '@/api/market';
import { AppText } from '@/components/ui/AppText';
import { Skeleton } from '@/components/ui/Skeleton';
import { color, fmt, fmtFcfa, radii, semantic, shadow, spacing } from '@/constants/theme';
import { dayLabel, listingTitle, unitName } from './rules';
import { AvailabilityPill, ListingPhoto, TracePill } from './shared';

/** One listing of the catalogue grid: photo stage, farm, then the price as the strongest line. */
export function ListingCard({ listing, width }: { listing: MarketListing; width: number }) {
  const router = useRouter();
  const stock = `${fmt(listing.availableQuantity)} ${unitName(listing.product, listing.availableQuantity)}`;
  return (
    <Pressable
      onPress={() => router.push(`/annonces/${listing.id}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={`${listingTitle(listing)}, ${fmtFcfa(listing.unitPriceFcfa)} par ${unitName(listing.product)}, ${listing.farm.name}`}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}>
      <ListingPhoto listing={listing}>
        <AvailabilityPill kind={listing.kind} />
        {listing.traceLot ? <TracePill /> : null}
      </ListingPhoto>
      <View style={styles.body}>
        <AppText size="bodyM" weight="semibold" numberOfLines={2}>
          {listingTitle(listing)}
        </AppText>
        <AppText size="caption" color="muted" numberOfLines={1}>
          {listing.farm.name}
          {listing.farm.city ? ` · ${listing.farm.city}` : ''}
        </AppText>
        <View style={styles.modes}>
          {listing.pickupAvailable ? <House size={13} color={color.ink[400]} /> : null}
          {listing.deliveryAvailable ? <Truck size={13} color={color.ink[400]} /> : null}
          <AppText size="label" color="faint" numberOfLines={1} style={styles.shrink}>
            {[listing.pickupAvailable ? 'Retrait' : null, listing.deliveryAvailable ? 'Livraison' : null].filter(Boolean).join(' · ')}
          </AppText>
        </View>
        <View style={styles.priceBlock}>
          <AppText size="body" weight="bold" color={color.brand[800]} numberOfLines={1} adjustsFontSizeToFit>
            {fmtFcfa(listing.unitPriceFcfa)}
            <AppText size="caption" color="muted">
              {' '}
              / {unitName(listing.product)}
            </AppText>
          </AppText>
          <AppText size="label" color="muted" numberOfLines={1}>
            {listing.kind === 'PRE' && listing.readyDate ? `${stock} · le ${dayLabel(listing.readyDate)}` : `${stock} disponibles`}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

/** The shape of a card while the catalogue loads. */
export function ListingCardSkeleton({ width }: { width: number }) {
  return (
    <View style={[styles.card, { width }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ aspectRatio: 4 / 3 }}>
        <Skeleton height="100%" radius={0} />
      </View>
      <View style={styles.body}>
        <Skeleton width="80%" />
        <Skeleton width="55%" height={11} />
        <View style={styles.priceBlock}>
          <Skeleton width="60%" height={16} />
          <Skeleton width="75%" height={10} style={{ marginTop: spacing.xs }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
    overflow: 'hidden',
    ...shadow.card,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.98 }],
  },
  body: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  modes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  shrink: {
    flexShrink: 1,
  },
  priceBlock: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
  },
});
