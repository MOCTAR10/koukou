import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { CreditCard } from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { NumberInput } from '../ui/NumberInput';
import { Segmented } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import { SPECIES_ICONS, speciesLabel } from '@/api/format';
import type { PosProduct } from '@/api/mutations';
import { DEFAULT_AVG_WEIGHT_KG } from '@/api/mutations';
import type { BatchWithMetrics, StockTransfer, PointOfSaleKind, SlaughterOrder } from '@/api/types';
import { color, palette, radii, spacing, fmt } from '@/constants/theme';

import { lineAmount } from './helpers';
import { posCatalog, productMeta, transferRemaining } from './catalog';
import type { PosLine } from './types';

interface PosLineSheetProps {
  visible: boolean;
  lots: BatchWithMetrics[];
  pools: SlaughterOrder[];
  /** Transferts de stock ferme → boutique (exclusif au PDV BOUTIQUE). */
  transfers?: StockTransfer[];
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

export function PosLineSheet({
  visible,
  lots,
  pools,
  transfers = [],
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

  useEffect(() => {
    if (!visible) return;
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
      setPrice(
        presetTransfer?.productType === 'PROVENDE' && presetTransfer.inputLot?.unitPriceFcfa
          ? presetTransfer.inputLot.unitPriceFcfa
          : productMeta(posKind, presetKey).unitPrice,
      );
    }
    setError(null);
  }, [visible, initial, presetBatchId, presetTransferId, presetTransferProductType, transfers, lots, isBoutique, posKind]);

  const isAbattu = product === 'ABATTU_PIECE' || product === 'ABATTU_KG';
  const isKg = product === 'KG' || product === 'ABATTU_KG';
  const isReserveProduct = isAbattu || product === 'OEUF' || product === 'PROVENDE';
  const meta = productMeta(posKind, product);

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
  const reserveUnit: 'SAC' | 'KG' | null =
    product === 'PROVENDE' ? provenUnit ?? ((transfer?.unit as 'SAC' | 'KG') ?? 'SAC') : null;

  const flockUsed = (committed ?? [])
    .filter((l) => l.uid !== initial?.uid && l.batchId === lotId && l.slaughterOrderId == null)
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
      : product === 'OEUF' ? 200 :
      abattuMode === 'pool'
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
      label: meta.label,
    };
    return lineAmount(previewLine);
  })();

  const selectProduct = (key: PosProduct) => {
    setProduct(key);
    setError(null);
    setPrice(productMeta(posKind, key).unitPrice);
    if (isBoutique) {
      setAbattuMode(transferProductTypeForKey[key] != null ? 'transfer' : 'direct');
      setPoolId('');
      if (key !== 'PROVENDE') setProvenUnit(null);
      return;
    }
    if (key === 'ABATTU_PIECE' || key === 'ABATTU_KG') {
      setAbattuMode(poolList.length > 0 ? 'pool' : 'direct');
      return;
    }
    setAbattuMode('direct');
    setPoolId('');
    if (key === 'OEUF' || key === 'AUTRE') {
      setLotId('');
    }
  };

  const save = () => {
    if (qty <= 0) {
      setError('Indiquez une quantité.');
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
    if ((product === 'PIECE' || product === 'KG') && !lotId) {
      setError('Sélectionnez un lot.');
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
      label: meta.label,
    });
    onClose();
  };

  const reserveTitle =
    transferType === 'ABATTU'
      ? 'RÉSERVE EN BOUTIQUE · CARCASSES'
      : transferType === 'OEUFS'
        ? 'RÉSERVE EN BOUTIQUE · ŒUFS'
        : transferType === 'PROVENDE'
          ? 'RÉSERVE EN BOUTIQUE · PROVENDE'
          : 'RÉSERVE EN BOUTIQUE';

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
    if (t.productType === 'PROVENDE') {
      setProvenUnit((t.unit as 'SAC' | 'KG') ?? 'SAC');
      setPrice(t.inputLot?.unitPriceFcfa ?? productMeta(posKind, product).unitPrice);
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

  const reserveDetail = (t: StockTransfer) => {
    if (t.productType === 'OEUFS') {
      return `${t.batch?.batchName ?? 'Lot'} · ${SPECIES_ICONS[(t.batch?.species ?? 'POULET')] ?? ''} ${speciesLabel(t.batch?.species)} · reçu le ${t.createdAt.slice(0, 10)}`;
    }
    if (t.productType === 'PROVENDE') {
      const q = t.unit === 'KG' ? `${fmt(t.quantity)} kg` : `${fmt(t.quantity)} sac(s)`;
      return `${t.inputLot?.productName ?? 'Provende'} · ${q} transférés · reçu le ${t.createdAt.slice(0, 10)}`;
    }
    return `${t.slaughterOrder?.referenceNumber ?? ''} · ${SPECIES_ICONS[(t.slaughterOrder?.batch?.species ?? 'POULET')] ?? ''} ${speciesLabel(t.slaughterOrder?.batch?.species)} · reçu le ${t.createdAt.slice(0, 10)}`;
  };

  const sourceSelector = isBoutique ? (
    <View>
      <AppText size="label" color="muted">
        {reserveTitle}
      </AppText>
      <View style={styles.rowWrap}>
        {transferList.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => selectReserve(t)}
            accessibilityRole="button">
            <Chip
              label={reserveLabel(t)}
              tone="accent"
              selected={t.id === poolId}
              style={styles.chip}
            />
          </Pressable>
        ))}
        {transferList.length === 0 ? (
          <AppText size="caption" color="muted">
            {reserveEmpty}
          </AppText>
        ) : null}
      </View>
      {transfer ? (
        <AppText size="caption" color="faint">
          {reserveDetail(transfer)}
        </AppText>
      ) : null}
    </View>
  ) : isAbattu && poolList.length > 0 ? (
    <View>
      <AppText size="label" color="muted">
        SOURCE
      </AppText>
      <View style={{ marginTop: 6 }}>
        <Segmented<AbattuMode>
          value={abattuMode}
          onChange={(m) => {
            setAbattuMode(m);
            setError(null);
          }}
          options={[
            { key: 'direct', label: 'Abattage direct', tint: palette.accent[600] },
            { key: 'pool', label: `Carcasses · ${fmt(poolList.reduce((a, p) => a + (p.carcassesAvailable ?? 0), 0))}`, tint: palette.brand[600] },
          ]}
        />
      </View>
    </View>
  ) : null;

  const poolSelector =
    abattuMode === 'pool' ? (
      <View>
        <AppText size="label" color="muted">
          LOT DE CARCASSES (ABATTOIR)
        </AppText>
        <View style={styles.rowWrap}>
          {poolList.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => {
                setPoolId(p.id);
                setError(null);
              }}
              accessibilityRole="button">
              <Chip
                label={`${p.batch.batchName ?? p.batch.id} · ${fmt(p.carcassesAvailable ?? 0)} carc.`}
                tone={isBoutique ? 'accent' : 'brand'}
                selected={p.id === poolId}
                style={styles.chip}
              />
            </Pressable>
          ))}
          {poolList.length === 0 ? (
            <AppText size="caption" color="muted">
              Aucune carcasse disponible en ce moment.
            </AppText>
          ) : null}
        </View>
        {pool ? (
          <AppText size="caption" color="faint">
            {pool.batch.batchName} · {SPECIES_ICONS[pool.batch.species] ?? ''} {speciesLabel(pool.batch.species)} · {pool.referenceNumber}
          </AppText>
        ) : null}
      </View>
    ) : abattuMode === 'direct' ? (
      <View>
        <AppText size="label" color="muted">
          LOT
        </AppText>
        <View style={styles.rowWrap}>
          {sellable.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => {
                setLotId(b.id);
                setError(null);
              }}
              accessibilityRole="button">
              <Chip
                label={`${SPECIES_ICONS[b.species] ?? ''} ${b.customSpecies ?? speciesLabel(b.species)} · ${fmt(b.quantityAlive)}`}
                tone={b.status === 'EN_VENTE' ? 'green' : 'brand'}
                selected={b.id === lotId}
                style={styles.chip}
              />
            </Pressable>
          ))}
          {sellable.length === 0 ? (
            <AppText size="caption" color="muted">
              Aucun lot à vendre.
            </AppText>
          ) : null}
        </View>
      </View>
    ) : null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={initial ? 'Modifier l’article' : 'Ajouter un article'}
      subtitle={isBoutique ? 'Produit boutique, réserve et quantité' : 'Produit, lot et quantité'}
      icon={<CreditCard size={22} color={color.accent[600]} />}
      accentColor={color.accent[400]}>
      <View style={{ gap: spacing.lg }}>
        <View>
          <AppText size="label" color="muted">
            PRODUIT
          </AppText>
          <View style={styles.rowWrap}>
            {products.map((p) => (
              <Pressable key={p.key} onPress={() => selectProduct(p.key)} accessibilityRole="button">
                <Chip label={p.label} tone={isAbattu ? 'amber' : 'accent'} selected={p.key === product} style={styles.chip} />
              </Pressable>
            ))}
          </View>
          {isBoutique ? (
            <AppText size="caption" color="faint" style={{ marginTop: 4 }}>
              Boutique : ventes uniquement depuis les réserves transférées de la ferme.
            </AppText>
          ) : null}
        </View>

        {(isBoutique || isAbattu) ? sourceSelector : null}

        {isAbattu ? poolSelector : null}

        <Card tone="default" style={{ gap: spacing.sm }}>
          <View style={styles.priceRow}>
            <AppText size="caption" color="muted">
              PRIX UNITAIRE{transfer && product === 'PROVENDE' && transfer.inputLot?.unitPriceFcfa ? ` · CONSEILLÉ ${fmt(transfer.inputLot.unitPriceFcfa)} FCFA` : ` · CONSEILLÉ ${fmt(meta.unitPrice)} FCFA`}
            </AppText>
            <View style={styles.priceInputWrap}>
              <TextInput
                value={price > 0 ? String(price) : ''}
                onChangeText={(t) => {
                  const n = parseInt(t.replace(/\D/g, ''), 10);
                  setPrice(Number.isFinite(n) ? n : 0);
                  setError(null);
                }}
                placeholder="FCFA"
                placeholderTextColor={color.ink[300]}
                keyboardType="number-pad"
                style={styles.priceInput}
              />
              <AppText size="body" weight="semibold" color="text">
                / {product === 'PROVENDE' && reserveUnit ? (reserveUnit === 'KG' ? 'kg' : 'sac') : meta.priceUnit}
              </AppText>
            </View>
          </View>
          {isKg ? (
            <AppText size="caption" color="muted">
              {fmt(qty)} oiseaux · ≈ {fmt(Math.round(qty * DEFAULT_AVG_WEIGHT_KG * 100) / 100)} kg · décompte par oiseaux
            </AppText>
          ) : null}
          <NumberInput
            value={qty > 0 ? String(qty) : ''}
            onChangeText={(t) => {
              setQty(Math.min(parseInt(t, 10) || 0, Math.max(maxQty, 1)));
              setError(null);
            }}
            suffix={product === 'PROVENDE' && reserveUnit ? (reserveUnit === 'KG' ? 'kg' : 'sac') : meta.unit}
            placeholder="0"
          />
          {abattuMode === 'transfer' && transfer ? (
            <AppText size="caption" color="muted">
              {product === 'OEUF'
                ? `${fmt(transferRemaining(transfer.quantity, transfer.quantitySold))} alvéole(s) restante(s) sur cette réserve`
                : product === 'PROVENDE'
                  ? `${fmt(transferRemaining(transfer.quantity, transfer.quantitySold))} ${reserveUnit === 'KG' ? 'kg' : 'sac(s)'} restant(s) sur cette réserve`
                  : `${fmt(transferRemaining(transfer.quantity, transfer.quantitySold))} carcasse(s) restante(s) sur cette réserve`}
            </AppText>
          ) : null}
        </Card>

        {error ? (
          <AppText size="small" color="danger">
            {error}
          </AppText>
        ) : null}

        <View style={styles.totalRow}>
          <View style={{ flex: 1 }}>
            <AppText size="label" color="muted">
              SOUS-TOTAL
            </AppText>
            <AppText size="h2" weight="bold" color="accent">
              {fmt(preview)} FCFA
            </AppText>
          </View>
          <View style={{ width: 150 }}>
            <Button label={initial ? 'Mettre à jour' : 'Ajouter'} tone="accent" disabled={qty <= 0 || price <= 0} onPress={save} />
          </View>
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
  chip: {
    marginBottom: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceInput: {
    height: 44,
    minWidth: 120,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    fontSize: 17,
    fontWeight: '700',
    color: color.ink[800],
    backgroundColor: color.surface,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
});