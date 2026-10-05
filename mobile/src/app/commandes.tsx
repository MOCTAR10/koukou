import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, ChevronDown, ChevronRight, ClipboardList, Contact, Map as MapIcon, MapPin, Pencil, Plus, Search, Trash2, UserPlus } from 'lucide-react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { AppText, appTextStyles } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { NumberInput } from '@/components/ui/NumberInput';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { AnimatedNumber } from '@/components/ui/motion/AnimatedNumber';
import { TapScale } from '@/components/ui/motion/TapScale';
import { orderCanalLabel, orderStatusLabel, orderStatusTone, productLabel } from '@/components/orders/labels';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ClientPickerSheet } from '@/components/capture/ClientPickerSheet';
import { AddressSearchSheet } from '@/components/capture/AddressSearchSheet';
import { useAuth } from '@/auth/AuthContext';
import { fetchBatches, fetchOrders, fetchPointsOfSale } from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import { createOrderQueued } from '@/offline/engine';
import { DEFAULT_AVG_WEIGHT_KG, type SaleProductType, type SaleUnit } from '@/api/mutations';
import { canManageFarm } from '@/api/roles';
import { SPECIES_ICONS } from '@/api/format';
import { breedImageForLot } from '@/constants/breedImages';
import { customerTypeLabel } from '@/constants/customers';
import { GABON_PROVINCES } from '@/constants/gabon';
import { geocodeGabonAddress, type GeoSuggest } from '@/utils/geocode';
import type { Customer, OrderFull, OrderStatus } from '@/api/types';
import { color, palette, radii, spacing, fmt, fmtFcfa, Fonts } from '@/constants/theme';
import { durations, easing, enter, layout, staggeredEnter, timed } from '@/constants/motion';

const FILTERS: { key: OrderStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'PENDING', label: 'En attente' },
  { key: 'CONFIRMED', label: 'Confirmées' },
  { key: 'LIVRE', label: 'Livrées' },
  { key: 'CANCELLED', label: 'Annulées' },
];

type OrderProductKey = 'PIECE' | 'KG' | 'OEUF';

type OrderCanalKey = 'FERME' | 'PRECOMMANDE' | 'LIVRAISON';

type OrderLieuKey = 'FERME' | 'PDV' | 'LIVRAISON';

interface DraftItem {
  productType: SaleProductType;
  label: string;
  quantity: number;
  unitPriceFcfa: number;
  batchId?: string;
  pieceCount?: number;
  unit: SaleUnit;
  amountFcfa: number;
}

const ORDER_PRODUCTS: { key: OrderProductKey; label: string; unit: string }[] = [
  { key: 'PIECE', label: 'Sur pied (pièce)', unit: 'pcs' },
  { key: 'KG', label: 'Sur pied (kg)', unit: 'oiseaux' },
  { key: 'OEUF', label: 'Œufs (alvéole)', unit: 'alv.' },
];

function nextExpectedDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

const DEFAULT_PRICES: Record<OrderProductKey, number> = {
  PIECE: 2500,
  KG: 2200,
  OEUF: 2500,
};

/** Date locale (YYYY-MM-DD) : évite le décalage d'un jour de toISOString() (UTC). */
function toLocalDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function SegmentPill({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.segPill}>
      <AppText size="caption" weight="semibold" style={{ color: palette.brand[200] }}>
        {label}
      </AppText>
      <AppText size="bodyM" weight="bold" style={{ color: palette.surface }}>
        {count}
      </AppText>
    </View>
  );
}

function OrderHero({ orders }: { orders: OrderFull[] }) {
  const pending = orders.filter((o) => o.status === 'PENDING').length;
  const confirmed = orders.filter((o) => o.status === 'CONFIRMED').length;
  const restant = orders
    .filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED')
    .reduce((a, o) => a + Math.max(o.totalAmountFcfa - o.depositFcfa, 0), 0);
  const deliveredAmount = orders.filter((o) => o.status === 'LIVRE').reduce((a, o) => a + o.totalAmountFcfa, 0);
  const totalAmount = orders.reduce((a, o) => a + o.totalAmountFcfa, 0);
  const rate = totalAmount > 0 ? Math.min(1, deliveredAmount / totalAmount) : 0;

  const progress = useSharedValue(rate);

  useEffect(() => {
    progress.value = timed(rate, { duration: durations.slow, easing: easing.inOut });
  }, [progress, rate]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <Animated.View style={styles.hero} entering={enter.fadeDown()}>
      <View style={styles.heroCols}>
        <View style={styles.heroCol}>
          <AppText size="label" style={{ color: palette.brand[200] }}>
            À LIVRER
          </AppText>
          <AnimatedNumber value={confirmed} duration={durations.slow} style={appTextStyles('h1', 'bold', palette.surface)} />
          <AppText size="caption" style={{ color: palette.brand[200] }}>
            confirmées
          </AppText>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroCol}>
          <AppText size="label" style={{ color: palette.brand[200] }}>
            EN ATTENTE
          </AppText>
          <AnimatedNumber value={pending} duration={durations.slow} style={appTextStyles('h1', 'bold', palette.surface)} />
          <AppText size="caption" style={{ color: palette.brand[200] }}>
            acompte requis
          </AppText>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroCol}>
          <AppText size="label" style={{ color: palette.brand[200] }}>
            RESTE À ENCAISSER
          </AppText>
          <AnimatedNumber
            value={restant}
            duration={durations.slow}
            style={appTextStyles('h2', 'bold', restant > 0 ? palette.accent[300] : palette.green[300])}
          />
          <AppText size="caption" style={{ color: palette.brand[200] }}>
            FCFA en cours
          </AppText>
        </View>
      </View>
      <View style={styles.heroBar}>
        <Animated.View style={[styles.heroBarFill, fillStyle]} />
      </View>
      <View style={styles.heroSegments}>
        <SegmentPill label="Livrées" count={orders.filter((o) => o.status === 'LIVRE').length} />
        <SegmentPill label="Annulées" count={orders.filter((o) => o.status === 'CANCELLED').length} />
        <SegmentPill label="Total" count={orders.length} />
      </View>
    </Animated.View>
  );
}

/** Petite étape numérotée : titre de section pro et cohérent (cf. POS). */
function StepTitle({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stepTitleRow}>
      <View style={styles.stepBadge}>
        <AppText size="caption" weight="bold" style={{ color: '#ffffff' }}>
          {n}
        </AppText>
      </View>
      <AppText size="label" weight="bold" color="text">
        {label}
      </AppText>
    </View>
  );
}

function CreateOrderSheet({ onClose }: { onClose: () => void }) {
  const { farmId } = useAuth();
  const queryClient = useQueryClient();
  const batchesQuery = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId) });
  const pdvQuery = useQuery({ queryKey: ['points-of-sale', farmId], queryFn: () => fetchPointsOfSale(farmId) });

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [lieu, setLieu] = useState<OrderLieuKey>('FERME');
  const [client, setClient] = useState<Customer | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pdvId, setPdvId] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryProvince, setDeliveryProvince] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [provinceSheetOpen, setProvinceSheetOpen] = useState(false);
  const [expectedDate, setExpectedDate] = useState<Date>(nextExpectedDate);
  const [showDate, setShowDate] = useState(false);
  const [deposit, setDeposit] = useState(0);

  const [items, setItems] = useState<DraftItem[]>([]);
  const [product, setProduct] = useState<OrderProductKey>('PIECE');
  const [lotId, setLotId] = useState('');
  const [qty, setQty] = useState(0);
  const [weightKgText, setWeightKgText] = useState('');
  const [price, setPrice] = useState(DEFAULT_PRICES.PIECE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canal: OrderCanalKey =
    lieu === 'PDV' ? 'PRECOMMANDE' : lieu === 'LIVRAISON' ? 'LIVRAISON' : 'FERME';

  const sellable = (batchesQuery.data ?? []).filter(
    (b) => b.quantityAlive > 0 && (b.status === 'EN_VENTE' || b.status === 'ACTIF'),
  );
  const pdvs = (pdvQuery.data ?? []).filter((p) => p.isActive && p.kind === 'BOUTIQUE');

  const orderLotId = items.find((i) => i.batchId)?.batchId;
  const total = items.reduce((a, i) => a + i.amountFcfa, 0);

  const lot = sellable.find((b) => b.id === lotId) ?? null;
  const notReady = lot ? lot.status !== 'EN_VENTE' && !lot.metrics.readyForSale : false;
  const advisory =
    lot && notReady
      ? lot.metrics.readyReason === 'TOO_YOUNG'
        ? `Conseil : lot encore jeune (J${lot.metrics.ageDays}). Poids et sanitaire à vérifier avant la vente.`
        : lot.metrics.readyReason === 'SANITARY'
          ? 'Conseil sanitaire : surveillez l’état du lot avant de vendre.'
          : lot.metrics.readyReason === 'FCR'
            ? 'Indice de conversion élevé : vente possible, contrôlez le poids moyen.'
            : 'Lot non signalé prêt à la vente : vérifiez les indicateurs avant de vendre.'
      : null;
  const eggEggs = (batchesQuery.data ?? []).reduce(
    (s, b) => s + Math.max(b.metrics.eggStockAvailableEggs ?? 0, 0),
    0,
  );
  const eggAlveoles = (batchesQuery.data ?? []).reduce(
    (s, b) => s + Math.max(b.metrics.eggStockAvailableAlveoles ?? 0, 0),
    0,
  );

  const lotEggs = lot ? Math.max(lot.metrics.eggStockAvailableEggs ?? 0, 0) : eggEggs;
  const lotAlveoles = lot ? Math.max(lot.metrics.eggStockAvailableAlveoles ?? 0, 0) : eggAlveoles;
  const lotHasEggs = lotEggs > 0;

  const selectLot = (id: string) => {
    setLotId(id);
    setError(null);
    const b = sellable.find((x) => x.id === id);
    if (b && product === 'OEUF' && Math.max(b.metrics.eggStockAvailableEggs ?? 0, 0) <= 0) {
      setProduct('PIECE');
      setPrice(DEFAULT_PRICES.PIECE);
    }
  };

  const selectProduct = (key: OrderProductKey) => {
    if (key === 'OEUF') {
      const withEggs = sellable.find(
        (b) => Math.max(b.metrics.eggStockAvailableEggs ?? 0, 0) > 0,
      );
      if (!withEggs) {
        setError('Aucun lot pondeur avec des œufs disponibles.');
        setProduct('PIECE');
        setPrice(DEFAULT_PRICES.PIECE);
        return;
      }
      if (lotId !== withEggs.id) setLotId(withEggs.id);
    } else if (!lotId && sellable[0]) {
      setLotId(sellable[0].id);
    }
    setProduct(key);
    setPrice(DEFAULT_PRICES[key]);
    setWeightKgText('');
    setError(null);
  };

  const addItem = () => {
    if (qty <= 0) {
      setError('Indiquez une quantité.');
      return;
    }
    if (price <= 0) {
      setError('Indiquez un prix unitaire.');
      return;
    }
    if (product !== 'OEUF' && !lotId) {
      setError('Sélectionnez un lot.');
      return;
    }
    if (product !== 'OEUF' && orderLotId && orderLotId !== lotId) {
      setError('Une commande ne peut porter que sur un seul lot.');
      return;
    }
const kg = weightKg > 0 ? weightKg : Math.round(qty * DEFAULT_AVG_WEIGHT_KG * 100) / 100;
    const isKg = product === 'KG';
    const draft: DraftItem = {
      productType:
        product === 'PIECE' ? 'POULET_PIECE' :
        product === 'KG' ? 'POULET_KG' : 'OEUFS',
      label: productLabel(product === 'PIECE' ? 'POULET_PIECE' : product === 'KG' ? 'POULET_KG' : 'OEUFS'),
      quantity: isKg ? kg : qty,
      unitPriceFcfa: price,
      ...(product === 'OEUF' ? {} : { batchId: lotId }),
      ...(isKg ? { pieceCount: qty } : {}),
      unit: (product === 'PIECE' ? 'PIECE' : isKg ? 'KG' : 'ALVEOLES') as SaleUnit,
      amountFcfa: isKg ? Math.round(kg * price) : qty * price,
    };
    setItems((prev) => [...prev, draft]);
    setQty(0);
    setWeightKgText('');
    setError(null);
  };

  const onDeliveryAddressPick = (r: GeoSuggest) => {
    setAddress(r.label);
    setLatitude(r.latitude);
    setLongitude(r.longitude);
    setAddressSheetOpen(false);
  };

  const onDeliveryAddressManual = (text: string) => {
    setAddress(text);
    setLatitude(null);
    setLongitude(null);
    setAddressSheetOpen(false);
  };

  const submit = async () => {
    if (items.length === 0) {
      setError('Ajoutez au moins un article.');
      return;
    }
    if (lieu === 'PDV' && !pdvId) {
      setError('Sélectionnez le point de vente de retrait.');
      return;
    }
    if (lieu === 'LIVRAISON' && !address.trim()) {
      setError('Indiquez l’adresse de livraison.');
      return;
    }
    if (deposit > total) {
      setError('L’acompte ne peut pas dépasser le total.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const geoFallback =
        lieu === 'LIVRAISON' && latitude == null && address.trim().length > 0
          ? await geocodeGabonAddress({
              province: deliveryProvince ?? undefined,
              address: address.trim(),
            }).catch(() => null)
          : null;
      const deliveryLat = latitude ?? geoFallback?.latitude ?? null;
      const deliveryLng = longitude ?? geoFallback?.longitude ?? null;
      const res = await createOrderQueued(farmId, {
        ...(client
          ? { customerId: client.id }
          : {
              ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
              ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
            }),
        canal,
        expectedDate: toLocalDateString(expectedDate),
        ...(lieu === 'PDV' ? { pointOfSaleId: pdvId } : {}),
        ...(lieu === 'LIVRAISON'
          ? {
              address: address.trim(),
              ...(deliveryProvince ? { province: deliveryProvince } : {}),
              ...(deliveryLat != null ? { latitude: deliveryLat } : {}),
              ...(deliveryLng != null ? { longitude: deliveryLng } : {}),
            }
          : {}),
        ...(lieu !== 'LIVRAISON' && lieu !== 'PDV' && deliveryProvince ? { province: deliveryProvince } : {}),
        ...(deliveryLat != null ? { latitude: deliveryLat } : {}),
        ...(deliveryLng != null ? { longitude: deliveryLng } : {}),
        items: items.map((i) => ({
          productType: i.productType,
          label: i.label,
          quantity: i.quantity,
          unitPriceFcfa: i.unitPriceFcfa,
          batchId: i.batchId,
          pieceCount: i.pieceCount,
          unit: i.unit,
        })),
        ...(deposit > 0 ? { deposit: { amountFcfa: deposit } } : {}),
      });
      invalidateFarmQueries(queryClient, { farmId });
      onClose();
      if (res.status === 'queued') {
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création.');
      setBusy(false);
    }
  };

  const isKg = product === 'KG';
  const weightKg = parseFloat(weightKgText) || 0;
  const maxQty = product === 'OEUF' ? Math.max(lotAlveoles, 0) : lot?.quantityAlive ?? 1000;

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Nouvelle commande"
      subtitle="Bon de commande / précommande · réservation souple"
      icon={<ClipboardList size={22} color={color.brand[600]} />}>
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <SectionHeader
            icon={client ? Contact : UserPlus}
            title={client ? 'Client assigné' : 'Client de la commande'}
            subtitle={
              client
                ? 'Commande rattachée à ce client.'
                : 'Assignez un client existant ou saisissez un nouveau client.'
            }
            right={
              client ? (
                <Pressable
                  onPress={() => {
                    setPickerOpen(true);
                    setError(null);
                  }}
                  hitSlop={6}
                  accessibilityRole="button"
                  style={styles.clientAction}>
                  <Pencil size={13} color={color.brand[600]} />
                  <AppText size="small" weight="bold" color="brand">
                    Changer
                  </AppText>
                </Pressable>
              ) : undefined
            }
          />
          {client ? (
            <Card tone="brand" style={styles.orderClient}>
              <View style={styles.avatar}>
                <Image source={require('@/assets/images/logo-white.png')} style={styles.avatarLogo} accessibilityLabel="Logo KouKou" />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <AppText size="bodyM" weight="semibold" color="text" numberOfLines={1}>
                  {client.fullName}
                </AppText>
                <AppText size="caption" color="muted" numberOfLines={1}>
                  {[client.code, customerTypeLabel(client.type), client.phone].filter(Boolean).join(' · ') || 'Aucun contact'}
                </AppText>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 1 }}>
                <AppText size="small" weight="semibold" color="muted">
                  Solde
                </AppText>
                <AppText size="bodyM" weight="bold" color={(client.balance?.outstandingFcfa ?? 0) > 0 ? 'danger' : 'success'}>
                  {fmtFcfa(client.balance?.outstandingFcfa ?? 0)}
                </AppText>
              </View>
            </Card>
          ) : (
            <>
              <Pressable
                onPress={() => {
                  setPickerOpen(true);
                  setError(null);
                }}
                style={styles.clientPick}
                accessibilityRole="button">
                <UserPlus size={18} color={color.brand[600]} />
                <AppText size="body" weight="semibold" color="brand">
                  Choisir un client existant
                </AppText>
              </Pressable>
              <View style={styles.clientSeparator}>
                <View style={styles.clientSeparatorLine} />
                <AppText size="caption" color="faint">
                  ou nouveau client
                </AppText>
                <View style={styles.clientSeparatorLine} />
              </View>
              <View style={styles.twoCol}>
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <TextInput value={customerName} onChangeText={setCustomerName} placeholder="Nom (nouveau client)" placeholderTextColor={color.ink[300]} style={styles.input} />
                  <PhoneInput value={customerPhone} onChangeText={setCustomerPhone} compact />
                </View>
              </View>
            </>
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText size="label" color="muted">
            RETRAIT / LIVRAISON
          </AppText>
          <Segmented<OrderLieuKey>
            value={lieu}
            onChange={(l) => {
              setLieu(l);
              setError(null);
            }}
            options={[
              { key: 'FERME', label: 'À la ferme', tint: palette.brand[600] },
              { key: 'PDV', label: 'Point de vente', tint: palette.accent[600] },
              { key: 'LIVRAISON', label: 'Livraison', tint: palette.green[600] },
            ]}
          />
          <AppText size="caption" color="muted">
            {lieu === 'LIVRAISON'
              ? 'Livraison à une adresse — précommandez et choisissez la date de livraison.'
              : lieu === 'PDV'
                ? 'Retrait en boutique — précommandez et choisissez la date de retrait.'
                : 'Retrait à la ferme mère — précommandez et choisissez la date de retrait.'}
          </AppText>
        </View>

        {lieu === 'LIVRAISON' ? (
          <View style={{ gap: spacing.sm }}>
            <AppText size="label" color="muted">
              ADRESSE DE LIVRAISON
            </AppText>
            <Pressable
              onPress={() => setProvinceSheetOpen(true)}
              accessibilityRole="button"
              style={styles.inputWrap}>
              <View style={styles.inputIcon}>
                <MapPin size={18} color={color.ink[400]} />
              </View>
              <View style={styles.addressValue}>
                <AppText size="body" color={deliveryProvince ? 'text' : 'muted'} numberOfLines={1}>
                  {deliveryProvince || 'Province — ex. Estuaire'}
                </AppText>
              </View>
              <View style={styles.inputIcon}>
                <ChevronDown size={18} color={color.ink[400]} />
              </View>
            </Pressable>
            <Pressable
              onPress={() => setAddressSheetOpen(true)}
              accessibilityRole="button"
              style={styles.inputWrap}>
              <View style={styles.inputIcon}>
                <MapIcon size={18} color={color.ink[400]} />
              </View>
              <View style={styles.addressValue}>
                <AppText size="body" color={address ? 'text' : 'muted'} numberOfLines={1}>
                  {address || 'Adresse — rue, marché, repère'}
                </AppText>
              </View>
              {latitude != null && longitude != null ? (
                <Check size={16} color={palette.green[600]} style={styles.inputIcon} />
              ) : (
                <ChevronDown size={18} color={color.ink[400]} style={styles.inputIcon} />
              )}
            </Pressable>
          </View>
        ) : lieu === 'PDV' ? (
          <View style={{ gap: spacing.sm }}>
            <AppText size="label" color="muted">
              POINT DE VENTE
            </AppText>
            <View style={styles.rowWrap}>
              {pdvs.map((p) => (
                <Pressable key={p.id} onPress={() => { setPdvId(pdvId === p.id ? '' : p.id); setError(null); }} accessibilityRole="button">
                  <Chip label={p.name} tone="brand" selected={p.id === pdvId} />
                </Pressable>
              ))}
              {pdvs.length === 0 ? (
                <AppText size="caption" color="muted">
                  Aucun point de vente actif.
                </AppText>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <AppText size="label" color="muted">
            {canal === 'LIVRAISON' ? 'LIVRAISON PRÉVUE LE' : 'RETRAIT PRÉVU LE'}
          </AppText>
          <Pressable onPress={() => setShowDate(true)} style={styles.dateBtn} accessibilityRole="button">
            <CalendarDays size={16} color={color.brand[600]} />
            <AppText size="body" weight="semibold" color="text">
              {toLocalDateString(expectedDate).split('-').reverse().join('/')}
            </AppText>
          </Pressable>
          {showDate ? (
            <DateTimePicker
              value={expectedDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              onChange={(_e: DateTimePickerEvent, d?: Date) => {
                if (Platform.OS === 'android') setShowDate(false);
                if (d) setExpectedDate(d);
              }}
              locale="fr-FR"
            />
          ) : null}
        </View>

        {/* ── 1 · LOT & STOCK DISPONIBLE ────────────────────────── */}
        <View style={{ gap: spacing.sm }}>
          <StepTitle n={1} label="Lot & stock disponible" />
          {lot ? (
            <Card tone={notReady ? 'warn' : 'default'} style={styles.lotPanel}>
              <View style={styles.lotPanelHead}>
                <View style={styles.lotPanelIcon}>
                  {breedImageForLot(lot.breedName, lot.species) ? (
                    <Image
                      source={breedImageForLot(lot.breedName, lot.species) as number}
                      style={styles.lotPanelImg}
                    />
                  ) : (
                    <AppText size="h2" color="faint">
                      {SPECIES_ICONS[lot.species] ?? '🐔'}
                    </AppText>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText size="h3" weight="bold" color="text" numberOfLines={1}>
                    {lot.batchName}
                  </AppText>
                  <AppText size="small" color="muted">
                    {[lot.breedCode, lot.breedName, lot.type === 'CHAIR' ? 'Chair' : 'Pondeuse'].filter(Boolean).join(' · ') || '—'} · J{lot.metrics.ageDays}
                  </AppText>
                </View>
              </View>
              <View style={styles.stockRow}>
                <View style={styles.stockItem}>
                  <View style={[styles.stockDot, { backgroundColor: color.green[500] }]} />
                  <AppText size="small" weight="semibold" color="text">
                    {fmt(lot.quantityAlive)} vivant
                  </AppText>
                </View>
                {lotHasEggs ? (
                  <View style={styles.stockItem}>
                    <View style={[styles.stockDot, { backgroundColor: color.ink[400] }]} />
                    <AppText size="small" weight="semibold" color="text">
                      {fmt(lotEggs)} œufs · {fmt(lotAlveoles)} alv.
                    </AppText>
                  </View>
                ) : null}
              </View>
              {advisory ? (
                <AppText size="small" weight="semibold" color="danger" style={{ marginTop: spacing.xs }}>
                  {advisory}
                </AppText>
              ) : null}
            </Card>
          ) : (
            <Card tone="default" style={[styles.lotPanel, styles.lotPanelEmpty]}>
              <View style={styles.avatar}>
                <Image source={require('@/assets/images/logo-white.png')} style={styles.avatarLogo} accessibilityLabel="Logo KouKou" />
              </View>
              <AppText size="body" weight="semibold" color="muted">
                Sélectionner un lot
              </AppText>
            </Card>
          )}
          <AppText size="label" color="muted" style={{ marginTop: 2 }}>
            CHOISIR LE LOT
          </AppText>
          <View style={styles.rowWrap}>
            {sellable.map((b) => (
              <Pressable key={b.id} onPress={() => selectLot(b.id)} accessibilityRole="button">
                <Chip
                  label={`${b.batchName ?? b.id} · ${fmt(b.quantityAlive)}${Math.max(b.metrics.eggStockAvailableAlveoles ?? 0, 0) > 0 ? ` · ${fmt(Math.max(b.metrics.eggStockAvailableAlveoles ?? 0, 0))} alv.` : ''}`}
                  tone={b.status === 'EN_VENTE' ? 'green' : 'brand'}
                  selected={b.id === lotId}
                />
              </Pressable>
            ))}
            {sellable.length === 0 ? (
              <AppText size="caption" color="muted">
                Aucun lot disponible à la vente.
              </AppText>
            ) : null}
          </View>
        </View>

        {/* ── 2 · ARTICLE À AJOUTER ─────────────────────────────── */}
        <View style={{ gap: spacing.sm }}>
          <StepTitle n={2} label="Article à ajouter" />
          <View style={styles.catRow}>
            <Pressable onPress={() => selectProduct(product === 'OEUF' ? 'PIECE' : product)} accessibilityRole="button" style={styles.catTab}>
              <Chip
                label={`Sur pied · ${fmt(lot?.quantityAlive ?? 0)}`}
                tone={product !== 'OEUF' ? 'brand' : 'neutral'}
                selected={product !== 'OEUF'}
                style={styles.catChip}
              />
            </Pressable>
            {lotHasEggs ? (
              <Pressable onPress={() => selectProduct('OEUF')} accessibilityRole="button" style={styles.catTab}>
                <Chip
                  label={`Œufs · ${fmt(lotAlveoles)} alv.`}
                  tone={product === 'OEUF' ? 'brand' : 'neutral'}
                  selected={product === 'OEUF'}
                  style={styles.catChip}
                />
              </Pressable>
            ) : null}
          </View>
          {product === 'OEUF' ? (
            <AppText size="caption" color="muted">
              {fmt(lotEggs)} œufs disponibles sur ce lot · {fmt(lotAlveoles)} alvéole{lotAlveoles !== 1 ? 's' : ''} à vendre — vente par alvéole (30 œufs), prix unitaire = une alvéole.
            </AppText>
          ) : (
            <View style={styles.unitRow}>
              <Segmented<'PIECE' | 'KG'>
                value={isKg ? 'KG' : 'PIECE'}
                onChange={(u) => selectProduct(u)}
                options={[
                  { key: 'PIECE', label: 'À la pièce', tint: palette.brand[600] },
                  { key: 'KG', label: 'Au kg', tint: palette.accent[600] },
                ]}
              />
            </View>
          )}
        </View>

        {/* ── 3 · QUANTITÉ & PRIX ───────────────────────────────── */}
        <View style={{ gap: spacing.sm }}>
          <StepTitle n={3} label="Quantité & prix" />
          <Card tone="default" style={styles.detailCard}>
            <View style={styles.fieldBlock}>
              <View style={styles.fieldHead}>
                <AppText size="caption" weight="bold" color="muted">
                  QUANTITÉ
                </AppText>
                {maxQty > 0 && product !== 'OEUF' ? (
                  <AppText size="caption" weight="semibold" color="brand">
                    dispo : {fmt(maxQty)}
                  </AppText>
                ) : null}
              </View>
              <NumberInput
                value={qty > 0 ? String(qty) : ''}
                onChangeText={(t) => {
                  setQty(Math.min(parseInt(t, 10) || 0, Math.max(maxQty, 1)));
                  setError(null);
                }}
                suffix={ORDER_PRODUCTS.find((p) => p.key === product)?.unit}
                placeholder="0"
              />
              {isKg ? (
                <AppText size="caption" color="muted">
                  {fmt(qty)} oiseaux · seront décomptés du lot
                </AppText>
              ) : null}
              {isKg ? (
                <View style={{ gap: 4, marginTop: spacing.xs }}>
                  <View style={styles.fieldHead}>
                    <AppText size="caption" weight="bold" color="muted">
                      POIDS RÉEL PESÉ
                    </AppText>
                    <AppText size="caption" weight="semibold" color="brand">
                      requis pour le calcul
                    </AppText>
                  </View>
                  <NumberInput
                    value={weightKgText}
                    onChangeText={(t) => {
                      setWeightKgText(t);
                      setError(null);
                    }}
                    decimal
                    suffix="kg"
                    placeholder="0"
                  />
                  <AppText size="caption" color="muted">
                    {weightKg > 0
                      ? `Total = ${fmt(weightKg)} kg × ${fmt(price)} FCFA = ${fmt(Math.round(weightKg * price))} FCFA`
                      : `≈ ${fmt(Math.round(qty * DEFAULT_AVG_WEIGHT_KG * 100) / 100)} kg estimés — le décompte garde les ${fmt(qty)} oiseaux du lot`}
                  </AppText>
                </View>
              ) : null}
            </View>

            <View style={styles.fieldDivider} />

            <View style={styles.fieldBlock}>
              <View style={styles.fieldHead}>
                <AppText size="caption" weight="bold" color="muted">
                  PRIX UNITAIRE
                </AppText>
                {DEFAULT_PRICES[product] > 0 ? (
                  <Pressable
                    onPress={() => {
                      setPrice(DEFAULT_PRICES[product]);
                      setError(null);
                    }}
                    accessibilityRole="button">
                    <AppText size="caption" weight="semibold" color="brand">
                      conseillé : {fmt(DEFAULT_PRICES[product])} FCFA
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.priceField}>
                <AppText size="body" weight="bold" color="muted">
                  FCFA
                </AppText>
                <TextInput
                  value={price > 0 ? String(price) : ''}
                  onChangeText={(t) => {
                    const n = parseInt(t.replace(/\D/g, ''), 10);
                    setPrice(Number.isFinite(n) ? n : 0);
                    setError(null);
                  }}
                  placeholder="0"
                  placeholderTextColor={color.ink[300]}
                  keyboardType="number-pad"
                  style={styles.priceInput}
                />
                <AppText size="small" weight="semibold" color="muted">
                  / {isKg ? 'kg' : product === 'OEUF' ? 'alvéole' : 'pièce'}
                </AppText>
              </View>
            </View>
          </Card>
          <Button label="Ajouter l’article" tone="brand" size="md" disabled={qty <= 0 || price <= 0} onPress={addItem} />
        </View>

        {items.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <AppText size="label" color="muted">
              ARTICLES DE LA COMMANDE ({items.length})
            </AppText>
            {items.map((i, idx) => (
              <Card key={`${i.productType}-${idx}`} style={styles.draftRow}>
                <View style={{ flex: 1 }}>
                  <AppText size="body" weight="semibold" color="text" numberOfLines={1}>
                    {i.label}
                  </AppText>
                  <AppText size="small" color="muted">
                    {fmt(i.quantity)} {i.unit} × {fmt(i.unitPriceFcfa)}
                  </AppText>
                </View>
                <AppText size="body" weight="bold" color="text">
                  {fmt(i.amountFcfa)} FCFA
                </AppText>
                <Pressable onPress={() => setItems((prev) => prev.filter((_, n) => n !== idx))} hitSlop={8} accessibilityRole="button">
                  <Trash2 size={16} color={color.red[500]} />
                </Pressable>
              </Card>
            ))}
            <View style={styles.detailRow}>
              <AppText size="body" color="muted">
                Total de la commande
              </AppText>
              <AppText size="h3" weight="bold" color="accent">
                {fmtFcfa(total)}
              </AppText>
            </View>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <SectionHeader
            title="Acompte encaissé"
            subtitle="Encaissez maintenant un acompte (facultatif) — vide = aucun argent reçu."
            right={
              <AppText size="caption" weight="semibold" color={deposit > 0 ? (deposit === total ? 'green' : 'brand') : 'faint'}>
                {deposit === 0 ? 'aucun reçu' : deposit === total ? 'total réglé' : `${Math.round((deposit / total) * 100)} %`}
              </AppText>
            }
          />
          <TextInput
            value={deposit > 0 ? String(deposit) : ''}
            onChangeText={(t) => {
              const n = parseInt(t.replace(/\D/g, ''), 10);
              setDeposit(Number.isFinite(n) ? n : 0);
            }}
            placeholder="Montant reçu (FCFA) — vide si aucun acompte"
            placeholderTextColor={color.ink[300]}
            keyboardType="number-pad"
            style={[styles.input, styles.depositInput]}
          />
          <AppText size="caption" color="muted">
            {deposit > 0
              ? `Acompte reçu — commande confirmée dès l’encaissement. Reste ${fmtFcfa(Math.max(total - deposit, 0))} à la réception.`
              : 'Rien saisi = aucun acompte reçu — la commande se règle à la réception.'}
          </AppText>
        </View>

        {error ? (
          <AppText size="small" color="danger">
            {error}
          </AppText>
        ) : null}

        <Button label={deposit > 0 ? `Créer et encaisser ${fmt(deposit)} FCFA` : 'Créer la commande'} tone="accent" loading={busy} disabled={items.length === 0 || busy} onPress={() => void submit()} />
      </View>

      <ClientPickerSheet
        visible={pickerOpen}
        farmId={farmId}
        selectedId={client?.id}
        unselectLabel="Commander sans client"
        onSelect={(c) => {
          setClient(c);
          setError(null);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />

      <Sheet
        visible={provinceSheetOpen}
        onClose={() => setProvinceSheetOpen(false)}
        title="Province"
        subtitle="Sélectionnez la province au Gabon"
        icon={<MapPin size={22} color={color.brand[600]} />}>
        <View style={{ gap: spacing.sm }}>
          {GABON_PROVINCES.map((p) => (
            <Pressable
              key={p.name}
              onPress={() => {
                setDeliveryProvince(p.name);
                setProvinceSheetOpen(false);
              }}
              accessibilityRole="button"
              style={[
                styles.inputWrap,
                deliveryProvince === p.name
                  ? { borderColor: palette.brand[600], backgroundColor: palette.brand[50] }
                  : undefined,
              ]}>
              <View style={styles.provinceCell}>
                <AppText size="body" weight={deliveryProvince === p.name ? 'bold' : 'semibold'} color={deliveryProvince === p.name ? 'brand' : 'text'}>
                  {p.name}
                </AppText>
                <AppText size="caption" color="muted">
                  {p.capital}
                </AppText>
              </View>
              {deliveryProvince === p.name ? (
                <Check size={18} color={palette.brand[600]} style={{ paddingRight: 14 }} />
              ) : (
                <View style={{ width: 18, paddingRight: 14 }} />
              )}
            </Pressable>
          ))}
        </View>
      </Sheet>

      <AddressSearchSheet
        visible={addressSheetOpen}
        province={deliveryProvince}
        onPick={onDeliveryAddressPick}
        onManual={onDeliveryAddressManual}
        onClose={() => setAddressSheetOpen(false)}
      />
    </Sheet>
  );
}

export default function CommandesScreen() {
  const { farmId, user } = useAuth();
  const canManage = canManageFarm(user.role);
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const ordersQuery = useQuery({ queryKey: ['orders', farmId], queryFn: () => fetchOrders(farmId) });

  const list = ordersQuery.data ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: 0, PENDING: 0, CONFIRMED: 0, LIVRE: 0, CANCELLED: 0 };
    (ordersQuery.data ?? []).forEach((o) => {
      c.ALL++;
      c[o.status] = (c[o.status] ?? 0) + 1;
    });
    return c;
  }, [ordersQuery.data]);

  const filtered = useMemo(() => {
    let out = ordersQuery.data ?? [];
    if (filter !== 'ALL') out = out.filter((o) => o.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (o) =>
          o.referenceNumber.toLowerCase().includes(q) ||
          (o.customer?.fullName ?? '').toLowerCase().includes(q) ||
          (o.customer?.phone ?? '').toLowerCase().includes(q),
      );
    }
    return out;
  }, [ordersQuery.data, filter, search]);

  return (
    <Screen
      header={
        <ScreenHeader
          title="Commandes"
          subtitle="Précommandes & bons de commande"
          back
          right={
            canManage ? (
              <TapScale onPress={() => setCreateOpen(true)} style={styles.addBtn} accessibilityRole="button">
                <Plus size={22} color={color.surface} />
              </TapScale>
            ) : undefined
          }
        />
      }
      bottomPad={96}>
      {ordersQuery.isLoading ? (
        <Spinner label="Chargement des commandes…" />
      ) : (
        <View style={{ gap: spacing.lg }}>
          <OrderHero orders={list} />

          <View style={styles.searchRow}>
            <Search size={16} color={color.ink[300]} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher (réf., client, téléphone)…"
              placeholderTextColor={color.ink[300]}
              style={styles.searchInput}
              autoCorrect={false}
            />
          </View>

          <View style={styles.rowWrap}>
            {FILTERS.map((f) => (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} accessibilityRole="button">
                <Chip label={`${f.label} (${counts[f.key] ?? 0})`} tone={filter === f.key ? 'brand' : 'neutral'} selected={filter === f.key} />
              </Pressable>
            ))}
          </View>

          {filtered.length === 0 ? (
            <Animated.View entering={enter.fade()}>
              <Card tone="default">
                <AppText size="small" color="muted" style={{ textAlign: 'center' }}>
                  {search.trim()
                    ? 'Aucune commande ne correspond à cette recherche.'
                    : `Aucune commande ${filter === 'ALL' ? '' : `« ${orderStatusLabel(filter)} » `}pour le moment.`}
                </AppText>
              </Card>
            </Animated.View>
          ) : (
            <View style={{ gap: 10 }}>
              {filtered.map((o, i) => (
                <Animated.View key={o.id} entering={staggeredEnter(i)} layout={layout.list}>
                  <OrderCard order={o} />
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      )}

      {createOpen ? <CreateOrderSheet onClose={() => setCreateOpen(false)} /> : null}
    </Screen>
  );
}

function OrderCard({ order }: { order: OrderFull }) {
  const router = useRouter();
  const birds = order.items.reduce((a, i) => a + (i.pieceCount ?? 0), 0);
  const remaining = Math.max(order.totalAmountFcfa - order.depositFcfa, 0);
  const payRate = order.totalAmountFcfa > 0 ? Math.min(1, order.depositFcfa / order.totalAmountFcfa) : 0;
  const terminal = order.status === 'LIVRE' || order.status === 'CANCELLED';
  return (
    <Card onPress={() => router.push({ pathname: '/commande/[id]', params: { id: order.id } })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <View style={styles.avatar}>
          <Image source={require('@/assets/images/logo-white.png')} style={styles.avatarLogo} accessibilityLabel="Logo KouKou" />
        </View>
        <View style={{ flex: 1 }}>
          <AppText size="body" weight="bold" color="text" numberOfLines={1}>
            {order.customer?.fullName ?? 'Client non renseigné'}
          </AppText>
          <AppText size="caption" color="muted" style={{ fontFamily: Fonts.mono }}>
            {order.referenceNumber}
          </AppText>
        </View>
        <Chip label={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />
      </View>
      <AppText size="small" color="muted">
        {orderCanalLabel(order.canal)} · {order.batch?.batchName ?? 'Œufs'} · {order.items.length} article{order.items.length > 1 ? 's' : ''}
        {birds > 0 ? ` · ${fmt(birds)} volailles` : ''}
      </AppText>
      <View style={[styles.detailRow, { marginTop: 8 }]}>
        <AppText size="small" color="muted" numberOfLines={1} style={{ flex: 1 }}>
          {order.expectedDate ? `Prévu le ${order.expectedDate.split('-').reverse().join('/')}` : 'Date à convenir'} · Acompte {fmtFcfa(order.depositFcfa)}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppText size="body" weight="bold" color="accent">
            {fmtFcfa(order.totalAmountFcfa)}
          </AppText>
          <ChevronRight size={16} color={color.ink[300]} />
        </View>
      </View>
      {!terminal && order.depositFcfa > 0 ? (
        <>
          <View style={styles.microTrack}>
            <View style={[styles.microFill, { width: `${Math.round(payRate * 100)}%`, backgroundColor: remaining === 0 ? palette.green[500] : palette.accent[300] }]} />
          </View>
          <AppText size="caption" color="muted">
            {fmtFcfa(order.depositFcfa)} payés · reste {fmtFcfa(remaining)}
          </AppText>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: palette.brand[800],
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroCols: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  heroCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  heroBar: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  heroBarFill: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.accent[300],
  },
  heroSegments: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  segPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: color.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: color.ink[800],
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brand[600],
  },
  avatarLogo: {
    width: 22,
    height: 22,
  },
  microTrack: {
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: palette.ink[100],
    overflow: 'hidden',
    marginTop: 10,
  },
  microFill: {
    height: 5,
    borderRadius: radii.pill,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: color.ink[800],
    backgroundColor: color.surface,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: color.surface,
  },
  inputIcon: {
    paddingLeft: 12,
  },
  addressValue: {
    flex: 1,
    justifyContent: 'center',
    height: 42,
    paddingLeft: 10,
  },
  provinceCell: {
    flex: 1,
    gap: 1,
    paddingLeft: 14,
    height: 42,
    justifyContent: 'center',
  },
  twoCol: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  depositInput: {
    fontSize: 13,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailCard: {
    gap: spacing.sm,
    marginTop: 8,
  },
  fieldBlock: {
    gap: 4,
  },
  fieldHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
  },
  priceField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    height: 48,
  },
  priceInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: color.ink[900],
    textAlign: 'right',
    paddingVertical: 0,
  },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: color.surface,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: color.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: color.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotPanel: {
    gap: spacing.sm,
  },
  lotPanelEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  lotPanelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lotPanelIcon: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: color.surfaceAlt,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotPanelImg: {
    width: '100%',
    height: '100%',
  },
  stockRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  stockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.green[500],
  },
  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  catTab: {
    marginBottom: 2,
  },
  catChip: {
    marginBottom: 0,
  },
  unitRow: {
    marginTop: 8,
  },
  orderClient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
  },
  clientAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: palette.brand[50],
  },
  clientPick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.brand[300],
    backgroundColor: palette.brand[50],
  },
  clientSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 2,
  },
  clientSeparatorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
  },
});