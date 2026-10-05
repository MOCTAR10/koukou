import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { CreditCard } from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { NumberInput } from '../ui/NumberInput';
import { Segmented } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import { SPECIES_ICONS, speciesLabel } from '@/api/format';
import { breedImageForLot } from '@/constants/breedImages';
import type { PosProduct } from '@/api/mutations';
import type {
  BatchWithMetrics,
  StockTransfer,
  PointOfSaleKind,
  SlaughterOrder,
  EggStockInfo,
} from '@/api/types';
import { color, palette, radii, spacing, fmt } from '@/constants/theme';

import { formatEggAlveoles, lineAmount } from './helpers';
import { posCatalog, productMeta, transferRemaining } from './catalog';
import type { PosLine } from './types';

interface PosLineSheetProps {
  visible: boolean;
  lots: BatchWithMetrics[];
  pools: SlaughterOrder[];
  /** Transferts de stock ferme → boutique (exclusif au PDV BOUTIQUE). */
  transfers?: StockTransfer[];
  /** Stock d'œufs ferme (alvéoles réellement vendables) — plafonne Œufs hors boutique. */
  eggStock?: EggStockInfo | null;
  /** Type du point de vente sélectionné (FERME par défaut). */
  posKind?: PointOfSaleKind;
  committed?: PosLine[];
  initial?: PosLine;
  presetBatchId?: string;
  /** Réserve de carcasses présélectionnée (boutique, mode transfert). */
  presetTransferId?: string;
  /** Type de produit de la réserve présélectionnée (boutique). */
  presetTransferProductType?: StockTransfer['productType'];
  onSave: (line: PosLine) => void;
  onClose: () => void;
}

type AbattuMode = 'direct' | 'pool' | 'transfer';

/** Arrondit un poids en kg à 2 décimales. */
const roundKg = (n: number): number => Math.round(n * 100) / 100;

/** Petite étape numérotée : titre de section pro et cohérent. */
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

export function PosLineSheet({
  visible,
  lots,
  pools,
  transfers = [],
  eggStock,
  posKind,
  committed,
  initial,
  presetBatchId,
  presetTransferId,
  presetTransferProductType,
  onSave,
  onClose,
}: PosLineSheetProps) {
  const [product, setProduct] = useState<PosProduct>('PIECE');
  const [abattuMode, setAbattuMode] = useState<AbattuMode>('direct');
  const [lotId, setLotId] = useState('');
  const [poolId, setPoolId] = useState('');
  const [provenUnit, setProvenUnit] = useState<'SAC' | 'KG' | null>(null);
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(0);
  const [weightKgText, setWeightKgText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isBoutique = posKind === 'BOUTIQUE';
  const products = posCatalog(posKind);

  const transferProductTypeForKey: Record<PosProduct, StockTransfer['productType'] | null> = {
    ABATTU_PIECE: 'ABATTU',
    ABATTU_KG: 'ABATTU',
    OEUF: 'OEUFS',
    PROVENDE: 'PROVENDE',
    PIECE: null,
    KG: null,
    AUTRE: null,
  };

  const stateRef = useRef({ lots, transfers });
  stateRef.current = { lots, transfers };

  useEffect(() => {
    if (!visible) return;
    const { lots, transfers } = stateRef.current;
    if (initial) {
      const isAbattu = initial.product === 'ABATTU_PIECE' || initial.product === 'ABATTU_KG';
      setProduct(initial.product);
      setAbattuMode(
        initial.transferId ? 'transfer' : isAbattu && initial.slaughterOrderId ? 'pool' : 'direct',
      );
      setLotId(initial.batchId ?? '');
      setPoolId(initial.transferId ?? initial.slaughterOrderId ?? '');
      setProvenUnit(initial.product === 'PROVENDE' ? (initial.unit ?? 'SAC') : null);
      setQty(initial.qty);
      setPrice(initial.unitPriceFcfa);
      const initialIsKg = initial.product === 'KG' || initial.product === 'ABATTU_KG';
      if (initialIsKg) {
        setWeightKgText(initial.weightKg != null ? String(roundKg(initial.weightKg)) : '');
      } else {
        setWeightKgText('');
      }
    } else {
      const preset = lots.find((b) => b.id === presetBatchId);
      const presetKey: PosProduct = preset
        ? preset.type === 'PONDEUSE'
          ? 'OEUF'
          : 'PIECE'
        : presetTransferId
          ? presetTransferProductType === 'OEUFS'
            ? 'OEUF'
            : presetTransferProductType === 'PROVENDE'
              ? 'PROVENDE'
              : 'ABATTU_PIECE'
          : isBoutique
            ? 'ABATTU_PIECE'
            : 'PIECE';
      const presetTransfer = transfers.find((t) => t.id === presetTransferId);
      setProduct(presetKey);
      setAbattuMode(isBoutique ? 'transfer' : 'direct');
      setLotId(isBoutique ? '' : preset ? preset.id : '');
      setPoolId(isBoutique && presetTransferId ? presetTransferId : '');
      setProvenUnit(presetTransfer?.productType === 'PROVENDE' ? ((presetTransfer.unit as 'SAC' | 'KG') ?? 'SAC') : null);
      setQty(0);
      setWeightKgText('');
      setPrice(
        presetTransfer?.productType === 'PROVENDE' && presetTransfer.inputLot?.unitPriceFcfa
          ? presetTransfer.inputLot.unitPriceFcfa
          : productMeta(posKind, presetKey).unitPrice,
      );
    }
    setError(null);
  }, [visible, initial, presetBatchId, presetTransferId, presetTransferProductType, isBoutique, posKind]);

  const isAbattuKey = (k: PosProduct): boolean =>
    k === 'ABATTU_PIECE' || k === 'ABATTU_KG';
  const isAbattu = isAbattuKey(product);
  const isKg = product === 'KG' || product === 'ABATTU_KG';
  const weightKg = parseFloat(weightKgText) || 0;
  const isReserveProduct = isAbattu || product === 'OEUF' || product === 'PROVENDE';
  const needsLot = product === 'PIECE' || product === 'KG';
  const meta = productMeta(posKind, product);
  const category: 'surPied' | 'abattu' | 'oeufs' = isAbattu
    ? 'abattu'
    : product === 'OEUF'
      ? 'oeufs'
      : 'surPied';

  const sellable = lots.filter(
    (b) => b.quantityAlive > 0 && (b.status === 'EN_VENTE' || b.status === 'ACTIF'),
  );
  const poolList = pools.filter((p) => p.status === 'PROCESSED' && p.slaughterType === 'ABATTU' && (p.carcassesAvailable ?? 0) > 0);
  const transferType = transferProductTypeForKey[product];
  const transferList = transferType
    ? transfers.filter(
        (t) => t.productType === transferType && t.status === 'TRANSFERRED' && transferRemaining(t.quantity, t.quantitySold) > 0,
      )
    : [];

  const pool = poolList.find((p) => p.id === poolId);
  const lot = sellable.find((b) => b.id === lotId);
  const transfer = transferList.find((t) => t.id === poolId);
  const lotVivants = lot ? lot.quantityAlive : 0;
  /** Boutique : type de réserve qui dirige l'article à vendre (la source
   *  détermine ce qu'on peut vendre, pas l'inverse). */
  const boutiqueReserveType = transfer?.productType ?? transferType ?? 'ABATTU';
  const reserveUnit: 'SAC' | 'KG' | null =
    product === 'PROVENDE' ? provenUnit ?? ((transfer?.unit as 'SAC' | 'KG') ?? 'SAC') : null;

  const lotPools = poolList.filter((p) => p.batchId === lotId);
  const lotAbattuCarc = lotPools.reduce((a, p) => a + (p.carcassesAvailable ?? 0), 0);
  // Chaque lot ne porte que ses propres œufs (stock scopé au lot). Sans lot
  // sélectionné (liste produits de la ferme), on perd la réserve ferme.
  const eggStockAvailableEggs = lot
    ? Math.max(lot.metrics.eggStockAvailableEggs ?? 0, 0)
    : Math.max(eggStock?.availableEggs ?? 0, 0);
  const eggStockAvailable = lot
    ? Math.max(lot.metrics.eggStockAvailableAlveoles ?? 0, 0)
    : Math.max(eggStock?.availableAlveoles ?? 0, 0);
  const eggLinesUsed = (committed ?? [])
    .filter(
      (l) =>
        l.uid !== initial?.uid &&
        l.product === 'OEUF' &&
        (lotId === '' || l.batchId === lotId),
    )
    .reduce((a, l) => a + l.qty, 0);
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

  const productOptions = (() => {
    if (isBoutique) {
      const reserveType = boutiqueReserveType;
      return products.filter(
        (p) => p.key !== 'AUTRE' && transferProductTypeForKey[p.key] === reserveType,
      );
    }
    if (!lot)
      // À la ferme, les œufs se vendent uniquement via le lot qui les produit
      // (attribution batchId + stock scopé au lot) : jamais en liste large.
      return products.filter(
        (p) => p.key !== 'OEUF' && p.key !== 'AUTRE',
      );
    return products
      .filter(
        (p) =>
          p.kind === lot.type ||
          isAbattuKey(p.key) ||
          (p.key === 'OEUF' && eggStockAvailableEggs > 0),
      )
      .filter((p) => p.key !== 'AUTRE')
      .filter((p) => !isAbattuKey(p.key) || lotAbattuCarc > 0);
  })();

  const flockUsed = (committed ?? [])
    .filter(
      (l) =>
        l.uid !== initial?.uid &&
        l.batchId === lotId &&
        l.slaughterOrderId == null &&
        (l.product === 'PIECE' ||
          l.product === 'KG' ||
          l.product === 'ABATTU_PIECE' ||
          l.product === 'ABATTU_KG'),
    )
    .reduce((a, l) => a + l.qty, 0);
  const poolUsed = (committed ?? [])
    .filter((l) => l.uid !== initial?.uid && l.slaughterOrderId === poolId && l.transferId == null)
    .reduce((a, l) => a + l.qty, 0);
  const transferUsed = (committed ?? [])
    .filter((l) => l.uid !== initial?.uid && l.transferId === poolId)
    .reduce((a, l) => a + l.qty, 0);

  const maxQty =
    product === 'AUTRE' ? 1000 :
    abattuMode === 'transfer' && transfer
      ? Math.max(transferRemaining(transfer.quantity, transfer.quantitySold) - transferUsed, 0)
      : isBoutique && isReserveProduct
        ? 0
      : product === 'OEUF'
        ? Math.max(eggStockAvailable - eggLinesUsed, 0)
      : abattuMode === 'pool'
        ? Math.max((pool?.carcassesAvailable ?? 0) - poolUsed, 0)
        : lot != null
          ? Math.max(lot.quantityAlive - flockUsed, 0)
          : (product === 'KG' || product === 'ABATTU_KG' ? 1000 : 200);

  const preview = (() => {
    const previewLine: PosLine = {
      uid: initial?.uid ?? 'preview',
      product,
      batchId:
        abattuMode === 'transfer'
          ? (transfer?.batchId ?? undefined)
          : abattuMode === 'pool'
            ? (pool?.batchId ?? lotId)
            : lotId || undefined,
      slaughterOrderId:
        abattuMode === 'transfer'
          ? (transfer?.slaughterOrderId ?? undefined)
          : (pool?.id ?? undefined),
      transferId: abattuMode === 'transfer' ? transfer?.id : undefined,
      unit: reserveUnit ?? undefined,
      qty,
      unitPriceFcfa: price,
      weightKg: isKg ? roundKg(weightKg) : undefined,
      label: meta.label,
    };
    return lineAmount(previewLine);
  })();

  const selectProduct = (key: PosProduct) => {
    setProduct(key);
    setWeightKgText('');
    setError(null);
    setPrice(productMeta(posKind, key).unitPrice);
    if (isBoutique) {
      setAbattuMode(transferProductTypeForKey[key] != null ? 'transfer' : 'direct');
      const reserveType = transferProductTypeForKey[key];
      if (reserveType !== transferType || poolId === '') {
        const single =
          reserveType != null
            ? transfers.find(
                (t) =>
                  t.productType === reserveType &&
                  t.status === 'TRANSFERRED' &&
                  transferRemaining(t.quantity, t.quantitySold) > 0,
              )
            : undefined;
        setPoolId(single ? single.id : '');
      }
      if (reserveType !== 'PROVENDE') setProvenUnit(null);
      return;
    }
    if (!isAbattuKey(key) && abattuMode === 'pool') {
      setAbattuMode('direct');
    }
    if (key === 'AUTRE') {
      setAbattuMode('direct');
      setPoolId('');
      setLotId('');
      return;
    }
    if (isAbattuKey(key)) {
      const poolsForLot = poolList.filter((p) => p.batchId === lotId);
      if (poolsForLot.length > 0) {
        setAbattuMode('pool');
        setPoolId(poolsForLot.length === 1 ? poolsForLot[0].id : '');
      } else {
        setAbattuMode('direct');
        setPoolId('');
      }
    } else if (abattuMode === 'pool') {
      setAbattuMode('direct');
      setPoolId('');
    }
  };

  const selectPool = (p: SlaughterOrder) => {
    setPoolId(p.id);
    setAbattuMode('pool');
    setError(null);
    if (!isAbattu) {
      setProduct('ABATTU_PIECE');
      setPrice(productMeta(posKind, 'ABATTU_PIECE').unitPrice);
    }
  };

  const save = () => {
    if (qty <= 0) {
      setError('Indiquez une quantité.');
      return;
    }
    if (isKg && weightKg <= 0) {
      setError('Indiquez le poids réel en kg.');
      return;
    }
    if (price <= 0) {
      setError('Indiquez un prix unitaire.');
      return;
    }
    if (isAbattu && abattuMode === 'transfer' && !transfer) {
      setError('Sélectionnez une réserve de carcasses (transfert ferme → boutique).');
      return;
    }
    if ((product === 'OEUF' || product === 'PROVENDE') && isBoutique && !transfer) {
      setError(
        product === 'OEUF'
          ? 'Sélectionnez une réserve d’œufs (transfert ferme → boutique).'
          : 'Sélectionnez une réserve de provende (transfert ferme → boutique).',
      );
      return;
    }
    if (isAbattu && abattuMode === 'pool' && !pool) {
      setError('Sélectionnez un lot de carcasses (abattoir).');
      return;
    }
    if (isAbattu && abattuMode === 'direct' && !lotId) {
      setError('Sélectionnez un lot.');
      return;
    }
    if (needsLot && !lotId) {
      setError('Sélectionnez un lot.');
      return;
    }
    if (qty > maxQty) {
      setError(
        isKg
          ? `Quantité limitée à ${fmt(maxQty)} oiseaux pour cette source.`
          : `Stock insuffisant : maximum ${fmt(maxQty)}.`,
      );
      return;
    }
    onSave({
      uid: initial?.uid ?? `new-${Date.now()}-${qty}`,
      product,
      batchId:
        abattuMode === 'transfer'
          ? (transfer?.batchId ?? transfer?.slaughterOrder?.batchId ?? undefined)
          : abattuMode === 'pool'
            ? (pool?.batchId ?? lotId)
            : lotId || undefined,
      slaughterOrderId:
        abattuMode === 'transfer'
          ? (transfer?.slaughterOrderId ?? undefined)
          : (pool?.id ?? undefined),
      transferId: abattuMode === 'transfer' ? transfer?.id : undefined,
      unit: reserveUnit ?? undefined,
      qty,
      unitPriceFcfa: price,
      weightKg: isKg ? roundKg(weightKg) : undefined,
      label: meta.label,
    });
    onClose();
  };

  const reserveEmpty =
    transferType === 'ABATTU'
      ? 'Aucune carcasse en boutique : transférez-en depuis la ferme pour vendre de l’abattu ici.'
      : transferType === 'OEUFS'
        ? 'Aucun œuf en réserve : transférez des alvéoles depuis la ferme pour les vendre ici.'
        : transferType === 'PROVENDE'
          ? 'Aucune provende en réserve : transférez des sacs depuis la ferme pour les vendre ici.'
          : 'Aucune réserve disponible.';

  const selectReserve = (t: StockTransfer) => {
    setPoolId(t.id);
    setError(null);
    const mappedKey: PosProduct =
      t.productType === 'OEUFS'
        ? 'OEUF'
        : t.productType === 'PROVENDE'
          ? 'PROVENDE'
          : isKg
            ? 'ABATTU_KG'
            : 'ABATTU_PIECE';
    setProduct(mappedKey);
    setAbattuMode('transfer');
    setWeightKgText('');
    setPrice(
      t.productType === 'PROVENDE' && t.inputLot?.unitPriceFcfa
        ? t.inputLot.unitPriceFcfa
        : productMeta(posKind, mappedKey).unitPrice,
    );
    if (t.productType === 'PROVENDE') {
      setProvenUnit((t.unit as 'SAC' | 'KG') ?? 'SAC');
    } else {
      setProvenUnit(null);
    }
  };

  const reserveLabel = (t: StockTransfer) => {
    const remaining = transferRemaining(t.quantity, t.quantitySold);
    const unit =
      t.productType === 'OEUFS'
        ? 'alv.'
        : t.productType === 'PROVENDE'
          ? t.unit === 'KG'
            ? 'kg'
            : 'sac'
          : 'u.';
    return `${t.productType === 'PROVENDE' && t.inputLot?.productName ? t.inputLot.productName : t.slaughterOrder?.batch?.batchName ?? t.batchId ?? 'Lot'} · ${fmt(remaining)} ${unit}`;
  };

  // ── Carte « Source du stock » (boutique) : réserve sélectionnée ──
  const reserveSpecies = transfer?.batch?.species ?? transfer?.slaughterOrder?.batch?.species;
  const reserveBatchName =
    transfer?.batch?.batchName ?? transfer?.slaughterOrder?.batch?.batchName;
  const reserveBreedCode =
    transfer?.batch?.breedCode ??
    transfer?.batch?.breed?.refCode ??
    transfer?.slaughterOrder?.batch?.breedCode ??
    transfer?.slaughterOrder?.batch?.breed?.refCode ??
    null;
  const reserveBreedName =
    transfer?.batch?.breedName ??
    transfer?.batch?.breed?.name ??
    transfer?.batch?.customBreed ??
    transfer?.slaughterOrder?.batch?.breedName ??
    transfer?.slaughterOrder?.batch?.breed?.name ??
    transfer?.slaughterOrder?.batch?.customBreed ??
    null;
  const reserveImg =
    transfer && transfer.productType !== 'PROVENDE'
      ? breedImageForLot(reserveBreedName, reserveSpecies)
      : null;
  const reserveFallback = transfer
    ? transfer.productType === 'PROVENDE'
      ? '🌾'
      : (reserveSpecies != null ? SPECIES_ICONS[reserveSpecies] : null) ?? '🥩'
    : '📦';
  const reserveTitle = transfer
    ? transfer.productType === 'PROVENDE'
      ? (transfer.inputLot?.productName ?? 'Provende')
      : (reserveBatchName ?? 'Lot')
    : '';
  const reserveSubtitle = transfer
    ? `${speciesLabel(reserveSpecies)} · reçu le ${transfer.createdAt.slice(0, 10)}`
    : '';
  const reserveTone =
    transfer?.productType === 'OEUFS'
      ? 'green'
      : transfer?.productType === 'PROVENDE'
        ? 'neutral'
        : 'accent';
  const reserveDot =
    transfer?.productType === 'OEUFS'
      ? color.green[500]
      : transfer?.productType === 'PROVENDE'
        ? color.amber[500]
        : color.accent[500];
  const fmtQty = (q: number): string => {
    if (!transfer) return '0';
    if (transfer.productType === 'OEUFS') return `${fmt(q)} alvéoles`;
    if (transfer.productType === 'PROVENDE')
      return `${fmt(q)} ${transfer.unit === 'KG' ? 'kg' : 'sac(s)'}`;
    return `${fmt(q)} carcasses`;
  };
  const reserveRemaining = transfer
    ? transferRemaining(transfer.quantity, transfer.quantitySold)
    : 0;
  const reserveReceived = transfer?.quantity ?? 0;
  const reserveSold = transfer?.quantitySold ?? 0;
  const reserveEggs = transfer ? reserveRemaining * 30 : 0;

  // Batch source pour la carte « souche » (code / nom / type / age)
  const reserveBatchId = transfer?.slaughterOrder?.batchId ?? transfer?.batchId;
  const reserveBatch = transfer?.slaughterOrder?.batch ?? transfer?.batch ?? null;
  const reserveAge =
    transfer && reserveBatchId ? lots.find((b) => b.id === reserveBatchId)?.metrics?.ageDays : undefined;

  const unitSuffix =
    product === 'PROVENDE' && reserveUnit ? (reserveUnit === 'KG' ? 'kg' : 'sac') : meta.unit;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={initial ? 'Modifier l’article' : 'Ajouter un article'}
      subtitle={isBoutique ? 'Article, réserve et quantité' : 'Lot, article et quantité'}
      icon={<CreditCard size={22} color={color.accent[600]} />}
      accentColor={color.accent[400]}
      footer={
        <View style={styles.footerRow}>
          <View style={{ flex: 1 }}>
            <AppText size="caption" weight="semibold" color="muted">
              SOUS-TOTAL
            </AppText>
            <AppText size="h2" weight="bold" color="accent">
              {fmt(preview)} FCFA
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={initial ? 'Mettre à jour' : 'Ajouter'}
              tone="accent"
              block
              disabled={qty <= 0 || price <= 0}
              onPress={save}
            />
          </View>
        </View>
      }>
      <View style={{ gap: spacing.md }}>
        {isBoutique ? (
          <>
            {/* ── 1 · SOURCE DU STOCK ─────────────────────────────────── */}
            <View>
              <StepTitle n={1} label="Source du stock" />
              {transfer ? (
                <Card tone={reserveTone === 'green' ? 'green' : 'default'} style={styles.lotPanel}>
                  <View style={styles.lotPanelHead}>
                    <View style={styles.lotPanelIcon}>
                      {reserveImg ? (
                        <Image source={reserveImg as number} style={styles.lotPanelImg} />
                      ) : (
                        <AppText size="h2" color="faint">
                          {reserveFallback}
                        </AppText>
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText size="h3" weight="bold" color="text">
                        {reserveTitle}
                      </AppText>
                      {reserveBatch ? (
                        <AppText size="small" color="muted">
                          {[reserveBreedCode, reserveBreedName, reserveBatch.type === 'CHAIR' ? 'Chair' : 'Pondeuse'].filter(Boolean).join(' · ') || '—'}
                          {reserveAge != null ? ` · J${reserveAge}` : ''}
                        </AppText>
                      ) : null}
                      <AppText size="small" color="muted">
                        {reserveSubtitle}
                      </AppText>
                    </View>
                    <Chip label={fmtQty(reserveRemaining)} tone={reserveTone} />
                  </View>
                  <View style={styles.stockRow}>
                    <View style={styles.stockItem}>
                      <View style={[styles.stockDot, { backgroundColor: reserveDot }]} />
                      <AppText size="small" weight="semibold" color="text">
                        {fmtQty(reserveRemaining)} restant
                      </AppText>
                    </View>
                    {reserveReceived > 0 ? (
                      <View style={styles.stockItem}>
                        <View style={[styles.stockDot, { backgroundColor: color.ink[300] }]} />
                        <AppText size="small" weight="semibold" color="muted">
                          {fmtQty(reserveReceived)} reçus
                        </AppText>
                      </View>
                    ) : null}
                    {reserveSold > 0 ? (
                      <View style={styles.stockItem}>
                        <View style={[styles.stockDot, { backgroundColor: color.green[500] }]} />
                        <AppText size="small" weight="semibold" color="success">
                          {fmtQty(reserveSold)} vendus
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  {product === 'OEUF' ? (
                    <AppText size="small" weight="semibold" color="success" style={{ marginTop: spacing.xs }}>
                      {formatEggAlveoles(reserveEggs)} à vendre · vente par alvéole (30 œufs)
                    </AppText>
                  ) : product === 'PROVENDE' ? (
                    <AppText size="small" color="muted" style={{ marginTop: spacing.xs }}>
                      Provende vendue {reserveUnit === 'KG' ? 'au kilo' : 'par sac (prix unitaire sac)'}
                      {reserveUnit === 'KG' ? ' · marge boutique' : ''}.
                    </AppText>
                  ) : null}
                </Card>
              ) : transferList.length > 0 ? (
                <AppText size="caption" color="muted" style={{ marginTop: 8 }}>
                  Sélectionnez une réserve ci-dessous pour afficher son stock.
                </AppText>
              ) : (
                <AppText size="caption" color="muted" style={{ marginTop: 8 }}>
                  {reserveEmpty}
                </AppText>
              )}
              {transferList.length > 1 ? (
                <View style={styles.rowWrap}>
                  {transferList.map((t) => (
                    <Pressable key={t.id} onPress={() => selectReserve(t)} accessibilityRole="button">
                      <Chip label={reserveLabel(t)} tone="accent" selected={t.id === poolId} style={styles.chip} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            {/* ── 2 · ARTICLE À VENDRE ────────────────────────────────── */}
            <View>
              <StepTitle n={2} label="Article à vendre" />
              {!transfer ? (
                <AppText size="caption" color="muted" style={{ marginTop: 8 }}>
                  Sélectionnez une réserve ci-dessus pour afficher l{'\u2019'}article à vendre.
                </AppText>
              ) : boutiqueReserveType === 'ABATTU' ? (
                <>
                  <View style={styles.catRow}>
                    <View style={styles.catTab}>
                      <Chip
                        label={`Abattu · ${fmt(reserveRemaining)} carc.`}
                        tone="brand"
                        selected
                        style={styles.catChip}
                      />
                    </View>
                  </View>
                  <View style={styles.unitRow}>
                    <Segmented<'PIECE' | 'KG'>
                      haptic
                      value={isKg ? 'KG' : 'PIECE'}
                      onChange={(u) => selectProduct(u === 'KG' ? 'ABATTU_KG' : 'ABATTU_PIECE')}
                      options={[
                        { key: 'PIECE', label: 'Pièce', tint: palette.brand[600] },
                        { key: 'KG', label: 'Au kg', tint: palette.accent[600] },
                      ]}
                    />
                  </View>
                  <AppText size="caption" color="muted" style={{ marginTop: 4 }}>
                    {isKg
                      ? `Prix au kg : ${fmt(price)} FCFA/kg`
                      : `Vente à la pièce depuis cette réserve.`}
                  </AppText>
                </>
              ) : boutiqueReserveType === 'OEUFS' ? (
                <>
                  <View style={styles.rowWrap}>
                    <Chip label="Œufs (alvéole)" tone="green" selected />
                  </View>
                  <AppText size="caption" color="muted" style={{ marginTop: 4 }}>
                    {formatEggAlveoles(reserveEggs)} à vendre · vente par alvéole (30 œufs)
                  </AppText>
                </>
              ) : boutiqueReserveType === 'PROVENDE' ? (
                <>
                  <View style={styles.rowWrap}>
                    <Chip label="Provende" tone="neutral" selected />
                  </View>
                  <AppText size="caption" color="muted" style={{ marginTop: 4 }}>
                    Provende vendue {reserveUnit === 'KG' ? 'au kilo' : 'par sac'} · {fmtQty(reserveRemaining)} restant
                  </AppText>
                </>
              ) : null}
            </View>
          </>
        ) : (
          <>
            {/* ── 1 · LOT & STOCK DISPONIBLE ─────────────────────────── */}
            <View>
              <StepTitle n={1} label="Lot & stock disponible" />
              <Card tone={notReady ? 'warn' : 'default'} style={styles.lotPanel}>
                <View style={styles.lotPanelHead}>
                  <View style={styles.lotPanelIcon}>
                    {lot && breedImageForLot(lot.breedName, lot.species) ? (
                      <Image
                        source={breedImageForLot(lot.breedName, lot.species) as number}
                        style={styles.lotPanelImg}
                      />
                    ) : (
                      <AppText size="h2" color="faint">
                        {lot ? (SPECIES_ICONS[lot.species] ?? '🐔') : '🐔'}
                      </AppText>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText size="h3" weight="bold" color="text" numberOfLines={1}>
                      {lot?.batchName ?? 'Lot'}
                    </AppText>
                    <AppText size="small" color="muted">
                      {[lot?.breedCode, lot?.breedName, lot?.type === 'CHAIR' ? 'Chair' : 'Pondeuse'].filter(Boolean).join(' · ') || '—'} · J
                      {lot?.metrics.ageDays ?? '—'}
                    </AppText>
                  </View>
                </View>
                <View style={styles.stockRow}>
                  {lot ? (
                    <View style={styles.stockItem}>
                      <View style={[styles.stockDot, { backgroundColor: color.green[500] }]} />
                      <AppText size="small" weight="semibold" color="text">
                        {fmt(lot.quantityAlive)} vivant
                      </AppText>
                    </View>
                  ) : null}
                  {lotAbattuCarc > 0 ? (
                    <View style={styles.stockItem}>
                      <View style={[styles.stockDot, { backgroundColor: color.accent[500] }]} />
                      <AppText size="small" weight="semibold" color="accent">
                        {fmt(lotAbattuCarc)} carcasses
                      </AppText>
                    </View>
                  ) : null}
                  {eggStockAvailableEggs > 0 || product === 'OEUF' ? (
                    <View style={styles.stockItem}>
                      <View style={[styles.stockDot, { backgroundColor: color.ink[400] }]} />
                      <AppText size="small" weight="semibold" color="text">
                        {fmt(eggStockAvailableEggs)} œufs · {formatEggAlveoles(eggStockAvailableEggs)}
                        {eggStockAvailable > 0 ? ` · ${fmt(eggStockAvailable)} alv. à vendre` : ''}
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
            </View>

            {/* ── 2 · ARTICLE À VENDRE ───────────────────────────────── */}
            <View>
              <StepTitle n={2} label="Article à vendre" />
              {!lot ? (
                <View style={styles.rowWrap}>
                  {productOptions.map((p) => (
                    <Pressable key={p.key} onPress={() => selectProduct(p.key)} accessibilityRole="button">
                      <Chip label={p.label} tone={isAbattu ? 'amber' : 'accent'} selected={p.key === product} style={styles.chip} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <>
                  <View style={styles.catRow}>
                    <Pressable onPress={() => selectProduct('PIECE')} accessibilityRole="button" style={styles.catTab}>
                      <Chip
                        label={`Sur pied · ${fmt(lotVivants)}`}
                        tone={category === 'surPied' ? 'brand' : 'neutral'}
                        selected={category === 'surPied'}
                        style={styles.catChip}
                      />
                    </Pressable>
                    {lotAbattuCarc > 0 ? (
                      <Pressable onPress={() => selectProduct('ABATTU_PIECE')} accessibilityRole="button" style={styles.catTab}>
                        <Chip
                          label={`Abattu · ${fmt(lotAbattuCarc)}`}
                          tone={category === 'abattu' ? 'brand' : 'neutral'}
                          selected={category === 'abattu'}
                          style={styles.catChip}
                        />
                      </Pressable>
                    ) : null}
                    {eggStockAvailableEggs > 0 ? (
                      <Pressable onPress={() => selectProduct('OEUF')} accessibilityRole="button" style={styles.catTab}>
                        <Chip
                          label={`Œufs · ${fmt(eggStockAvailableEggs)}`}
                          tone={category === 'oeufs' ? 'brand' : 'neutral'}
                          selected={category === 'oeufs'}
                          style={styles.catChip}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                  {category === 'abattu' && lotPools.length > 0 ? (
                    <View style={styles.rowWrap}>
                      {lotPools.map((p) => (
                        <Pressable key={p.id} onPress={() => selectPool(p)} accessibilityRole="button">
                          <Chip
                            label={`Ordre ${p.referenceNumber} · ${fmt(p.carcassesAvailable ?? 0)} carc.`}
                            tone="brand"
                            selected={p.id === poolId}
                            style={styles.chip}
                          />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {category === 'surPied' || category === 'abattu' ? (
                    <View style={styles.unitRow}>
                      <Segmented<'PIECE' | 'KG'>
                        key={category}
                        haptic
                        value={isKg ? 'KG' : 'PIECE'}
                        onChange={(u) =>
                          selectProduct(category === 'abattu' ? (u === 'KG' ? 'ABATTU_KG' : 'ABATTU_PIECE') : u)
                        }
                        options={[
                          { key: 'PIECE', label: 'Pièce', tint: palette.brand[600] },
                          { key: 'KG', label: 'Au kg', tint: palette.accent[600] },
                        ]}
                      />
                    </View>
                  ) : null}
{category === 'oeufs' ? (
                    <AppText size="caption" color="muted" style={{ marginTop: 4 }}>
                      {fmt(eggStockAvailableEggs)} œufs disponibles sur ce lot · {fmt(eggStockAvailable)} alvéole
                      {eggStockAvailable !== 1 ? 's complètes' : ' complète'} à vendre
                      {eggStockAvailableEggs > 0 && eggStockAvailable === 0
                        ? ' (œufs restants, pas encore une alvéole pleine de 30)'
                        : ''} · vente par alvéole (30 œufs)
                    </AppText>
                  ) : null}
                </>
              )}
            </View>
          </>
        )}

        {/* ── 3 · QUANTITÉ & PRIX ─────────────────────────────────── */}
        <View>
          <StepTitle n={3} label="Quantité & prix" />
          <Card tone="default" style={styles.detailCard}>
            <View style={styles.fieldBlock}>
              <View style={styles.fieldHead}>
                <AppText size="caption" weight="bold" color="muted">
                  QUANTITÉ
                </AppText>
                {maxQty > 0 && product !== 'AUTRE' ? (
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
                suffix={unitSuffix}
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
                    Total = {fmt(weightKg)} kg × {fmt(price)} FCFA = {fmt(weightKg * price)} FCFA
                  </AppText>
                </View>
              ) : null}
              {abattuMode === 'transfer' && transfer ? (
                <AppText size="caption" color="muted">
                  {product === 'OEUF'
                    ? `${fmt(reserveRemaining)} alvéole(s) restante(s) sur cette réserve`
                    : product === 'PROVENDE'
                      ? `${fmt(reserveRemaining)} ${reserveUnit === 'KG' ? 'kg' : 'sac(s)'} restant(s) sur cette réserve`
                      : `${fmt(reserveRemaining)} carcasse(s) restante(s) sur cette réserve`}
                </AppText>
              ) : null}
            </View>

            <View style={styles.fieldDivider} />

            <View style={styles.fieldBlock}>
              <View style={styles.fieldHead}>
                <AppText size="caption" weight="bold" color="muted">
                  PRIX UNITAIRE
                </AppText>
                {meta.unitPrice > 0 ? (
                  <Pressable
                    onPress={() => {
                      setPrice(meta.unitPrice);
                      setError(null);
                    }}
                    accessibilityRole="button">
                    <AppText size="caption" weight="semibold" color="brand">
                      conseillé : {fmt(meta.unitPrice)} FCFA
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
                  / {product === 'PROVENDE' && reserveUnit ? (reserveUnit === 'KG' ? 'kg' : 'sac') : meta.priceUnit}
                </AppText>
              </View>
            </View>
          </Card>
        </View>

        {error ? (
          <AppText size="small" weight="semibold" color="danger">
            {error}
          </AppText>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
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
    marginTop: 8,
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
  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
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
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    marginBottom: 2,
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
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
