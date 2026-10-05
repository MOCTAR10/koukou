import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Home,
  MapPin,
  Plus,
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
import { Spinner } from '@/components/ui/Spinner';
import { PosLineSheet } from '@/components/pos/PosLineSheet';
import { PosRegisterSheet } from '@/components/pos/PosRegisterSheet';
import { TransferSheet } from '@/components/pos/TransferSheet';
import { buildPosSaleItems, findPromotion, lineAmount, totalsFor } from '@/components/pos/helpers';
import { transferRemaining } from '@/components/pos/catalog';
import type { PosLine } from '@/components/pos/types';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchBatches,
  fetchStockTransfers,
  fetchDashboard,
  fetchFeedStock,
  fetchPointsOfSale,
  fetchPromotions,
  fetchSales,
  fetchSlaughterOrders,
} from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import { SPECIES_ICONS, speciesLabel } from '@/api/format';
import { todayStr, type InvoiceFields } from '@/api/mutations';
import type { BatchWithMetrics, StockTransfer } from '@/api/types';
import { queueSale, useOfflineQueue } from '@/offline';
import { color, palette, radii, spacing, fmt, fmtFcfa } from '@/constants/theme';

function lotTitle(b: BatchWithMetrics): string {
  return b.customSpecies ?? speciesLabel(b.species);
}

export default function PosScreen() {
  const router = useRouter();
  const { farmId, farms } = useAuth();
  const queryClient = useQueryClient();
  const { batch } = useLocalSearchParams<{ batch?: string }>();
  const autoOpenDone = useRef(false);
  const today = todayStr();

  const batchesQuery = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId) });
  const pdvQuery = useQuery({ queryKey: ['points-of-sale', farmId], queryFn: () => fetchPointsOfSale(farmId) });
  const slaughterQuery = useQuery({ queryKey: ['slaughter-orders', farmId], queryFn: () => fetchSlaughterOrders(farmId) });
  const promotionsQuery = useQuery({ queryKey: ['promotions', farmId], queryFn: () => fetchPromotions(farmId) });
  const transfersQuery = useQuery({ queryKey: ['stock-transfers', farmId], queryFn: () => fetchStockTransfers(farmId) });
  const salesQuery = useQuery({ queryKey: ['sales', farmId, today, today], queryFn: () => fetchSales(farmId, today, today) });
  const dashboardQuery = useQuery({ queryKey: ['dashboard', farmId], queryFn: () => fetchDashboard(farmId), staleTime: 30_000 });
  const feedStockQuery = useQuery({ queryKey: ['feed-stock', farmId], queryFn: () => fetchFeedStock(farmId) });
  const queue = useOfflineQueue(farmId);

  const [pdvId, setPdvId] = useState('');
  const [lines, setLines] = useState<PosLine[]>([]);
  const [lineSheetOpen, setLineSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PosLine | undefined>(undefined);
  const [presetBatchId, setPresetBatchId] = useState<string | undefined>(undefined);
  const [presetTransferId, setPresetTransferId] = useState<string | undefined>(undefined);
  const [presetTransferProductType, setPresetTransferProductType] = useState<StockTransfer['productType'] | undefined>(undefined);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const lots = (batchesQuery.data ?? []).filter(
    (b) => b.quantityAlive > 0 && (b.status === 'EN_VENTE' || b.status === 'ACTIF'),
  );
  const pdvs = pdvQuery.data ?? [];
  const activePdvs = pdvs.filter((p) => p.isActive);
  const pdv = pdvs.find((p) => p.id === pdvId) ?? null;
  const isBoutique = pdv?.kind === 'BOUTIQUE';
  const pools = (slaughterQuery.data ?? []).filter(
    (p) => p.status === 'PROCESSED' && p.slaughterType === 'ABATTU' && (p.carcassesAvailable ?? 0) > 0,
  );
  const poolTotal = pools.reduce((a, p) => a + (p.carcassesAvailable ?? 0), 0);
  const transfers = transfersQuery.data ?? [];
  const activeReserves = transfers
    .filter((t) => t.status === 'TRANSFERRED')
    .map((t) => ({ ...t, remaining: transferRemaining(t.quantity, t.quantitySold) }))
    .filter((t) => t.remaining > 0);
  const abattuReserves = activeReserves.filter((t) => t.productType === 'ABATTU');
  const eggReserves = activeReserves.filter((t) => t.productType === 'OEUFS');
  const feedReserves = activeReserves.filter((t) => t.productType === 'PROVENDE');
  const transferTotal = abattuReserves.reduce((a, t) => a + t.remaining, 0);
  const otherReserves = feedReserves.reduce((a, t) => a + t.remaining, 0) + eggReserves.reduce((a, t) => a + t.remaining, 0);
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

  const totals = totalsFor(lines, null);

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

  const handleSell = async (input: { invoice?: InvoiceFields; promoCode?: string; pointOfSaleId?: string }) => {
    const items = buildPosSaleItems(lines);
    const subTotal = totalsFor(lines, null).subtotalFcfa;
    const promo = input.promoCode?.trim() ? findPromotion(promotionsQuery.data ?? [], input.promoCode, subTotal) : null;
    const total = totalsFor(lines, promo).totalFcfa;
    const invoice: InvoiceFields | undefined = (() => {
      const base = input.invoice ?? {};
      if (promo) return { ...base, promoCode: promo.code };
      return Object.keys(base).length > 0 ? base : undefined;
    })();
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
    <Card tone="accent" style={styles.insightsCard}>
      <View style={styles.statRow}>
        <View style={{ flex: 1 }}>
          <AppText size="caption" color="muted">
            CA AUJOURD’HUI · {pdv?.name}
          </AppText>
          <AppText size="h3" weight="bold" color="accent">
            {fmt(myStat.revenue)} FCFA
          </AppText>
        </View>
        <View style={styles.statBox}>
          <AppText size="caption" color="muted">
            TICKETS
          </AppText>
          <AppText size="body" weight="bold" color="text">
            {fmt(myStat.count)}
          </AppText>
        </View>
        <View style={styles.statBox}>
          <AppText size="caption" color="muted">
            PANIER MOYEN
          </AppText>
          <AppText size="body" weight="bold" color="text">
            {fmt(panierMoyen)}
          </AppText>
        </View>
      </View>
<AppText size="caption" color="faint">
          💡 Insight boutique : focus sur le stock transféré (carcasses puis œufs & provende), marge détail.
        </AppText>
    </Card>
  ) : (
    <Card tone="brand" style={styles.insightsCard}>
      <View style={styles.statRow}>
        <View style={{ flex: 1 }}>
          <AppText size="caption" color="muted">
            CA AUJOURD’HUI · FERME
          </AppText>
          <AppText size="h3" weight="bold" color="brand">
            {fmt(myStat.revenue)} FCFA
          </AppText>
        </View>
        <View style={styles.statBox}>
          <AppText size="caption" color="muted">
            TICKETS
          </AppText>
          <AppText size="body" weight="bold" color="text">
            {fmt(myStat.count)}
          </AppText>
        </View>
        <View style={styles.statBox}>
          <AppText size="caption" color="muted">
            PANIER MOYEN
          </AppText>
          <AppText size="body" weight="bold" color="text">
            {fmt(panierMoyen)}
          </AppText>
        </View>
      </View>
      <AppText size="caption" color="faint">
        💡 Vente du jour · {fmt(poolTotal)} carcasses à l’abattoir, {fmt(lots.length)} lot(s) à vendre sur pied.
      </AppText>
    </Card>
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
                <AppText size="caption" color={isFerm ? 'brand' : 'accent'} style={{ marginTop: 4 }}>
                  {fmt(stat.revenue)} FCFA · {fmt(stat.count)} ticket(s) aujourd’hui
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
          <View style={{ flex: 1 }}>
            <AppText size="h2" weight="bold" color="text">
              Encaisser
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
      </View>

      {pdvId === '' ? (
        loading ? (
          <View style={styles.center}>
            <Spinner />
          </View>
        ) : (
          landingView
        )
      ) : (
        <>
          <View style={styles.body}>
            {insightsBanner}

            {isBoutique ? (
              <View style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
                <AppText size="label" color="muted">
                  RÉSERVES EN BOUTIQUE
                </AppText>
                <View style={styles.sectionChips}>
                  {otherReserves > 0 ? <Chip label={`+ ${fmt(otherReserves)} œufs/provende`} tone="green" /> : null}
                  {transferTotal > 0 ? <Chip label={`${fmt(transferTotal)} carc.`} tone="accent" /> : null}
                </View>
              </View>
            ) : (
              <View style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
                <AppText size="label" color="muted">
                  LOTS À VENDRE
                </AppText>
                {poolTotal > 0 ? <Chip label={`${fmt(poolTotal)} carcasses abattoir`} tone="amber" /> : null}
              </View>
            )}

            {isBoutique ? (
              <View style={{ gap: spacing.sm }}>
                <Card tone="accent" onPress={() => openNew()} style={styles.ctaCard}>
                  <View style={styles.ctaIcon}>
                    <Plus size={20} color={color.accent[700]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText size="body" weight="bold" color="text">
                      Article
                    </AppText>
                    <AppText size="small" color="muted">
                      Nouvelle ligne de vente
                    </AppText>
                  </View>
                  <ChevronRight size={18} color={color.ink[300]} />
                </Card>
                <Card tone="accent" onPress={() => setTransferOpen(true)} style={styles.ctaCard}>
                  <View style={styles.ctaIcon}>
                    <ArrowRightLeft size={20} color={color.accent[700]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText size="body" weight="bold" color="text">
                      Réapprovisionner cette boutique
                    </AppText>
                    <AppText size="small" color="muted">
                      Carcasses, œufs ou provende depuis la ferme
                    </AppText>
                  </View>
                  <ChevronRight size={18} color={color.ink[300]} />
                </Card>
                {activeReserves.map((t) => {
                  const unit =
                    t.productType === 'OEUFS'
                      ? 'alv.'
                      : t.productType === 'PROVENDE'
                        ? t.unit === 'KG'
                          ? 'kg'
                          : 'sac'
                        : 'carc.';
                  const title =
                    t.productType === 'PROVENDE'
                      ? (t.inputLot?.productName ?? 'Provende')
                      : (t.slaughterOrder?.batch?.batchName ?? t.batch?.batchName ?? t.batchId ?? 'Lot');
                  const detail =
                    t.productType === 'OEUFS'
                      ? `${SPECIES_ICONS[(t.batch?.species ?? 'POULET')] ?? ''} ${speciesLabel(t.batch?.species)} · reçu le ${t.createdAt.slice(0, 10)}`
                      : t.productType === 'PROVENDE'
                        ? `${t.unit === 'KG' ? fmt(t.quantity) + ' kg' : fmt(t.quantity) + ' sac(s)'} transférés · reçu le ${t.createdAt.slice(0, 10)}`
                        : `${SPECIES_ICONS[(t.slaughterOrder?.batch?.species ?? 'POULET')] ?? ''} ${speciesLabel(t.slaughterOrder?.batch?.species)} · ${(t.slaughterOrder?.referenceNumber ?? '')} · reçu le ${t.createdAt.slice(0, 10)}`;
                  return (
                    <Card key={t.id} tone="warn" onPress={() => openNew(undefined, t)} style={styles.reserveCard}>
                      <View style={{ flex: 1 }}>
                        <AppText size="body" weight="semibold" color="text" numberOfLines={1}>
                          {title}
                        </AppText>
                        <AppText size="small" color="muted" numberOfLines={1}>
                          {detail}
                        </AppText>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <AppText size="body" weight="bold" color="accent">
                          {fmt(t.remaining)} {unit}
                        </AppText>
                        <Chip label="Vendre" tone="accent" />
                      </View>
                      <ChevronRight size={18} color={color.ink[300]} />
                    </Card>
                  );
                })}
                {activeReserves.length === 0 ? (
                  <Card tone="default">
                    <EmptyState
                      emoji="📦"
                      title="Aucun stock en boutique"
                      description="Réapprovisionnez des carcasses, œufs ou provende depuis la ferme."
                    />
                  </Card>
                ) : null}
              </View>
            ) : (
              <>
                <View style={styles.lotGrid}>
                  {lots.map((b) => {
                    const ready = b.status === 'EN_VENTE' || b.metrics.readyForSale;
                    return (
                      <Card key={b.id} onPress={() => openNew(b)} style={styles.lotCard}>
                        <View style={styles.lotHead}>
                          <Chip
                            label={`${SPECIES_ICONS[b.species] ?? ''} ${lotTitle(b)}`}
                            tone={b.type === 'CHAIR' ? 'brand' : 'green'}
                          />
                          <Chip label={ready ? 'Prêt' : 'Jeune'} tone={ready ? 'green' : 'neutral'} />
                        </View>
                        <AppText size="body" weight="semibold" color="text" numberOfLines={1}>
                          {b.batchName ?? 'Lot'}
                        </AppText>
                        <AppText size="small" color="muted">
                          J{b.metrics.ageDays} · {b.breedName ?? '—'} · {b.type === 'CHAIR' ? 'Chair' : 'Pondeuse'}
                        </AppText>
                        <View style={styles.lotFooter}>
                          <AppText size="h3" weight="bold" color="text">
                            {fmt(b.quantityAlive)}
                            <AppText size="caption" weight="medium" color="muted">
                              {' '}vivants
                            </AppText>
                          </AppText>
                          <ChevronRight size={18} color={color.ink[300]} />
                        </View>
                      </Card>
                    );
                  })}
                  {lots.length === 0 ? (
                    <Card tone="default" style={{ width: '100%' }}>
                      <EmptyState
                        emoji="🐔"
                        title="Aucun lot vendable"
                        description="Créez ou réactivez un lot avec des oiseaux vivants pour commencer à encaisser."
                      />
                    </Card>
                  ) : null}
                </View>

                {pools.length > 0 ? (
                  <Card tone="warn" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <AppText size="body" weight="bold" color="text">
                        Carcasses fraîches disponibles
                      </AppText>
                      <AppText size="small" color="muted">
                        {fmt(poolTotal)} pièces issues de l’abattoir — à vendre en pièce ou au kilo.
                      </AppText>
                    </View>
                    <Button
                      label="Vendre"
                      tone="accent"
                      size="md"
                      block={false}
                      onPress={() => {
                        setEditing(undefined);
                        setPresetBatchId(undefined);
                        setPresetTransferId(undefined);
                        setLineSheetOpen(true);
                      }}
                    />
                  </Card>
                ) : null}

                <Card tone="accent" onPress={() => setTransferOpen(true)} style={[styles.ctaCard, { marginTop: spacing.md }]}>
                  <View style={styles.ctaIcon}>
                    <ArrowRightLeft size={20} color={color.accent[700]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText size="body" weight="bold" color="text">
                      Envoyer du stock à une boutique
                    </AppText>
                    <AppText size="small" color="muted">
                      Carcasses, œufs ou provende vers vos points de vente
                    </AppText>
                  </View>
                  <ChevronRight size={18} color={color.ink[300]} />
                </Card>
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
                          {l.batchId ? lots.find((b) => b.id === l.batchId)?.batchName ?? 'Lot' : ''} · {fmt(l.qty)} ×{' '}
                          {fmt(l.unitPriceFcfa)}
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
          </View>

          <View style={styles.bottomBar}>
            <View style={{ flex: 1 }}>
              <AppText size="caption" color="muted">
                TOTAL PANIER
              </AppText>
              <AppText size="h3" weight="bold" color={lines.length > 0 ? 'text' : 'faint'} numberOfLines={1} adjustsFontSizeToFit>
                {lines.length > 0 ? fmtFcfa(totals.totalFcfa) : '0 FCFA'}
              </AppText>
            </View>
            <View style={{ width: 190 }}>
              <Button
                label="Encaisser"
                tone="accent"
                icon={ShoppingCart}
                disabled={lines.length === 0}
                onPress={() => setRegisterOpen(true)}
              />
            </View>
          </View>

          {!loading && !isBoutique ? (
            <Pressable style={styles.fab} onPress={() => openNew()} accessibilityRole="button">
              <View style={styles.fabIcon}>
                <Plus size={18} color={color.brand[700]} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText size="body" weight="bold" color="text">
                  Article
                </AppText>
                <AppText size="caption" color="muted">
                  Nouvelle ligne de vente
                </AppText>
              </View>
              <ChevronRight size={18} color={color.ink[300]} />
            </Pressable>
          ) : null}
        </>
      )}

      <PosLineSheet
        visible={lineSheetOpen}
        lots={lots}
        pools={pools}
        transfers={isBoutique ? transfers : undefined}
        posKind={pdv?.kind}
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
        lines={lines}
        promotions={promotionsQuery.data ?? []}
        pdvName={pdv?.name ?? 'Ferme'}
        pointOfSaleId={pdv?.id}
        onSell={handleSell}
        onSettled={() => setLines([])}
        onClose={() => setRegisterOpen(false)}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightsCard: {
    gap: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statBox: {
    minWidth: 66,
    gap: 2,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  lotCard: {
    width: '48%',
    flexGrow: 1,
    gap: 4,
  },
  lotHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2,
  },
  lotFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  reserveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    backgroundColor: palette.surface,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    top: 176,
    minWidth: 120,
    paddingHorizontal: spacing.md,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.brand[600],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: palette.brand[950],
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  fabIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
});