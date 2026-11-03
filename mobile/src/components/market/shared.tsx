import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import type { QueryClient } from '@tanstack/react-query';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarDays, Store, type LucideIcon } from 'lucide-react-native';

import { invalidateFarmQueries } from '@/api/invalidate';
import { localYmd } from '@/api/mutations';
import type { MarketBuyerStatus, MarketHiddenReason, MarketProduct } from '@/api/market';
import type { CustomerType, Species } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { errorMessage } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { breedImageForLot } from '@/constants/breedImages';
import { CUSTOMER_TYPES } from '@/constants/customers';
import { color, radii, semantic } from '@/constants/theme';
import { dayLabel } from './rules';

/** Who can buy: the customer types, without those that only make sense for a farm's own records. */
export const BUYER_TYPES: CustomerType[] = CUSTOMER_TYPES.filter((t) => t !== 'ELEVEUR' && t !== 'TRANSFORMATEUR');

const EGGS_PHOTO: ImageSourcePropType = require('@/assets/images/alveole2.jpg');

export function listingPhoto(l: { product: MarketProduct; species: string | null; breedName: string | null }): ImageSourcePropType | null {
  if (l.product === 'EGGS') return EGGS_PHOTO;
  return breedImageForLot(l.breedName, l.species as Species | null);
}

/** Whole photo, never cropped. Decorative: the name sits next to it. */
export function ListingPhoto({ listing, height }: { listing: Parameters<typeof listingPhoto>[0]; height: number }) {
  const photo = listingPhoto(listing);
  return (
    <View style={[styles.photo, { height }]}>
      {photo ? (
        <Image source={photo} resizeMode="contain" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
      ) : (
        <Store size={36} color={color.ink[300]} />
      )}
    </View>
  );
}

const STATUS: Record<MarketBuyerStatus, { label: string; tone: ChipTone }> = {
  PENDING: { label: 'En attente de la ferme', tone: 'amber' },
  REJECTED: { label: 'Refusée', tone: 'red' },
  WITHDRAWN: { label: 'Retirée', tone: 'neutral' },
  REQUEST_EXPIRED: { label: 'Sans réponse', tone: 'neutral' },
  AWAITING_DEPOSIT: { label: 'Acompte attendu', tone: 'accent' },
  CONFIRMED: { label: 'Confirmée', tone: 'green' },
  CANCEL_REQUESTED: { label: 'Annulation demandée', tone: 'accent' },
  DELIVERED: { label: 'Livrée', tone: 'brand' },
  CANCELLED: { label: 'Annulée', tone: 'neutral' },
  DEPOSIT_EXPIRED: { label: 'Annulée : acompte non reçu', tone: 'red' },
};

export function MarketStatusChip({ status }: { status: MarketBuyerStatus }) {
  const s = STATUS[status];
  return <Chip label={s.label} tone={s.tone} />;
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

/** Re-renders every 30 s, so a countdown stays right on a screen left open. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Market writes aren't queued: availability can't be checked offline, so say it plainly. */
export function marketError(e: unknown): string {
  // fetch reports a lost connection as a TypeError with an English message.
  if (e instanceof TypeError) return 'Pas de connexion au serveur. Réessayez une fois reconnecté.';
  return errorMessage(e);
}

/** What a buyer's action changes: their orders, and the quantities in the catalogue. */
export function invalidateBuyerQueries(client: QueryClient): void {
  for (const key of ['market-orders', 'market-order', 'market-listings', 'market-listing']) {
    void client.invalidateQueries({ queryKey: [key] });
  }
}

/** What a farm's action changes: its Market pages, the catalogue and its normal orders. */
export function invalidateFarmMarket(client: QueryClient, farmId: string): void {
  void client.invalidateQueries({ queryKey: ['market-farm-listings', farmId] });
  void client.invalidateQueries({ queryKey: ['market-farm-orders', farmId] });
  void client.invalidateQueries({ queryKey: ['market-listings'] });
  invalidateFarmQueries(client, { farmId });
}

const NOTICE = {
  warning: { bg: color.accent[50], fg: color.accent[700] },
  danger: { bg: color.red[50], fg: color.red[700] },
  info: { bg: color.brand[50], fg: color.brand[800] },
} as const;

export function Notice({ tone, icon: Icon, children }: { tone: keyof typeof NOTICE; icon?: LucideIcon; children: React.ReactNode }) {
  const t = NOTICE[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }]}>
      {Icon ? <Icon size={16} color={t.fg} style={{ marginTop: 1 }} /> : null}
      <AppText size="small" style={{ color: t.fg, flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}

export function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <AppText size="small" weight="medium" color="muted">
        {label}
      </AppText>
      {children}
      {hint ? (
        <AppText size="caption" color="faint">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/** A horizontal row of options; tapping the selected one again leaves it selected. */
export function PillRow<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          accessibilityRole="button"
          accessibilityState={{ selected: o.key === value }}
          style={[styles.pill, o.key === value && styles.pillOn]}>
          <AppText size="small" weight="semibold" style={{ color: o.key === value ? semantic.surface : color.ink[700] }}>
            {o.label}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Date field: the native picker on a phone, a typed date in the browser build. */
export function DateField({
  value,
  onChange,
  minimumDate,
  placeholder = 'Choisir une date',
}: {
  value: string;
  onChange: (ymd: string) => void;
  minimumDate?: Date;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') {
    return <TextField value={value} onChangeText={onChange} placeholder="AAAA-MM-JJ" accessibilityLabel={placeholder} />;
  }
  return (
    <View>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.date} accessibilityRole="button" accessibilityLabel={placeholder}>
        <CalendarDays size={16} color={color.brand[600]} />
        <AppText size="body" color={value ? 'text' : 'muted'}>
          {value ? dayLabel(value) : placeholder}
        </AppText>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={value ? new Date(`${value}T12:00:00`) : (minimumDate ?? new Date())}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minimumDate}
          locale="fr-FR"
          onChange={(_e: DateTimePickerEvent, d?: Date) => {
            if (Platform.OS === 'android') setOpen(false);
            if (d) onChange(localYmd(d));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.surface,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  notice: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: radii.md,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.border,
  },
  pillOn: {
    backgroundColor: color.brand[600],
    borderColor: color.brand[600],
  },
  date: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: semantic.border,
    borderRadius: radii.md,
    backgroundColor: semantic.surface,
  },
});
