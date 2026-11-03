import React, { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react-native';

import { fetchBatches, fetchSlaughterOrders } from '@/api';
import {
  createFarmListing,
  fetchReadyDateSuggestion,
  updateFarmListing,
  type FarmMarketListing,
  type MarketKind,
  type MarketListingBody,
  type MarketProduct,
} from '@/api/market';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { NumberInput } from '@/components/ui/NumberInput';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { color, radii, semantic } from '@/constants/theme';
import { dayLabel, PRODUCT_NAME, unitName, wholeNumber } from './rules';
import { DateField, invalidateFarmMarket, Labeled, marketError, Notice } from './shared';

function tomorrow(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

function SourceRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        padding: 12,
        borderRadius: radii.md,
        borderWidth: 1.5,
        borderColor: selected ? color.brand[500] : semantic.border,
        backgroundColor: selected ? color.brand[50] : semantic.surface,
      }}>
      <AppText size="small" weight={selected ? 'semibold' : 'regular'}>
        {label}
      </AppText>
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <AppText size="body">{label}</AppText>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: color.brand[500] }} />
    </View>
  );
}

/** Creates a draft, or edits a listing. Kind, product and lot are fixed once created. */
export function ListingSheet({ farmId, listing, onClose }: { farmId: string; listing?: FarmMarketListing; onClose: () => void }) {
  const client = useQueryClient();
  const editing = !!listing;
  const [kind, setKind] = useState<MarketKind>(listing?.kind ?? 'NOW');
  const [product, setProduct] = useState<MarketProduct>(listing?.product ?? 'BIRDS');
  const [batchId, setBatchId] = useState(listing?.batchId ?? '');
  const [slaughterOrderId, setSlaughterOrderId] = useState(listing?.slaughterOrderId ?? '');
  const [price, setPrice] = useState(listing ? String(listing.unitPriceFcfa) : '');
  const [quantity, setQuantity] = useState(listing ? String(listing.quantityPublished) : '');
  const [minOrder, setMinOrder] = useState(listing ? String(listing.minOrderQty) : '1');
  const [readyDate, setReadyDate] = useState(listing?.readyDate ?? '');
  const [depositPct, setDepositPct] = useState(listing?.depositPct != null ? String(listing.depositPct) : '');
  const [pickup, setPickup] = useState(listing?.pickupAvailable ?? true);
  const [delivery, setDelivery] = useState(listing?.deliveryAvailable ?? false);
  const [fee, setFee] = useState(listing?.deliveryFeeFcfa ? String(listing.deliveryFeeFcfa) : '');
  const [description, setDescription] = useState(listing?.description ?? '');
  const [targetWeight, setTargetWeight] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPre = kind === 'PRE';
  const dateLocked = editing && listing.status !== 'DRAFT';

  const batchesQuery = useQuery({
    queryKey: ['batches', farmId],
    queryFn: () => fetchBatches(farmId),
    enabled: !editing && product !== 'CARCASS',
  });
  const poolsQuery = useQuery({
    queryKey: ['slaughter-orders', farmId],
    queryFn: () => fetchSlaughterOrders(farmId),
    enabled: !editing && product === 'CARCASS',
  });
  const batches = (batchesQuery.data ?? []).filter(
    (b) => (b.status === 'ACTIF' || b.status === 'EN_VENTE') && (product !== 'EGGS' || b.type === 'PONDEUSE'),
  );
  const pools = (poolsQuery.data ?? []).filter(
    (p) => p.status === 'PROCESSED' && p.slaughterType === 'ABATTU' && (p.carcassesAvailable ?? 0) > 0,
  );

  const suggest = useMutation({
    mutationFn: () => fetchReadyDateSuggestion(farmId, batchId, Number(targetWeight.replace(',', '.')) || undefined),
    onSuccess: ({ suggestion }) => {
      if (!suggestion) {
        setHint('Pas de suggestion pour ce lot : choisissez la date vous-même.');
        return;
      }
      setReadyDate(suggestion.readyDate);
      setHint(
        `Suggestion : ${dayLabel(suggestion.readyDate)}, ${
          suggestion.source === 'BREED_CURVE' ? 'd’après la courbe de poids de la race' : 'd’après l’âge minimum de vente'
        }. Vous pouvez la changer.`,
      );
    },
    onError: (e) => setHint(marketError(e)),
  });

  const save = useMutation({
    mutationFn: () => {
      const common: MarketListingBody = {
        description: description.trim() || undefined,
        unitPriceFcfa: wholeNumber(price),
        quantityPublished: wholeNumber(quantity),
        minOrderQty: wholeNumber(minOrder) || 1,
        pickupAvailable: pickup,
        deliveryAvailable: delivery,
        deliveryFeeFcfa: delivery ? wholeNumber(fee) : 0,
      };
      if (editing) {
        return updateFarmListing(farmId, listing.id, {
          ...common,
          ...(dateLocked || !isPre ? {} : { readyDate }),
          ...(isPre ? { depositPct: depositPct.trim() ? wholeNumber(depositPct) : null } : {}),
        });
      }
      return createFarmListing(farmId, {
        ...common,
        kind,
        product,
        ...(product === 'CARCASS' ? { slaughterOrderId } : { batchId }),
        ...(isPre ? { readyDate, depositPct: depositPct.trim() ? wholeNumber(depositPct) : undefined } : {}),
      });
    },
    onSuccess: () => {
      invalidateFarmMarket(client, farmId);
      onClose();
    },
    onError: (e) => setError(marketError(e)),
  });

  const submit = () => {
    if (!editing && product === 'CARCASS' && !slaughterOrderId) return setError('Choisissez l’abattage dont viennent les carcasses.');
    if (!editing && product !== 'CARCASS' && !batchId) return setError('Choisissez un lot.');
    if (wholeNumber(price) < 1) return setError('Indiquez un prix unitaire.');
    if (wholeNumber(quantity) < 1) return setError('Indiquez une quantité à publier.');
    if (isPre && !readyDate) return setError('Indiquez la date de disponibilité.');
    if (!pickup && !delivery) return setError('Proposez au moins le retrait à la ferme ou la livraison.');
    setError(null);
    save.mutate();
  };

  const pickProduct = (next: MarketProduct) => {
    setProduct(next);
    setBatchId('');
    setSlaughterOrderId('');
    setHint(null);
    if (next !== 'BIRDS') setKind('NOW');
  };

  return (
    <Sheet
      visible
      title={editing ? 'Modifier l’annonce' : 'Nouvelle annonce'}
      onClose={onClose}
      footer={<Button label={editing ? 'Enregistrer' : 'Enregistrer le brouillon'} loading={save.isPending} onPress={submit} />}>
      <View style={{ gap: 14 }}>
        {!editing ? (
          <>
            <Labeled label="Produit">
              <Segmented<MarketProduct>
                value={product}
                onChange={pickProduct}
                options={(Object.keys(PRODUCT_NAME) as MarketProduct[]).map((key) => ({ key, label: PRODUCT_NAME[key] }))}
              />
            </Labeled>
            {product === 'BIRDS' ? (
              <Labeled label="Vente">
                <Segmented<MarketKind>
                  value={kind}
                  onChange={setKind}
                  options={[
                    { key: 'NOW', label: 'Maintenant' },
                    { key: 'PRE', label: 'Précommande' },
                  ]}
                />
              </Labeled>
            ) : null}
            {product === 'CARCASS' ? (
              <Labeled label="Abattage">
                <View style={{ gap: 6 }}>
                  {pools.length === 0 ? <AppText size="small" color="muted">{poolsQuery.isLoading ? 'Chargement…' : 'Aucun abattage traité avec des carcasses disponibles.'}</AppText> : null}
                  {pools.map((p) => (
                    <SourceRow key={p.id} label={`${p.referenceNumber} · ${p.carcassesAvailable} carcasses`} selected={p.id === slaughterOrderId} onPress={() => setSlaughterOrderId(p.id)} />
                  ))}
                </View>
              </Labeled>
            ) : (
              <Labeled label="Lot">
                <View style={{ gap: 6 }}>
                  {batches.length === 0 ? <AppText size="small" color="muted">{batchesQuery.isLoading ? 'Chargement…' : 'Aucun lot actif pour ce produit.'}</AppText> : null}
                  {batches.map((b) => (
                    <SourceRow
                      key={b.id}
                      label={`${b.batchName ?? 'Lot'} · ${product === 'EGGS' ? `${b.metrics.eggStockAvailableAlveoles ?? 0} alvéoles` : `${b.metrics.liveCount} oiseaux`}`}
                      selected={b.id === batchId}
                      onPress={() => setBatchId(b.id)}
                    />
                  ))}
                </View>
              </Labeled>
            )}
          </>
        ) : (
          <Notice tone="info">
            {PRODUCT_NAME[listing.product]}
            {listing.batchName ? ` · ${listing.batchName}` : ''}
          </Notice>
        )}

        <Labeled label={`Prix par ${unitName(product)}`}>
          <NumberInput value={price} onChangeText={setPrice} suffix="FCFA" />
        </Labeled>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Labeled label="Quantité publiée">
              <NumberInput value={quantity} onChangeText={setQuantity} />
            </Labeled>
          </View>
          <View style={{ flex: 1 }}>
            <Labeled label="Commande minimale">
              <NumberInput value={minOrder} onChangeText={setMinOrder} />
            </Labeled>
          </View>
        </View>

        {isPre ? (
          <View style={{ gap: 12, padding: 12, borderRadius: radii.md, backgroundColor: semantic.surfaceAlt }}>
            {dateLocked ? (
              <AppText size="small" color="muted">
                Prêts le {dayLabel(readyDate)}. Pour changer cette date, utilisez « Déplacer la date » : les acheteurs en seront informés.
              </AppText>
            ) : (
              <>
                <Labeled label="Date de disponibilité">
                  <DateField value={readyDate} onChange={setReadyDate} minimumDate={tomorrow()} placeholder="Date de disponibilité" />
                </Labeled>
                <Labeled label="Poids visé (facultatif)">
                  <NumberInput value={targetWeight} onChangeText={setTargetWeight} decimal suffix="kg" />
                </Labeled>
                <Button label="Suggérer une date" icon={Sparkles} tone="ghost" size="md" disabled={!batchId} loading={suggest.isPending} onPress={() => suggest.mutate()} />
                {hint ? <AppText size="caption" color="muted">{hint}</AppText> : null}
              </>
            )}
            <Labeled label="Acompte (facultatif)" hint="Le client aura 24 h après votre acceptation pour vous le remettre, sinon la commande est annulée.">
              <NumberInput value={depositPct} onChangeText={setDepositPct} suffix="%" maxLength={3} />
            </Labeled>
          </View>
        ) : null}

        <ToggleRow label="Retrait à la ferme" value={pickup} onChange={setPickup} />
        <ToggleRow label="Livraison par la ferme" value={delivery} onChange={setDelivery} />
        {delivery ? (
          <Labeled label="Frais de livraison">
            <NumberInput value={fee} onChangeText={setFee} suffix="FCFA" />
          </Labeled>
        ) : null}
        <Labeled label="Description (facultatif)">
          <TextField value={description} onChangeText={setDescription} multiline maxLength={500} accessibilityLabel="Description" />
        </Labeled>
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </View>
    </Sheet>
  );
}
