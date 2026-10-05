import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Coins,
  Home,
  MapPin,
  ReceiptText,
  Settings2,
  ShoppingCart,
  Store,
  Trash2,
  TrendingUp,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { CaisseTab } from '@/components/pos/CaisseTab';
import { PosLineSheet } from '@/components/pos/PosLineSheet';
import { PosRegisterSheet } from '@/components/pos/PosRegisterSheet';
import { ReceiptPreviewSheet } from '@/components/pos/ReceiptPreviewSheet';
import { RecusTab } from '@/components/pos/RecusTab';
import { TransferSheet } from '@/components/pos/TransferSheet';
import { buildPosSaleItems, findPromotion, formatEggAlveoles, lineAmount, totalsFor } from '@/components/pos/helpers';
import { transferRemaining } from '@/components/pos/catalog';
import type { PosLine } from '@/components/pos/types';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchBatches,
  fetchCaisseCurrent,
  fetchStockTransfers,
  fetchDashboard,
  fetchFeedStock,
  fetchPointsOfSale,
  fetchPromotions,
  fetchSales,
  fetchSlaughterOrders,
} from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import { canManageFarm } from '@/api/roles';
import { SPECIES_ICONS, speciesLabel } from '@/api/format';
import { todayStr, type InvoiceFields } from '@/api/mutations';
import type { BatchWithMetrics, CaisseSummary, SaleSummary, StockTransfer } from '@/api/types';
import { queueCreditSale, queueSale, useOfflineQueue } from '@/offline';
import { breedImageForLot } from '@/constants/breedImages';
import { color, palette, radii, spacing, fmt, fmtFcfa } from '@/constants/theme';

/** Formatage œufs → alvéoles : "2 alvéoles", "1 alvéole + 5 œufs",
 *  "moins d'une alvéole" (reliquat < 30 œufs encore visible). */
export default function PosScreen() {
  const router = useRouter();
  const { farmId, farms, user } = useAuth();
  const queryClient = useQueryClient();
  const { batch, tab: tabParam } = useLocalSearchParams<{ batch?: string; tab?: string }>();
  const [activeTab, setActiveTab] = useState<'ENCAISSER' | 'CAISSE' | 'RECUS'>('ENCAISSER');
  const autoOpenDone = useRef(false);
  const today = todayStr();
  const canManage = canManageFarm(user.role);

  useEffect(() => {
    const p = String(tabParam ?? '').toUpperCase();
    setActiveTab(p === 'CAISSE' || p === 'RECUS' ? p : 'ENCAISSER');
  }, [tabParam]);

  const batchesQuery = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId) });
  const pdvQuery = useQuery({ queryKey: ['points-of-sale', farmId], queryFn: () => fetchPointsOfSale(farmId) });
  const slaughterQuery = useQuery({ queryKey: ['slaughter-orders', farmId], queryFn: () => fetchSlaughterOrders(farmId) });
  const promotionsQuery = useQuery({ queryKey: ['promotions', farmId], queryFn: () => fetchPromotions(farmId) });
  const transfersQuery = useQuery({ queryKey: ['stock-transfers', farmId], queryFn: () => fetchStockTransfers(farmId) });
  const salesQuery = useQuery({ queryKey: ['sales', farmId, today, today], queryFn: () => fetchSales(farmId, today, today) });
  const dashboardQuery = useQuery({ queryKey: ['dashboard', farmId], queryFn: () => fetchDashboard(farmId), staleTime: 30_000 });
  const feedStockQuery = useQuery({ queryKey: ['feed-stock', farmId], queryFn: () => fetchFeedStock(farmId) });
  const caisseQuery = useQuery({ queryKey: ['caisse', farmId], queryFn: () => fetchCaisseCurrent(farmId), staleTime: 15_000 });
  const queue = useOfflineQueue(farmId);

  const eggStockNow = dashboardQuery.data?.eggStock ?? null;

  const [pdvId, setPdvId] = useState('');
  const [lines, setLines] = useState<PosLine[]>([]);
  const [lineSheetOpen, setLineSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PosLine | undefined>(undefined);
  const [presetBatchId, setPresetBatchId] = useState<string | undefined>(undefined);
  const [presetTransferId, setPresetTransferId] = useState<string | undefined>(undefined);
  const [presetTransferProductType, setPresetTransferProductType] = useState<StockTransfer['productType'] | undefined>(undefined);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [previewSale, setPreviewSale] = useState<SaleSummary | null>(null);
  const [lotTypeFilter, setLotTypeFilter] = useState<'TOUS' | 'CHAIR' | 'PONDEUSE'>('TOUS');
  const [lotStockFilter, setLotStockFilter] = useState<'A_VENDRE' | 'FERMES' | 'TOUS'>('A_VENDRE');
  const [reserveTypeFilter, setReserveTypeFilter] = useState<'TOUS' | 'ABATTU' | 'OEUFS' | 'PROVENDE'>('TOUS');

  const lots = (batchesQuery.data ?? []).filter(
    (b) => b.quantityAlive > 0 && (b.status === 'EN_VENTE' || b.status === 'ACTIF'),
  );
  const closedLots = (batchesQuery.data ?? []).filter(
    (b) => b.quantityAlive <= 0 || b.status === 'FINI' || b.status === 'CLOTURE',
  );
  const pdvs = pdvQuery.data ?? [];
  const activePdvs = pdvs.filter((p) => p.isActive);
  const pdv = pdvs.find((p) => p.id === pdvId) ?? null;
  const isBoutique = pdv?.kind === 'BOUTIQUE';
  const allAbattuOrders = (slaughterQuery.data ?? []).filter(
    (p) => p.status === 'PROCESSED' && p.slaughterType === 'ABATTU',
  );
  const pools = allAbattuOrders.filter((p) => (p.carcassesAvailable ?? 0) > 0);
  const carcassesByBatch = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of allAbattuOrders) {
      map.set(p.batchId, (map.get(p.batchId) ?? 0) + (p.birdCount ?? 0));
    }
    return map;
  }, [allAbattuOrders]);
  // Filtres « Lots à vendre ». « En stock » : un lot de pondeuse a des œufs
  // (ou carcasses) à vendre ; un lot chair a des vivants ou des carcasses.
  // Sinon le lot est « épuisé » (cheptel seul).
  const isClosedBatch = (b: BatchWithMetrics) =>
    b.status === 'FINI' || b.status === 'CLOTURE' || b.quantityAlive <= 0;
  const hasCarcasses = (b: BatchWithMetrics) => (carcassesByBatch.get(b.id) ?? 0) > 0;
  const hasEggs = (b: BatchWithMetrics) => (b.metrics.eggStockAvailableEggs ?? 0) > 0;
  const lotInStock = (b: BatchWithMetrics) =>
    b.type === 'PONDEUSE' ? hasEggs(b) || hasCarcasses(b) : b.quantityAlive > 0 || hasCarcasses(b);
  const visibleLots = useMemo(() => {
    const typeOk = (b: BatchWithMetrics) =>
      lotTypeFilter === 'TOUS' ||
      (lotTypeFilter === 'CHAIR' ? b.type === 'CHAIR' : b.type === 'PONDEUSE');
    const pool =
      lotStockFilter === 'A_VENDRE'
        ? lots.filter(lotInStock)
        : lotStockFilter === 'FERMES'
          ? [...lots.filter((b) => !lotInStock(b)), ...closedLots]
          : [...lots, ...closedLots];
    return pool.filter(typeOk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, closedLots, carcassesByBatch, lotTypeFilter, lotStockFilter]);

  const totalVivants = lots.reduce((s, b) => s + b.quantityAlive, 0);
  const totalCarcasses = Array.from(carcassesByBatch.values()).reduce((s, n) => s + n, 0);
  const availAlveoles = eggStockNow?.availableAlveoles ?? 0;
  const transfers = useMemo(() => transfersQuery.data ?? [], [transfersQuery.data]);
  const activeReserves = transfers
    .filter((t) => t.status === 'TRANSFERRED')
    .map((t) => ({ ...t, remaining: transferRemaining(t.quantity, t.quantitySold) }))
    .filter((t) => t.remaining > 0);
  const abattuReserves = activeReserves.filter((t) => t.productType === 'ABATTU');
  const eggReserves = activeReserves.filter((t) => t.productType === 'OEUFS');
  const feedReserves = activeReserves.filter((t) => t.productType === 'PROVENDE');
  const visibleReserves =
    reserveTypeFilter === 'TOUS'
      ? activeReserves
      : activeReserves.filter((t) => t.productType === reserveTypeFilter);
  const transferTotal = abattuReserves.reduce((a, t) => a + t.remaining, 0);
  const otherReserves = feedReserves.reduce((a, t) => a + t.remaining, 0) + eggReserves.reduce((a, t) => a + t.remaining, 0);
  const abattuSentByBatch = useMemo(() => {
    const map = new Map<string, { qty: number; posName: string }[]>();
    for (const t of transfers) {
      if (t.productType !== 'ABATTU' || t.status !== 'TRANSFERRED' || !t.slaughterOrder?.batchId) continue;
      const batchId = t.slaughterOrder.batchId;
      const arr = map.get(batchId) ?? [];
      arr.push({ qty: t.quantity, posName: t.pointOfSale?.name ?? 'Boutique' });
      map.set(batchId, arr);
    }
    return map;
  }, [transfers]);
  const eggsSentByBatch = useMemo(() => {
    const map = new Map<string, { qty: number; posName: string }[]>();
    for (const t of transfers) {
      if (t.productType !== 'OEUFS' || t.status !== 'TRANSFERRED' || !t.batchId) continue;
      const arr = map.get(t.batchId) ?? [];
      arr.push({ qty: t.quantity, posName: t.pointOfSale?.name ?? 'Boutique' });
      map.set(t.batchId, arr);
    }
    return map;
  }, [transfers]);
  const feedLots = feedStockQuery.data?.lots ?? [];
  const activeFarm = farms.find((f) => f.id === farmId);
  const sacKg = activeFarm?.defaultSacKg ?? 50;
  const loading = batchesQuery.isLoading || pdvQuery.isLoading;

  const statsByPdv = useMemo(() => {
    const map = new Map<string, { revenue: number; count: number }>();
    for (const s of salesQuery.data ?? []) {
      if (s.status === 'CANCELLED' || !s.pointOfSaleId) continue;
      const cur = map.get(s.pointOfSaleId) ?? { revenue: 0, count: 0 };
      map.set(s.pointOfSaleId, { revenue: cur.revenue + s.totalAmountFcfa, count: cur.count + 1 });
    }
    return map;
  }, [salesQuery.data]);
  const myStat = pdv ? (statsByPdv.get(pdv.id) ?? { revenue: 0, count: 0 }) : { revenue: 0, count: 0 };
  const panierMoyen = myStat.count > 0 ? Math.round(myStat.revenue / myStat.count) : 0;

  // Nombre d'articles vendus aujourd'hui par lot (ventes non annulées) —
  // affiché sur la carte lot pour refléter l'activité du jour.
  const soldItemsByBatch = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of salesQuery.data ?? []) {
      if (s.status === 'CANCELLED') continue;
      for (const it of s.items ?? []) {
        if (!it.batchId) continue;
        map.set(it.batchId, (map.get(it.batchId) ?? 0) + 1);
      }
    }
    return map;
  }, [salesQuery.data]);

  const totals = totalsFor(lines, null);

  const caisseCurrent: CaisseSummary | null = caisseQuery.data ?? null;
  const caisseSessionOpen = caisseCurrent?.session?.status === 'OPEN';

  const mySales = useMemo<SaleSummary[]>(() => {
    const list = (salesQuery.data ?? []).filter((s) => s.status !== 'CANCELLED');
    const scoped = pdvId ? list.filter((s) => s.pointOfSaleId === pdvId) : list;
    return [...scoped].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }, [salesQuery.data, pdvId]);

  const refreshCaisse = () => {
    void queryClient.invalidateQueries({ queryKey: ['caisse', farmId] });
    void queryClient.invalidateQueries({ queryKey: ['caisse-sessions', farmId] });
  };

  const openReceiptForRef = (saleRef: string) => {
    const found = (salesQuery.data ?? []).find((s) => s.referenceNumber === saleRef);
    if (found) {
      setPreviewSale(found);
      return;
    }
    void queryClient.refetchQueries({ queryKey: ['sales', farmId, today, today] }).then(() => {
      const s = queryClient
        .getQueryData<SaleSummary[]>(['sales', farmId, today, today])
        ?.find((x) => x.referenceNumber === saleRef);
      if (s) setPreviewSale(s);
    });
  };

  useEffect(() => {
    if (pdvId !== '' || activePdvs.length !== 1) return;
    setPdvId(activePdvs[0].id);
  }, [pdvId, activePdvs]);

  useEffect(() => {
    if (autoOpenDone.current || !batch) return;
    const target = lots.find((b) => b.id === batch);
    if (!target) return;
    autoOpenDone.current = true;
    openNew(target);
  }, [batch, lots, loading]);

  const openNew = (batch?: BatchWithMetrics, transfer?: Pick<StockTransfer, 'id' | 'productType'>) => {
    setEditing(undefined);
    setPresetBatchId(batch?.id);
    setPresetTransferId(transfer?.id);
    setPresetTransferProductType(transfer?.productType);
    setLineSheetOpen(true);
  };

  const openEdit = (line: PosLine) => {
    setEditing(line);
    setPresetBatchId(undefined);
    setPresetTransferId(undefined);
    setPresetTransferProductType(undefined);
    setLineSheetOpen(true);
  };

  const selectPdv = (id: string) => {
    setPdvId(id);
    setLines([]);
  };

  const saveLine = (line: PosLine) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.uid === line.uid);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = line;
        return next;
      }
      return [...prev, line];
    });
  };

  const handleSell = async (input: {
    invoice?: InvoiceFields;
    promoCode?: string;
    pointOfSaleId?: string;
    paymentMode?: 'CASH' | 'CREDIT';
  }) => {
    const items = buildPosSaleItems(lines);
    const subTotal = totalsFor(lines, null).subtotalFcfa;
    const promo = input.promoCode?.trim() ? findPromotion(promotionsQuery.data ?? [], input.promoCode, subTotal) : null;
    const total = totalsFor(lines, promo).totalFcfa;
    const invoice: InvoiceFields | undefined = (() => {
      const base = input.invoice ?? {};
      if (promo) return { ...base, promoCode: promo.code };
      return Object.keys(base).length > 0 ? base : undefined;
    })();
    if (input.paymentMode === 'CREDIT') {
      if (!invoice?.customerId) {
        throw new Error('Sélectionnez un client enregistré pour vendre à crédit.');
      }
      const creditResult = await queueCreditSale(farmId, todayStr(), items, invoice, input.pointOfSaleId);
      if (creditResult.status === 'sent') {
        invalidateFarmQueries(queryClient, { farmId });
      }
      return creditResult;
    }
    const result = await queueSale(farmId, todayStr(), items, total, invoice, input.pointOfSaleId);
    if (result.status === 'sent') {
      invalidateFarmQueries(queryClient, { farmId });
    }
    return result;
  };

  const closeLineSheet = () => {
    setLineSheetOpen(false);
    setEditing(undefined);
    setPresetBatchId(undefined);
    setPresetTransferId(undefined);
  };

  const insightsBanner = isBoutique ? (
    <View style={styles.caHeroAccent}>
      <View style={styles.caHeroLabelRow}>
        <AppText size="small" weight="bold" color="text" numberOfLines={1}>
          CA AUJOURD’HUI
        </AppText>
        <AppText size="small" weight="semibold" color="text" numberOfLines={1} style={{ flexShrink: 1 }}>
          · {pdv?.name}
        </AppText>
      </View>
      <View style={styles.caHeroRow}>
        <View style={{ flex: 1 }}>
          <AppText size="h2" weight="bold" color="text">
            {fmt(myStat.revenue)}
          </AppText>
          <AppText size="small" color="text">FCFA</AppText>
        </View>
        <View style={styles.caHeroDivider} />
        <View style={styles.caHeroStat}>
          <AppText size="h3" weight="bold" color="text">
            {fmt(myStat.count)}
          </AppText>
          <AppText size="small" weight="semibold" color="text">tickets</AppText>
        </View>
        <View style={styles.caHeroDivider} />
        <View style={styles.caHeroStat}>
          <AppText size="h3" weight="bold" color="text">
            {fmt(panierMoyen)}
          </AppText>
          <AppText size="small" weight="semibold" color="text">panier moy.</AppText>
        </View>
      </View>
    </View>
  ) : (
    <View style={styles.caHeroBrand}>
      <View style={styles.caHeroRow}>
        <View style={{ flex: 1 }}>
          <AppText size="small" weight="bold" color="text">
            CA AUJOURD’HUI
          </AppText>
          <AppText size="h2" weight="bold" color="text">
            {fmt(myStat.revenue)}
          </AppText>
          <AppText size="small" color="text">FCFA</AppText>
        </View>
        <View style={styles.caHeroDivider} />
        <View style={styles.caHeroStat}>
          <AppText size="h3" weight="bold" color="text">
            {fmt(myStat.count)}
          </AppText>
          <AppText size="small" weight="semibold" color="text">tickets</AppText>
        </View>
        <View style={styles.caHeroDivider} />
        <View style={styles.caHeroStat}>
          <AppText size="h3" weight="bold" color="text">
            {fmt(panierMoyen)}
          </AppText>
          <AppText size="small" weight="semibold" color="text">panier moy.</AppText>
        </View>
      </View>
      <AppText size="small" weight="semibold" color="text" style={{ marginTop: spacing.xs }}>
        {fmt(totalVivants)} vivants (total) · {fmt(lots.length)} lots · {fmt(totalCarcasses)} carcasses · {fmt(availAlveoles)} alvéoles
      </AppText>
    </View>
  );

  const landingView = (
    <View style={styles.landing}>
      <View style={styles.landingHero}>
        <AppText size="h2" weight="bold" color="text">
          Où vendez-vous aujourd’hui ?
        </AppText>
        <AppText size="small" color="muted">
          Le point de vente détermine les produits affichés, les prix conseillés et vos insights du jour.
        </AppText>
      </View>
      <View style={{ gap: spacing.md }}>
        {activePdvs.map((p) => {
          const stat = statsByPdv.get(p.id) ?? { revenue: 0, count: 0 };
          const isFerm = p.kind === 'FERME';
          return (
            <Card key={p.id} tone={isFerm ? 'brand' : 'accent'} onPress={() => selectPdv(p.id)} style={styles.pdvCard}>
              <View style={[styles.pdvIcon, { backgroundColor: isFerm ? color.brand[50] : color.accent[50] }]}>
                {isFerm ? <Home size={22} color={color.brand[600]} /> : <Store size={22} color={color.accent[700]} />}
              </View>
              <View style={{ flex: 1 }}>
                <AppText size="h3" weight="bold" color="text">
                  {p.name}
                </AppText>
                <AppText size="small" color="muted" numberOfLines={2}>
                  {isFerm
                    ? 'Vente à la ferme · volaille vivante, œufs, carcasses abattoir'
                    : 'Boutique externe · stock transféré (carcasses, œufs, provende)'}
                </AppText>
                <AppText size="h3" weight="bold" color="text" style={{ marginTop: 2 }}>
                  {fmt(stat.revenue)} FCFA
                </AppText>
                <AppText size="small" color="muted">
                  {fmt(stat.count)} ticket(s) aujourd’hui
                </AppText>
              </View>
              <ChevronRight size={20} color={color.ink[300]} />
            </Card>
          );
        })}
        {activePdvs.length === 0 ? (
          <Card tone="default">
            <EmptyState
              emoji="🏪"
              title="Aucun point de vente actif"
              description="Activez ou créez un point de vente pour commencer à encaisser."
            />
          </Card>
        ) : null}
      </View>
      <AppText size="caption" color="faint" style={{ textAlign: 'center', marginTop: spacing.md }}>
        <TrendingUp size={12} color={color.ink[300]} /> Les insights suivent le point de vente sélectionné.
      </AppText>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {router.canGoBack() ? (
            <Pressable onPress={() => router.back()} style={styles.settingsBtn} accessibilityRole="button">
              <ChevronLeft size={22} color={color.ink[700]} />
            </Pressable>
          ) : null}
          <Image source={require('@/assets/images/logo-nav.png')} style={styles.headerLogo} accessibilityLabel="Logo KouKou" />
          <View style={{ flex: 1 }}>
            <AppText size="h2" weight="bold" color="text">
              Point de vente
            </AppText>
            <AppText size="caption" color="muted">
              POS · espèces {queue.pending.length > 0 ? `· ${fmt(queue.pending.length)} en attente` : ''}
            </AppText>
          </View>
          <Pressable onPress={() => router.push('/points-vente')} style={styles.settingsBtn} accessibilityRole="button">
            <Settings2 size={20} color={color.ink[600]} />
          </Pressable>
        </View>

        {pdv ? (
          <>
            <View style={styles.pdvRow}>
              <MapPin size={14} color={pdv.kind === 'BOUTIQUE' ? color.accent[600] : color.brand[600]} />
              <View style={{ flex: 1 }}>
                <AppText size="body" weight="bold" color="text" numberOfLines={1}>
                  {pdv.name}
                </AppText>
                <AppText size="caption" color="muted">
                  {pdv.kind === 'BOUTIQUE' ? 'Boutique · stock transféré depuis la ferme' : 'Ferme · volaille vivante + abattoir'}
                </AppText>
              </View>
            </View>
            <View style={styles.pdvSwitchRow}>
              {activePdvs.map((p) => {
                const isActive = p.id === pdvId;
                return (
                  <Pressable key={p.id} onPress={() => selectPdv(p.id)} hitSlop={6} accessibilityRole="button">
                    <Chip
                      label={`${p.name}`}
                      tone={
                        isActive
                          ? p.kind === 'BOUTIQUE'
                            ? 'accent'
                            : 'brand'
                          : 'neutral'
                      }
                      selected={isActive}
                      style={styles.chip}
                    />
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <View style={styles.pdvRow}>
            <MapPin size={14} color={color.ink[400]} />
            <AppText size="body" color="muted">
              Aucun point de vente sélectionné
            </AppText>
          </View>
        )}

        <View style={styles.tabRow}>
          <Segmented
            options={[
              { key: 'ENCAISSER', label: 'Encaisser', icon: <ShoppingCart size={13} color={color.ink[500]} /> },
              { key: 'CAISSE', label: 'Caisse', icon: <Coins size={13} color={color.ink[500]} /> },
              { key: 'RECUS', label: 'Reçus', icon: <ReceiptText size={13} color={color.ink[500]} /> },
            ]}
            value={activeTab}
            onChange={setActiveTab}
            haptic
          />
        </View>
        {caisseCurrent ? (
          <Pressable onPress={() => setActiveTab('CAISSE')} style={styles.caisseLine} accessibilityRole="button">
            <Coins size={14} color={caisseSessionOpen ? color.green[600] : color.ink[400]} />
            <AppText size="small" weight="semibold" color={caisseSessionOpen ? 'success' : 'muted'} numberOfLines={1}>
              Caisse {caisseSessionOpen ? `ouverte · ${fmtFcfa(caisseCurrent.expectedBalanceFcfa)} FCFA` : 'fermée'}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {activeTab === 'ENCAISSER' ? (
        pdvId === '' ? (
          loading ? (
            <View style={styles.center}>
              <Spinner />
            </View>
          ) : (
            landingView
          )
        ) : (
          <>
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
            {!isBoutique ? (
              <Pressable onPress={() => setTransferOpen(true)} style={styles.transferBtn} accessibilityRole="button">
                <ArrowRightLeft size={14} color={color.accent[600]} />
                <AppText size="small" weight="semibold" color="accent" numberOfLines={1}>
                  Envoyer du Stock à une boutique
                </AppText>
                <ChevronRight size={14} color={color.accent[400]} />
              </Pressable>
            ) : (
              <Pressable onPress={() => setTransferOpen(true)} style={styles.transferBtn} accessibilityRole="button">
                <ArrowRightLeft size={14} color={color.accent[600]} />
                <AppText size="small" weight="semibold" color="accent" numberOfLines={1}>
                  Réapprovisionner cette boutique
                </AppText>
                <ChevronRight size={14} color={color.accent[400]} />
              </Pressable>
            )}

            <View style={{ height: spacing.md }} />
            {insightsBanner}

            {isBoutique ? (
              <>
                <View style={[styles.sectionTitle, { marginTop: spacing.lg }]}> 
                  <AppText size="label" color="muted">
                    RÉSERVES EN BOUTIQUE À VENDRE
                  </AppText>
                </View>
                <View style={styles.filtersCol}>
                  <Segmented
                    options={[
                      { key: 'TOUS', label: 'Tous' },
                      { key: 'ABATTU', label: 'Abattu' },
                      { key: 'OEUFS', label: 'Œufs' },
                      { key: 'PROVENDE', label: 'Provende' },
                    ]}
                    value={reserveTypeFilter}
                    onChange={setReserveTypeFilter}
                  />
                  <AppText size="caption" color="faint">
                    {visibleReserves.length} réserve{visibleReserves.length > 1 ? 's' : ''} à vendre
                  </AppText>
                </View>
                <View style={styles.filterRow}>
                  {eggReserves.length > 0 ? (
                    <Chip label={`${fmt(eggReserves.reduce((a, t) => a + t.remaining, 0))} Alvéoles`} tone="green" />
                  ) : null}
                  {abattuReserves.length > 0 ? (
                    <Chip label={`${fmt(transferTotal)} carcasses`} tone="accent" />
                  ) : null}
                  {feedReserves.length > 0 ? (
                    <Chip label={`${fmt(otherReserves)} ${feedReserves[0]?.unit === 'KG' ? 'kg' : 'sacs'} provende`} tone="neutral" />
                  ) : null}
                </View>
              </>
            ) : (
              <>
                <View style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
                  <AppText size="label" color="muted">
                    LOTS À VENDRE
                  </AppText>
                </View>
                <View style={styles.filtersCol}>
                  <Segmented
                    options={[
                      { key: 'TOUS', label: 'Tous' },
                      { key: 'CHAIR', label: 'Chair' },
                      { key: 'PONDEUSE', label: 'Pondeuse' },
                    ]}
                    value={lotTypeFilter}
                    onChange={setLotTypeFilter}
                  />
<Segmented
                  options={[
                    { key: 'A_VENDRE', label: 'À vendre' },
                    { key: 'FERMES', label: 'Fermés' },
                    { key: 'TOUS', label: 'Tous' },
                  ]}
                  value={lotStockFilter}
                  onChange={setLotStockFilter}
                />
                  <AppText size="caption" color="faint">
                    {visibleLots.length} lot{visibleLots.length > 1 ? 's' : ''} affiché{visibleLots.length > 1 ? 's' : ''}
                  </AppText>
                </View>
              </>
            )}

            {isBoutique ? (
              <View style={{ gap: spacing.sm }}>
                {visibleReserves.map((t) => {
                  const unit =
                    t.productType === 'OEUFS'
                      ? 'Alvéoles'
                      : t.productType === 'PROVENDE'
                        ? t.unit === 'KG'
                          ? 'kg'
                          : 'sacs'
                        : 'carcasses';
                  const title =
                    t.productType === 'PROVENDE'
                      ? (t.inputLot?.productName ?? 'Provende')
                      : (t.slaughterOrder?.batch?.batchName ?? t.batch?.batchName ?? t.batchId ?? 'Lot');
                  const dateShort = t.createdAt.slice(0, 10);
                  const detail =
                    t.productType === 'OEUFS'
                      ? `${speciesLabel(t.batch?.species)} · ${dateShort}`
                      : t.productType === 'PROVENDE'
                        ? `${fmt(t.remaining)} ${t.unit === 'KG' ? 'kg' : 'sac(s)'} · ${dateShort}`
                        : `${speciesLabel(t.slaughterOrder?.batch?.species)} · ${dateShort}`;
                  const reserveBatch = t.productType !== 'PROVENDE'
                    ? (t.slaughterOrder?.batch ?? t.batch)
                    : null;
                  const breedCode =
                    reserveBatch?.breedCode ?? reserveBatch?.breed?.refCode ?? null;
                  const breedName =
                    reserveBatch?.breedName ??
                    reserveBatch?.breed?.name ??
                    reserveBatch?.customBreed ??
                    null;
                  const reserveImg = reserveBatch
                    ? breedImageForLot(breedName, reserveBatch.species)
                    : null;
                  const soucheLine = reserveBatch
                    ? [breedCode, breedName, reserveBatch.type === 'CHAIR' ? 'Chair' : 'Pondeuse'].filter(Boolean).join(' · ') || '—'
                    : null;
                  return (
                    <Card key={t.id} tone="warn" onPress={() => openNew(undefined, t)} style={styles.reserveCard}>
                      {reserveImg ? (
                        <Image source={reserveImg} style={styles.reserveImg} />
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <AppText size="body" weight="semibold" color="text">
                          {title}
                        </AppText>
                        {soucheLine ? (
                          <AppText size="small" color="muted">
                            {soucheLine}
                          </AppText>
                        ) : null}
                        <AppText size="small" color="muted">
                          {detail}
                        </AppText>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <AppText size="body" weight="bold" color="accent">
                          {fmt(t.remaining)} {unit}
                        </AppText>
                        <Chip label="Vendre" tone="accent" />
                      </View>
                      <ChevronRight size={18} color={color.ink[300]} />
                    </Card>
                  );
                })}
                {visibleReserves.length === 0 ? (
                  <Card tone="default">
                    <EmptyState
                      emoji="📦"
                      title={activeReserves.length === 0 ? 'Aucun stock en boutique' : 'Aucune réserve dans ce filtre'}
                      description={
                        activeReserves.length === 0
                          ? 'Réapprovisionnez des carcasses, œufs ou provende depuis la ferme.'
                          : 'Choisissez une autre catégorie ci-dessus pour voir les réserves à vendre.'
                      }
                    />
                  </Card>
                ) : null}
              </View>
            ) : (
              <>
                <View style={styles.lotList}>
                  {visibleLots.map((b) => {
                    const ready = b.status === 'EN_VENTE' || b.metrics.readyForSale;
                    const closed = isClosedBatch(b);
                    const lotImg = breedImageForLot(b.breedName, b.species);
                    const abattuCarc = carcassesByBatch.get(b.id) ?? 0;
                    const abattuSent = abattuSentByBatch.get(b.id) ?? [];
                    const totalAbattuSent = abattuSent.reduce((a, s) => a + s.qty, 0);
                    const eggsSent = eggsSentByBatch.get(b.id) ?? [];
                    const totalEggsSent = eggsSent.reduce((a, s) => a + s.qty, 0);
                    const oeufsDispo = b.metrics.eggStockAvailableEggs ?? 0;
                    const eggCollected = b.metrics.eggBreakdown?.collected ?? b.metrics.eggsCollectedTotal ?? 0;
                    const lotSoldItems = soldItemsByBatch.get(b.id) ?? 0;
                    return (
                      <Card
                        key={b.id}
                        onPress={closed ? undefined : () => openNew(b)}
                        style={[styles.lotCardH, closed && styles.lotCardClosed]}>
                        {lotImg ? (
                          <Image source={lotImg} style={styles.lotThumbH} />
                        ) : (
                          <View style={[styles.lotThumbH, styles.lotThumbFallback]}>
                            <AppText size="h2" color="faint">
                              {SPECIES_ICONS[b.species] ?? '🐔'}
                            </AppText>
                          </View>
                        )}
                        <View style={styles.lotCardBody}>
                          <View style={styles.lotCardTop}>
                            <AppText size="body" weight="bold" color="text" numberOfLines={1}>
                              {b.batchName ?? 'Lot'}
                            </AppText>
                            <View style={styles.lotAgeBadge}>
                              <AppText size="small" weight="bold" color="brand">
                                J{b.metrics.ageDays}
                              </AppText>
                            </View>
                          </View>
                          <AppText size="small" color="muted" numberOfLines={1}>
                            {[b.breedCode, b.breedName, b.type === 'CHAIR' ? 'Chair' : 'Pondeuse'].filter(Boolean).join(' · ') || '—'}
                          </AppText>
                          <View style={styles.lotMetricsH}>
                            <View style={styles.lotMetricH}>
                              <View style={styles.lotMetricDot} />
                              <AppText size="small" weight="semibold" color="text">
                                {fmt(b.quantityAlive)} vivant
                              </AppText>
                            </View>
                            {abattuCarc > 0 ? (
                              <View style={styles.lotMetricH}>
                                <View style={[styles.lotMetricDot, { backgroundColor: color.accent[500] }]} />
                                <AppText size="small" weight="semibold" color="accent">
                                  {fmt(abattuCarc)} abattu
                                </AppText>
                              </View>
                            ) : null}
                          </View>
                          {eggCollected > 0 || oeufsDispo > 0 ? (
                            <>
                              <View style={styles.lotMetricsH}>
                                <View style={styles.lotMetricH}>
                                  <View style={[styles.lotMetricDot, { backgroundColor: color.ink[400] }]} />
                                  <AppText size="small" weight="semibold" color="text">
                                    {eggCollected > 0
                                      ? `${fmt(eggCollected)} œufs produits`
                                      : `${fmt(oeufsDispo)} œufs`}
                                  </AppText>
                                </View>
                              </View>
                              <View style={styles.lotMetricsH}>
                                <View style={styles.lotMetricH}>
                                  <View style={[styles.lotMetricDot, { backgroundColor: palette.green[600] }]} />
                                  <AppText size="small" weight="semibold" color="success">
                                    {oeufsDispo > 0
                                      ? `${fmt(oeufsDispo)} œufs disponibles · ${formatEggAlveoles(oeufsDispo)}`
                                      : 'aucun œuf disponible'}
                                  </AppText>
                                </View>
                              </View>
                            </>
                          ) : null}
                          {totalAbattuSent > 0 ? (
                            <AppText size="small" color="accent">
                              {fmt(totalAbattuSent)} abattu envoyé à {abattuSent.map((s) => s.posName).join(', ')}
                            </AppText>
                          ) : null}
                          {totalEggsSent > 0 ? (
                            <AppText size="small" color="muted">
                              {fmt(totalEggsSent * 30)} œufs envoyés à {eggsSent.map((s) => s.posName).join(', ')}
                            </AppText>
                          ) : null}
                          {lotSoldItems > 0 ? (
                            <AppText size="small" weight="semibold" color="text">
                              {fmt(lotSoldItems)} article{lotSoldItems > 1 ? 's' : ''} vendu{lotSoldItems > 1 ? 's' : ''} aujourd’hui
                            </AppText>
                          ) : null}
                          <View style={styles.lotFootH}>
                            <Chip
                              label={b.type === 'CHAIR' ? 'Chair' : 'Pondeuse'}
                              tone={b.type === 'CHAIR' ? 'brand' : 'green'}
                            />
                            {closed ? <Chip label="Fermé" tone="neutral" /> : ready ? <Chip label="Prêt" tone="green" /> : null}
                          </View>
                        </View>
                        <ChevronRight size={18} color={color.ink[300]} />
                      </Card>
                    );
                  })}
                  {visibleLots.length === 0 ? (
                    <Card tone="default" style={{ width: '100%' }}>
                      <EmptyState
                        emoji="\uD83D\uDC14"
                        title={
                          lotStockFilter === 'FERMES'
                            ? 'Aucun lot fermé'
                            : lotStockFilter === 'TOUS'
                              ? 'Aucun lot'
                              : 'Aucun lot à vendre'
                        }
                        description="Créez ou réactivez un lot avec des oiseaux vivants pour commencer à encaisser."
                      />
                    </Card>
                  ) : null}
                </View>



              </>
            )}

            {lines.length > 0 ? (
              <>
                <View style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
                  <AppText size="label" color="muted">
                    PANIER · {fmt(lines.length)} ARTICLE{lines.length > 1 ? 'S' : ''}
                  </AppText>
                </View>
                <View style={{ gap: spacing.sm }}>
                  {lines.map((l) => (
                    <Card key={l.uid} onPress={() => openEdit(l)} style={styles.cartCard}>
                      <View style={{ flex: 1 }}>
                        <AppText size="body" weight="semibold" color="text" numberOfLines={1}>
                          {l.label}
                        </AppText>
                        <AppText size="small" color="muted" numberOfLines={1}>
                          {[
                            l.batchId ? (lots.find((b) => b.id === l.batchId)?.batchName ?? 'Lot') : '',
                            `${fmt(l.qty)}${l.product === 'KG' || l.product === 'ABATTU_KG' ? ' oiseaux' : ''}`,
                            l.weightKg != null ? `${fmt(l.weightKg)} kg` : '',
                            `${fmt(l.unitPriceFcfa)} FCFA`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </AppText>
                      </View>
                      <AppText size="body" weight="bold" color="accent">
                        {fmt(lineAmount(l))} FCFA
                      </AppText>
                      <Pressable
                        onPress={() => setLines((prev) => prev.filter((x) => x.uid !== l.uid))}
                        hitSlop={8}
                        style={styles.deleteBtn}
                        accessibilityRole="button">
                        <Trash2 size={18} color={color.red[500]} />
                      </Pressable>
                    </Card>
                  ))}
                </View>
              </>
            ) : null}
            </ScrollView>

          <View style={styles.bottomBar}>
            <View style={styles.bottomBarTotal}>
              <AppText size="small" color="muted" style={{ letterSpacing: 0.5 }}>
                TOTAL
              </AppText>
              <AppText size="h3" weight="bold" color={lines.length > 0 ? 'text' : 'faint'} numberOfLines={1} adjustsFontSizeToFit>
                {lines.length > 0 ? fmtFcfa(totals.totalFcfa) : '0 FCFA'}
              </AppText>
            </View>
            <Button
              label="Encaisser"
              tone="accent"
              icon={ShoppingCart}
              size="sm"
              disabled={lines.length === 0}
              onPress={() => setRegisterOpen(true)}
            />
          </View>


        </>
        )
      ) : null}

      {activeTab === 'CAISSE' ? (
        <CaisseTab
          farmId={farmId}
          current={caisseCurrent}
          loading={caisseQuery.isLoading}
          canManage={canManage}
          onChanged={refreshCaisse}
        />
      ) : null}

      {activeTab === 'RECUS' ? (
        <RecusTab sales={mySales} subtitle={pdvId ? pdv?.name : 'Toute la ferme'} onSelectSale={setPreviewSale} />
      ) : null}

      <PosLineSheet
        visible={lineSheetOpen}
        lots={lots}
        pools={pools}
        transfers={isBoutique ? transfers : undefined}
        posKind={pdv?.kind}
        eggStock={dashboardQuery.data?.eggStock ?? null}
        committed={lines}
        initial={editing}
        presetBatchId={presetBatchId}
        presetTransferId={presetTransferId}
        presetTransferProductType={presetTransferProductType}
        onSave={saveLine}
        onClose={closeLineSheet}
      />
      <PosRegisterSheet
        visible={registerOpen}
        farmId={farmId}
        lines={lines}
        promotions={promotionsQuery.data ?? []}
        pdvName={pdv?.name ?? 'Ferme'}
        pointOfSaleId={pdv?.id}
        onSell={handleSell}
        onSettled={() => setLines([])}
        onShowReceipt={openReceiptForRef}
        onClose={() => setRegisterOpen(false)}
      />
      <ReceiptPreviewSheet
        visible={previewSale !== null}
        sale={previewSale}
        farmName={activeFarm?.name}
        pdvName={
          previewSale?.pointOfSaleId
            ? pdvs.find((p) => p.id === previewSale.pointOfSaleId)?.name
            : undefined
        }
        onClose={() => setPreviewSale(null)}
      />
      <TransferSheet
        visible={transferOpen}
        farmId={farmId}
        pools={pools}
        lots={lots}
        feedLots={feedLots}
        eggStock={dashboardQuery.data?.eggStock ?? null}
        sacKg={sacKg}
        boutiques={activePdvs.filter((p) => p.kind === 'BOUTIQUE')}
        transfers={transfers}
        onChanged={() => invalidateFarmQueries(queryClient, { farmId })}
        onClose={() => setTransferOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.paper,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: {
    width: 32,
    height: 32,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pdvSwitchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    marginBottom: 2,
  },
  tabRow: {
    marginTop: spacing.xs,
  },
  caisseLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  landing: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  landingHero: {
    gap: 4,
    marginBottom: spacing.sm,
  },
  pdvCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pdvIcon: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  bodyContent: {
    paddingBottom: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: color.accent[50],
    borderWidth: 1,
    borderColor: color.accent[200],
    alignSelf: 'flex-start',
  },
  caHeroBrand: {
    backgroundColor: color.brand[600],
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  caHeroAccent: {
    backgroundColor: color.accent[500],
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  caHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  caHeroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.xs,
  },
  caHeroDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: spacing.md,
  },
  caHeroStat: {
    alignItems: 'center',
    minWidth: 56,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  lotList: {
    gap: spacing.sm,
  },
  filtersCol: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  lotCardH: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  lotCardClosed: {
    opacity: 0.58,
  },
  lotThumbH: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  lotThumbFallback: {
    backgroundColor: color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotCardBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  lotCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  lotAgeBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: color.brand[50],
  },
  lotMetricsH: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xxs,
  },
  lotMetricH: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  lotMetricDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: color.green[500],
  },
  lotFootH: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xxs,
  },
  reserveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reserveImg: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ctaIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: color.accent[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: color.red[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    backgroundColor: palette.surface,
  },
  bottomBarTotal: {
    flex: 1,
    alignItems: 'flex-start',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },

});