import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { ArrowRightLeft, Check, RotateCcw, Store } from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { NumberInput } from '../ui/NumberInput';
import { Segmented } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import { SPECIES_ICONS, speciesLabel } from '@/api/format';
import type { StockTransferInput } from '@/api/mutations';
import { cancelStockTransferQueued, createStockTransferQueued } from '@/offline';
import type {
  BatchWithMetrics,
  FeedLotStock,
  PointOfSale,
  SlaughterOrder,
  StockTransfer,
  StockTransferProductType,
} from '@/api/types';
import { breedImageForLot } from '@/constants/breedImages';
import { color, radii, spacing, fmt } from '@/constants/theme';

import { formatEggAlveoles } from './helpers';
import { transferRemaining } from './catalog';

const EGG_FALLBACK_MAX_ALVEOLES = 100000;
const DEFAULT_SACK_KG = 50;
const DAY_MS = 86_400_000;

/** Onglets du transfert : « Vivant » est un inventaire en lecture seule
 *  (les volailles vivantes ne se transfèrent pas en boutique). */
type TransferTab = 'VIVANT' | StockTransferProductType;

const PRODUCT_LABEL: Record<StockTransferProductType, string> = {
  ABATTU: 'Abattu',
  OEUFS: 'Œufs',
  PROVENDE: 'Provende',
};

function productTone(type: StockTransferProductType): 'amber' | 'green' | 'brand' {
  if (type === 'ABATTU') return 'amber';
  if (type === 'OEUFS') return 'green';
  return 'brand';
}

type StatTone = 'amber' | 'green' | 'brand' | 'ink';

const TONE_COLOR: Record<StatTone, string> = {
  amber: color.amber[600],
  green: color.green[600],
  brand: color.brand[600],
  ink: color.ink[400],
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function typeLabel(type: 'CHAIR' | 'PONDEUSE'): string {
  return type === 'CHAIR' ? 'Chair' : 'Pondeuse';
}

function ageDaysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / DAY_MS));
}

interface SourceStat {
  label: string;
  tone: StatTone;
}

interface SourceOptionCardProps {
  image: ImageSourcePropType | null;
  emoji: string;
  title: string;
  subtitle?: string;
  stats: SourceStat[];
  tone: 'amber' | 'green' | 'brand';
  selected?: boolean;
  interactive?: boolean;
  onPress?: () => void;
  /** Ligne de détail supplémentaire sous les stats (ex : détail alvéoles). */
  footer?: React.ReactNode;
}

/** Carte de source : visuel de la souche (sinon icône d'espèce) + stats. */
function SourceOptionCard({
  image,
  emoji,
  title,
  subtitle,
  stats,
  tone,
  selected = false,
  interactive = true,
  onPress,
  footer,
}: SourceOptionCardProps) {
  const tint = TONE_COLOR[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!interactive}
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityState={interactive ? { selected } : undefined}
      style={({ pressed }) => [
        styles.srcCard,
        interactive && selected ? { borderColor: tint, backgroundColor: hexToRgba(tint, 0.07) } : null,
        interactive && pressed ? { backgroundColor: color.surfaceAlt } : null,
        !interactive ? styles.srcCardStatic : null,
      ]}>
      <View style={styles.srcThumb}>
        {image ? (
          <Image source={image} style={styles.srcImg} resizeMode="cover" />
        ) : (
          <AppText size="h3">{emoji}</AppText>
        )}
      </View>
      <View style={styles.srcInfo}>
        <AppText size="bodyM" weight="semibold" color="text">
          {title}
        </AppText>
        {subtitle ? (
          <AppText size="small" color="muted" style={styles.srcSubtitle}>
            {subtitle}
          </AppText>
        ) : null}
        {stats.length > 0 ? (
          <View style={styles.srcStats}>
            {stats.map((s, i) => (
              <View key={i} style={styles.srcStat}>
                <View style={[styles.srcStatDot, { backgroundColor: TONE_COLOR[s.tone] }]} />
                <AppText size="caption" color="muted" style={styles.srcStatLabel}>
                  {s.label}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
        {footer ? <View style={styles.srcFooter}>{footer}</View> : null}
      </View>
      {interactive && selected ? (
        <View style={[styles.srcCheck, { backgroundColor: tint }]}>
          <Check size={12} color="#FFFFFF" />
        </View>
      ) : null}
    </Pressable>
  );
}

function transferSourceName(t: StockTransfer): string {
  if (t.productType === 'ABATTU') {
    return t.slaughterOrder?.batch?.batchName ?? t.batchId ?? 'Carcasses';
  }
  if (t.productType === 'OEUFS') {
    return t.batch?.batchName ?? 'Œufs';
  }
  return t.inputLot?.productName ?? 'Provende';
}

function transferUnitSuffix(t: StockTransfer): string {
  if (t.productType === 'ABATTU') return 'carc.';
  if (t.productType === 'OEUFS') return 'alv.';
  return t.unit === 'KG' ? 'kg' : t.unit === 'SAC' ? 'sac(s)' : 'u.';
}

function transferSourceDetail(t: StockTransfer): string {
  if (t.productType === 'ABATTU') {
    const species = t.slaughterOrder?.batch?.species ?? 'POULET';
    return [t.slaughterOrder?.referenceNumber, `${SPECIES_ICONS[species] ?? ''} ${speciesLabel(species)}`.trim()]
      .filter(Boolean)
      .join(' · ');
  }
  if (t.productType === 'OEUFS') {
    return [t.batch?.breedName, 'Œufs réservés'].filter(Boolean).join(' · ');
  }
  return [t.inputLot?.supplierLotNumber, t.inputLot?.productName].filter(Boolean).join(' · ');
}

interface TransferSheetProps {
  visible: boolean;
  farmId: string;
  /** Ordres d'abattage PROCESSED (ABATTU) avec carcasses disponibles. */
  pools: SlaughterOrder[];
  /** Lots de production (ferme) — les pondeuses alimentent l'onglet œufs. */
  lots: BatchWithMetrics[];
  /** Lots d'aliment (provende) avec stock réel disponible. */
  feedLots: FeedLotStock[];
  /** Stock d'œufs global de la ferme (optionnel — sinon le serveur tranche). */
  eggStock?: { availableAlveoles: number; availableEggs: number } | null;
  /** Poids d'un sac (kg) par défaut (Farm.defaultSacKg). */
  sacKg?: number;
  /** Boutiques actives destinataires du transfert. */
  boutiques: PointOfSale[];
  /** Tous les transferts connus (liste des réserves + restes). */
  transfers: StockTransfer[];
  onChanged: () => void;
  onClose: () => void;
}

export function TransferSheet({
  visible,
  farmId,
  pools,
  lots,
  feedLots,
  eggStock,
  sacKg,
  boutiques,
  transfers,
  onChanged,
  onClose,
}: TransferSheetProps) {
  const [productType, setProductType] = useState<TransferTab>('VIVANT');
  const [sourceId, setSourceId] = useState('');
  const [unit, setUnit] = useState<'SAC' | 'KG' | null>(null);
  const [boutiqueId, setBoutiqueId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const eligiblePools = pools.filter((p) => (p.carcassesAvailable ?? 0) > 0);
  const liveLots = lots.filter((b) => b.quantityAlive > 0);
  // Œufs : tous les types de lots sont éligibles (charges et pondeuses) —
  // les lots portant déjà des œufs remontent en premier.
  const eggLots = liveLots
    .filter(
      (b) => b.type === 'PONDEUSE' || b.metrics.eggsCollectedTotal > 0 || b.metrics.eggStockAvailableEggs > 0,
    )
    .sort(
      (a, b) =>
        b.metrics.eggStockAvailableEggs + b.metrics.eggsCollectedTotal -
        (a.metrics.eggStockAvailableEggs + a.metrics.eggsCollectedTotal),
    );
  const eligibleFeedLots = feedLots.filter((l) => l.availableKg > 0 && l.entryType !== 'MEDICAMENT');
  const activeTransfers = transfers.filter(
    (t) => t.status === 'TRANSFERRED' && transferRemaining(t.quantity, t.quantitySold) > 0,
  );

  const pool = eligiblePools.find((p) => p.id === sourceId);
  const eggLot = eggLots.find((b) => b.id === sourceId);
  const feedLot = eligibleFeedLots.find((l) => l.id === sourceId);

  const reservedOeufsAlveoles = activeTransfers
    .filter((t) => t.productType === 'OEUFS')
    .reduce((s, t) => s + transferRemaining(t.quantity, t.quantitySold), 0);
  const effectiveEggAlveoles =
    eggStock == null
      ? EGG_FALLBACK_MAX_ALVEOLES
      : Math.max(0, eggStock.availableAlveoles - reservedOeufsAlveoles);

  const sacKgNum = sacKg ?? DEFAULT_SACK_KG;
  const feedAvailableKg = feedLot ? Math.max(0, Math.floor(feedLot.availableKg)) : 0;
  const feedAvailableSacs = feedLot ? Math.max(0, Math.floor(feedLot.availableKg / sacKgNum)) : 0;

  const maxQuantity =
    productType === 'VIVANT'
      ? 0
      : productType === 'ABATTU'
        ? (pool?.carcassesAvailable ?? 0)
        : productType === 'OEUFS'
          ? Math.min(
              effectiveEggAlveoles,
              eggLot
                ? Math.max(0, eggLot.metrics.eggStockAvailableAlveoles ?? 0)
                : effectiveEggAlveoles,
            )
          : unit === 'SAC'
            ? feedAvailableSacs
            : unit === 'KG'
              ? feedAvailableKg
              : 0;

  const quantitySuffix =
    productType === 'VIVANT'
      ? 'vivants'
      : productType === 'ABATTU'
        ? 'carc.'
        : productType === 'OEUFS'
          ? 'alv.'
          : unit === 'SAC'
            ? 'sacs'
            : unit === 'KG'
              ? 'kg'
              : 'u.';

  useEffect(() => {
    if (!visible) return;
    setProductType('VIVANT');
    setSourceId('');
    setUnit(null);
    setBoutiqueId(boutiques.length === 1 ? boutiques[0].id : '');
    setQuantity(0);
    setBusy(false);
    setError(null);
    setDoneMsg(null);
  }, [visible, boutiques]);

  const selectProduct = (key: TransferTab) => {
    setProductType(key);
    setSourceId('');
    setUnit(null);
    setQuantity(0);
    setError(null);
  };

  const selectFeedLot = (id: string) => {
    setSourceId(id);
    const lot = eligibleFeedLots.find((l) => l.id === id);
    setUnit(lot && lot.unit === 'KG' ? 'KG' : 'SAC');
    setQuantity(0);
    setError(null);
  };

  const create = async () => {
    if (productType === 'VIVANT') {
      setError('Les volailles vivantes ne se transfèrent pas — vendez-les au point de vente de la ferme.');
      return;
    }
    if (productType === 'ABATTU' && !pool) {
      setError('Sélectionnez une source (pool de carcasses) avec du stock disponible.');
      return;
    }
    if (productType === 'OEUFS' && !eggLot) {
      setError('Sélectionnez le lot d’origine des œufs.');
      return;
    }
    if (productType === 'PROVENDE' && (!feedLot || !unit)) {
      setError('Sélectionnez le lot de provende et l’unité (sacs ou kg).');
      return;
    }
    if (!boutiqueId) {
      setError('Sélectionnez la boutique destinataire.');
      return;
    }
    if (quantity <= 0 || quantity > maxQuantity) {
      setError(`Quantité invalide (1 à ${fmt(Math.max(maxQuantity, 1))} ${quantitySuffix}).`);
      return;
    }
    setBusy(true);
    setError(null);
    const input: StockTransferInput = {
      productType,
      pointOfSaleId: boutiqueId,
      quantity,
    };
    if (productType === 'ABATTU' && pool) {
      input.slaughterOrderId = pool.id;
    } else if (productType === 'OEUFS' && eggLot) {
      input.batchId = eggLot.id;
    } else if (productType === 'PROVENDE' && feedLot && unit) {
      input.inputLotId = feedLot.id;
      input.unit = unit;
    }
    try {
      const result = await createStockTransferQueued(farmId, input);
      setDoneMsg(
        result.status === 'sent'
          ? `Transfert enregistré · ${PRODUCT_LABEL[productType].toLowerCase()} en réserve boutique.`
          : 'Hors ligne : transfert mis en file d’attente.',
      );
      onChanged();
      setQuantity(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors du transfert.');
    } finally {
      setBusy(false);
    }
  };

  const cancelTransfer = (transfer: StockTransfer) => {
    const remaining = transferRemaining(transfer.quantity, transfer.quantitySold);
    Alert.alert(
      'Annuler ce transfert ?',
      `${fmt(remaining)} ${transferUnitSuffix(transfer)} non vendu(s) retourneront au stock source.`,
      [
        { text: 'Retour' },
        {
          text: 'Annuler le transfert',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await cancelStockTransferQueued(farmId, transfer.id);
                onChanged();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Erreur lors de l’annulation.');
              }
            })();
          },
        },
      ],
    );
  };

  const sourceSelector = (() => {
    if (productType === 'VIVANT') {
      return (
        <View>
          <View style={styles.srcList}>
            {liveLots.map((b) => (
              <SourceOptionCard
                key={b.id}
                image={breedImageForLot(b.breedName, b.species)}
                emoji={SPECIES_ICONS[b.species] ?? '🐔'}
                title={b.batchName ?? 'Lot'}
                subtitle={[b.breedCode, b.breedName, typeLabel(b.type)].filter(Boolean).join(' · ')}
                stats={[
                  { label: `${fmt(b.quantityAlive)} vivants`, tone: 'ink' },
                  { label: `J${b.metrics.ageDays}`, tone: 'ink' },
                  b.type === 'PONDEUSE'
                    ? { label: `${fmt(Math.round(b.metrics.layRatePercent ?? 0))}% ponte`, tone: 'green' }
                    : { label: `${fmt(b.metrics.mortalityPercent)}% mortalité`, tone: 'amber' },
                ]}
                tone="brand"
                interactive={false}
              />
            ))}
            {liveLots.length === 0 ? (
              <AppText size="caption" color="muted">
                Aucun lot vivant enregistré sur la ferme.
              </AppText>
            ) : null}
          </View>
          <AppText size="small" color="muted" style={styles.note}>
            Les volailles vivantes restent à la ferme (vente directe au point FERME). Choisissez « Abattu » pour
            transférer des carcasses vers une boutique.
          </AppText>
        </View>
      );
    }
    if (productType === 'ABATTU') {
      return (
        <View>
          <View style={styles.srcList}>
            {eligiblePools.map((p) => {
              const age = ageDaysSince(p.batch.integrationDate);
              const breedName = p.batch.breedName ?? p.batch.breed?.name ?? null;
              const breedCode = p.batch.breedCode ?? p.batch.breed?.refCode ?? null;
              return (
                <SourceOptionCard
                  key={p.id}
                  image={breedImageForLot(breedName, p.batch.species)}
                  emoji={SPECIES_ICONS[p.batch.species] ?? '🐔'}
                  title={p.batch.batchName ?? 'Lot'}
                  subtitle={[breedCode, breedName, p.referenceNumber].filter(Boolean).join(' · ')}
                  stats={[
                    { label: `${fmt(p.carcassesAvailable ?? 0)} carcasses dispo`, tone: 'amber' },
                    ...(age != null ? [{ label: `J${age}`, tone: 'ink' as StatTone }] : []),
                    { label: speciesLabel(p.batch.species), tone: 'ink' },
                  ]}
                  tone="amber"
                  selected={p.id === sourceId}
                  onPress={() => {
                    setSourceId(p.id);
                    setError(null);
                  }}
                />
              );
            })}
            {eligiblePools.length === 0 ? (
              <AppText size="caption" color="muted">
                Aucune carcasse disponible au moment présent (ordre d’abattage traité requis).
              </AppText>
            ) : null}
          </View>
        </View>
      );
    }
    if (productType === 'OEUFS') {
      return (
        <View>
          <View style={styles.srcList}>
            {eggLots.map((b) => (
              <SourceOptionCard
                key={b.id}
                image={breedImageForLot(b.breedName, b.species)}
                emoji={SPECIES_ICONS[b.species] ?? '🐔'}
                title={b.batchName ?? 'Lot'}
                subtitle={[b.breedCode, b.breedName, typeLabel(b.type)].filter(Boolean).join(' · ')}
                stats={[
                  { label: `${fmt(b.metrics.eggStockAvailableEggs)} œufs disponibles`, tone: 'green' },
                ]}
                footer={
                  <AppText size="small" weight="semibold" color="success">
                    {formatEggAlveoles(b.metrics.eggStockAvailableEggs)}
                  </AppText>
                }
                tone="green"
                selected={b.id === sourceId}
                onPress={() => {
                  setSourceId(b.id);
                  setError(null);
                }}
              />
            ))}
            {eggLots.length === 0 ? (
              <AppText size="caption" color="muted">
                Aucun lot actif avec des œufs à transférer (saisissez une collecte d’œufs d’abord).
              </AppText>
            ) : null}
          </View>
          {eggStock != null ? (
            <AppText size="caption" color="faint" style={styles.note}>
              ≈ {fmt(effectiveEggAlveoles)} alvéoles encore disponibles (collecte − ventes − réservées).
            </AppText>
          ) : null}
        </View>
      );
    }
    return (
      <View>
        <View style={styles.srcList}>
          {eligibleFeedLots.map((l) => {
            const sacs = Math.floor(l.availableKg / sacKgNum);
            return (
              <SourceOptionCard
                key={l.id}
                image={null}
                emoji="🌾"
                title={l.productName}
                subtitle={[l.supplier, l.supplierLotNumber].filter(Boolean).join(' · ')}
                stats={[
                  { label: `${fmt(Math.floor(l.availableKg))} kg dispo`, tone: 'brand' },
                  ...(l.unit === 'KG' ? [] : [{ label: `${fmt(sacs)} sacs`, tone: 'ink' as StatTone }]),
                ]}
                tone="brand"
                selected={l.id === sourceId}
                onPress={() => selectFeedLot(l.id)}
              />
            );
          })}
          {eligibleFeedLots.length === 0 ? (
            <AppText size="caption" color="muted">
              Aucune provende en stock — réceptionnez d’abord un lot d’aliment.
            </AppText>
          ) : null}
        </View>
      </View>
    );
  })();

  const isVivant = productType === 'VIVANT';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Transférer du stock"
      subtitle="Ferme → boutique · vivant, abattu, œufs & provende"
      icon={<ArrowRightLeft size={22} color={color.brand[600]} />}
      accentColor={color.brand[400]}>
      <View style={{ gap: spacing.lg }}>
        <Segmented<TransferTab>
          value={productType}
          onChange={selectProduct}
          options={[
            { key: 'VIVANT', label: 'Vivant', tint: color.ink[600] },
            { key: 'ABATTU', label: 'Abattu', tint: color.amber[600] },
            { key: 'OEUFS', label: 'Œufs', tint: color.green[600] },
            { key: 'PROVENDE', label: 'Provende', tint: color.brand[600] },
          ]}
        />

        <Card tone="default" style={{ gap: spacing.sm }}>
          <AppText size="label" color="muted">
            {isVivant
              ? `CHEPTEL VIVANT · ${fmt(liveLots.length)} LOT(S)`
              : `1 · SOURCE DU STOCK${maxQuantity > 0 ? ` · ${fmt(maxQuantity)} ${quantitySuffix} disponible(s)` : ''}`}
          </AppText>

          {sourceSelector}

          {!isVivant ? (
            <>
              {productType === 'PROVENDE' && feedLot ? (
                <View style={{ gap: spacing.xs }}>
                  <AppText size="label" color="muted">
                    UNITÉ
                  </AppText>
                  <Segmented<'SAC' | 'KG'>
                    value={unit ?? 'SAC'}
                    onChange={(u) => {
                      setUnit(u);
                      setQuantity(0);
                      setError(null);
                    }}
                    options={[
                      {
                        key: 'SAC',
                        label: `Sacs · ${fmt(Math.floor(feedLot.availableKg / sacKgNum))}`,
                        tint: color.brand[600],
                      },
                      {
                        key: 'KG',
                        label: `Kg · ${fmt(Math.floor(feedLot.availableKg))}`,
                        tint: color.brand[600],
                      },
                    ]}
                  />
                  <AppText size="caption" color="faint">
                    {feedLot.productName} · {feedLot.supplierLotNumber} — ≈ {fmt(feedLot.availableKg)} kg restants.
                  </AppText>
                </View>
              ) : null}

              <AppText size="label" color="muted" style={{ marginTop: spacing.sm }}>
                2 · BOUTIQUE DESTINATAIRE
              </AppText>
              <View style={styles.rowWrap}>
                {boutiques.map((b) => (
                  <Pressable key={b.id} onPress={() => setBoutiqueId(b.id)} accessibilityRole="button">
                    <Chip label={`🏪 ${b.name}`} tone="accent" selected={b.id === boutiqueId} />
                  </Pressable>
                ))}
                {boutiques.length === 0 ? (
                  <AppText size="caption" color="muted">
                    Créez d’abord une boutique active (gestion des points de vente).
                  </AppText>
                ) : null}
              </View>

              <AppText size="label" color="muted" style={{ marginTop: spacing.sm }}>
                3 · QUANTITÉ
              </AppText>
              <NumberInput
                value={quantity > 0 ? String(quantity) : ''}
                onChangeText={(t) => {
                  const next = unit === 'KG' ? parseFloat(t) || 0 : parseInt(t, 10) || 0;
                  setQuantity(Math.min(next, Math.max(maxQuantity, 1)));
                  setError(null);
                }}
                decimal={unit === 'KG'}
                suffix={quantitySuffix}
                placeholder="0"
              />
              {productType === 'OEUFS' ? (
                <AppText size="caption" color="muted">
                  Quantité en alvéoles (1 alvéole = 30 œufs).
                </AppText>
              ) : null}

              {error ? (
                <AppText size="small" color="danger">
                  {error}
                </AppText>
              ) : null}
              {doneMsg ? (
                <AppText size="small" color="success">
                  {doneMsg}
                </AppText>
              ) : null}

              <Button
                label="Transférer"
                tone="brand"
                icon={Store}
                loading={busy}
                disabled={busy || !boutiqueId || maxQuantity <= 0 || quantity <= 0}
                onPress={() => void create()}
              />
              <AppText size="caption" color="muted">
                Le stock quitte la source et devient une réserve vendable en boutique.
              </AppText>
            </>
          ) : null}
        </Card>

        <View>
          <View style={styles.sectionRow}>
            <AppText size="label" color="muted">
              RÉSERVES ACTIVES EN BOUTIQUE · {fmt(activeTransfers.length)}
            </AppText>
          </View>
          {activeTransfers.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {activeTransfers.map((t) => {
                const remaining = transferRemaining(t.quantity, t.quantitySold);
                const tint = TONE_COLOR[productTone(t.productType)];
                return (
                  <Card key={t.id} tone="warn" style={styles.reserveCard}>
                    <View style={[styles.reserveBar, { backgroundColor: tint }]} />
                    <View style={styles.reserveBody}>
                      <View style={styles.reserveHead}>
                        <Chip label={PRODUCT_LABEL[t.productType]} tone={productTone(t.productType)} />
                        <View style={{ flex: 1 }} />
                        <Pressable
                          onPress={() => cancelTransfer(t)}
                          hitSlop={8}
                          style={styles.cancelBtn}
                          accessibilityRole="button">
                          <RotateCcw size={16} color={color.red[600]} />
                        </Pressable>
                      </View>
                      <AppText size="bodyM" weight="bold" color="text" style={styles.reserveTitle}>
                        {transferSourceName(t)}
                      </AppText>
                      <AppText size="small" color="muted" style={styles.reserveDetail}>
                        {transferSourceDetail(t)}
                      </AppText>
                      <View style={styles.reserveFoot}>
                        <AppText size="small" weight="semibold" color="brand" style={styles.reserveDest}>
                          → {t.pointOfSale.name}
                        </AppText>
                        <View style={[styles.reserveQty, { backgroundColor: hexToRgba(tint, 0.12) }]}>
                          <AppText size="small" weight="bold" color="text">
                            {fmt(remaining)}/{fmt(t.quantity)} {transferUnitSuffix(t)}
                          </AppText>
                        </View>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </View>
          ) : (
            <Card tone="default">
              <EmptyState
                emoji="📦"
                title="Aucune réserve active"
                description="Transférez du stock depuis la ferme (carcasses, œufs ou provende) pour le vendre en boutique."
              />
            </Card>
          )}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  note: {
    marginTop: spacing.sm,
  },
  srcList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  srcCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  srcCardStatic: {
    backgroundColor: color.surfaceAlt,
    borderColor: color.ink[100],
  },
  srcThumb: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceAlt,
  },
  srcImg: {
    width: '100%',
    height: '100%',
  },
  srcInfo: {
    flex: 1,
    gap: 2,
  },
  srcSubtitle: {
    lineHeight: 15,
  },
  srcStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 2,
  },
  srcStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  srcStatDot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill,
  },
  srcStatLabel: {
    flexShrink: 1,
  },
  srcCheck: {
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  srcFooter: {
    marginTop: 2,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  reserveCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 0,
    overflow: 'hidden',
  },
  reserveBar: {
    width: 4,
  },
  reserveBody: {
    flex: 1,
    gap: 3,
    padding: spacing.md,
  },
  reserveHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reserveTitle: {},
  reserveDetail: {
    lineHeight: 16,
  },
  reserveFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 2,
  },
  reserveDest: {
    flex: 1,
    flexShrink: 1,
  },
  reserveQty: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  cancelBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: color.red[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
