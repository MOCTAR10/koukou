import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { ArrowRightLeft, RotateCcw, Store } from 'lucide-react-native';

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
import { color, radii, spacing, fmt } from '@/constants/theme';

import { transferRemaining } from './catalog';

const EGG_FALLBACK_MAX_ALVEOLES = 100000;
const DEFAULT_SACK_KG = 50;

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
    return `${t.slaughterOrder?.referenceNumber ?? ''} · ${SPECIES_ICONS[species] ?? ''} ${speciesLabel(species)}`;
  }
  if (t.productType === 'OEUFS') {
    return `${t.batch?.batchName ?? 'Œufs'} · réservé à ${t.pointOfSale.name}`;
  }
  return `${t.inputLot?.supplierLotNumber ?? ''} · ${fmt(t.quantity)} ${t.unit === 'KG' ? 'kg' : 'sacs'} (origine)`;
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
  const [productType, setProductType] = useState<StockTransferProductType>('ABATTU');
  const [sourceId, setSourceId] = useState('');
  const [unit, setUnit] = useState<'SAC' | 'KG' | null>(null);
  const [boutiqueId, setBoutiqueId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const eligiblePools = pools.filter((p) => (p.carcassesAvailable ?? 0) > 0);
  const pondeuseLots = lots.filter((b) => b.type === 'PONDEUSE' && b.quantityAlive > 0);
  const eligibleFeedLots = feedLots.filter((l) => l.availableKg > 0 && l.entryType !== 'MEDICAMENT');
  const activeTransfers = transfers.filter(
    (t) => t.status === 'TRANSFERRED' && transferRemaining(t.quantity, t.quantitySold) > 0,
  );

  const pool = eligiblePools.find((p) => p.id === sourceId);
  const pondeuse = pondeuseLots.find((b) => b.id === sourceId);
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
    productType === 'ABATTU'
      ? (pool?.carcassesAvailable ?? 0)
      : productType === 'OEUFS'
        ? effectiveEggAlveoles
        : unit === 'SAC'
          ? feedAvailableSacs
          : unit === 'KG'
            ? feedAvailableKg
            : 0;

  const quantitySuffix =
    productType === 'ABATTU'
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
    setProductType('ABATTU');
    setSourceId('');
    setUnit(null);
    setBoutiqueId(boutiques.length === 1 ? boutiques[0].id : '');
    setQuantity(0);
    setBusy(false);
    setError(null);
    setDoneMsg(null);
  }, [visible, boutiques]);

  const selectProduct = (key: StockTransferProductType) => {
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
    if (productType === 'ABATTU' && !pool) {
      setError('Sélectionnez une source (pool de carcasses) avec du stock disponible.');
      return;
    }
    if (productType === 'OEUFS' && !pondeuse) {
      setError('Sélectionnez le lot de pondeuses d’origine.');
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
    } else if (productType === 'OEUFS' && pondeuse) {
      input.batchId = pondeuse.id;
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
    if (productType === 'ABATTU') {
      return (
        <View>
          <AppText size="label" color="muted">
            ORIGINE · POOL DE L’ABATTOIR
          </AppText>
          <View style={styles.rowWrap}>
            {eligiblePools.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  setSourceId(p.id);
                  setError(null);
                }}
                accessibilityRole="button">
                <Chip
                  label={`${SPECIES_ICONS[p.batch.species] ?? ''} ${p.batch.batchName ?? 'Lot'} · ${fmt(p.carcassesAvailable ?? 0)}`}
                  tone="amber"
                  selected={p.id === sourceId}
                />
              </Pressable>
            ))}
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
          <AppText size="label" color="muted">
            ORIGINE · LOT DE PONDEUSES
          </AppText>
          <View style={styles.rowWrap}>
            {pondeuseLots.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => {
                  setSourceId(b.id);
                  setError(null);
                }}
                accessibilityRole="button">
                <Chip
                  label={`${SPECIES_ICONS[b.species] ?? ''} ${b.batchName ?? 'Pondeuse'} · J${b.metrics.ageDays}`}
                  tone="green"
                  selected={b.id === sourceId}
                />
              </Pressable>
            ))}
            {pondeuseLots.length === 0 ? (
              <AppText size="caption" color="muted">
                Aucun lot de pondeuses actif pour transférer des œufs.
              </AppText>
            ) : null}
          </View>
          {eggStock != null ? (
            <AppText size="caption" color="faint" style={{ marginTop: 4 }}>
              ≈ {fmt(effectiveEggAlveoles)} alvéoles encore disponibles (collecte − ventes − réservées).
            </AppText>
          ) : null}
        </View>
      );
    }
    return (
      <View>
        <AppText size="label" color="muted">
          ORIGINE · LOT D’ALIMENT (PROVENDE)
        </AppText>
        <View style={styles.rowWrap}>
          {eligibleFeedLots.map((l) => {
            const lbs = l.unit === 'KG' ? `${fmt(l.availableKg)} kg` : `${fmt(Math.floor(l.availableKg / sacKgNum))} sacs`;
            return (
              <Pressable key={l.id} onPress={() => selectFeedLot(l.id)} accessibilityRole="button">
                <Chip label={`${l.productName} · ${lbs}`} tone="brand" selected={l.id === sourceId} />
              </Pressable>
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

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Transférer du stock"
      subtitle="Ferme → boutique · abattu, œufs & provende"
      icon={<ArrowRightLeft size={22} color={color.brand[600]} />}
      accentColor={color.brand[400]}>
      <View style={{ gap: spacing.lg }}>
        <Segmented<StockTransferProductType>
          value={productType}
          onChange={selectProduct}
          options={[
            { key: 'ABATTU', label: 'Abattu', tint: color.amber[600] },
            { key: 'OEUFS', label: 'Œufs', tint: color.green[600] },
            { key: 'PROVENDE', label: 'Provende', tint: color.brand[600] },
          ]}
        />

        <Card tone="default" style={{ gap: spacing.sm }}>
          <AppText size="label" color="muted">
            1 · SOURCE DU STOCK{' '}
            {maxQuantity > 0 ? `· ${fmt(maxQuantity)} ${quantitySuffix} disponible(s)` : ''}
          </AppText>

          {sourceSelector}

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
                  { key: 'SAC', label: `Sacs · ${fmt(Math.floor(feedLot.availableKg / sacKgNum))}`, tint: color.brand[600] },
                  { key: 'KG', label: `Kg · ${fmt(Math.floor(feedLot.availableKg))}`, tint: color.brand[600] },
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
              setQuantity(Math.min(parseInt(t, 10) || 0, Math.max(maxQuantity, 1)));
              setError(null);
            }}
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
                const detail = transferSourceDetail(t);
                return (
                  <Card key={t.id} tone="warn" style={styles.transferRow}>
                    <View style={styles.transferInfo}>
                      <View style={styles.transferTitleRow}>
                        <Chip label={PRODUCT_LABEL[t.productType]} tone={productTone(t.productType)} />
                        <AppText size="body" weight="semibold" color="text" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {transferSourceName(t)} → {t.pointOfSale.name}
                        </AppText>
                      </View>
                      <AppText size="caption" color="muted" numberOfLines={1}>
                        {detail} · {fmt(remaining)}/{fmt(t.quantity)} {transferUnitSuffix(t)}
                      </AppText>
                    </View>
                    <Pressable
                      onPress={() => cancelTransfer(t)}
                      hitSlop={8}
                      style={styles.cancelBtn}
                      accessibilityRole="button">
                      <RotateCcw size={16} color={color.red[600]} />
                    </Pressable>
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
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  transferInfo: {
    flex: 1,
    gap: 3,
  },
  transferTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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