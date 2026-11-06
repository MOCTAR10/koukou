import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';

import { createMarketOrder, type MarketFulfilment, type MarketListing } from '@/api/market';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { NumberInput } from '@/components/ui/NumberInput';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { isGabonPhoneValid } from '@/constants/phone';
import { fmtFcfa, semantic } from '@/constants/theme';
import { depositFor, orderTotal, unitName, wholeNumber } from './rules';
import { DateField, invalidateBuyerQueries, Labeled, marketError, Notice } from './shared';

function newKey(): string {
  return `mobile-market-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function OrderSheet({ listing, visible, onClose }: { listing: MarketListing; visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const client = useQueryClient();
  const [quantity, setQuantity] = useState(String(listing.minOrderQty));
  const [fulfilment, setFulfilment] = useState<MarketFulfilment>(listing.pickupAvailable ? 'PICKUP' : 'DELIVERY');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [desiredDate, setDesiredDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Same content, same key: a retry after a lost answer can't create a second request.
  const idempotency = useRef<{ signature: string; key: string } | null>(null);

  const qty = wholeNumber(quantity);
  const unit = (n: number) => unitName(listing.product, n);
  const deposit = depositFor(qty, listing.unitPriceFcfa, listing.depositPct);

  const submit = useMutation({
    mutationFn: () => {
      const content = {
        listingId: listing.id,
        quantity: qty,
        fulfilment,
        address: fulfilment === 'DELIVERY' ? address.trim() : undefined,
        contactPhone: phone.trim() || undefined,
        note: note.trim() || undefined,
        desiredDate: listing.kind === 'NOW' && desiredDate ? desiredDate : undefined,
      };
      const signature = JSON.stringify(content);
      if (idempotency.current?.signature !== signature) idempotency.current = { signature, key: newKey() };
      return createMarketOrder({ ...content, idempotencyKey: idempotency.current.key });
    },
    onSuccess: (order) => {
      invalidateBuyerQueries(client);
      onClose();
      router.push(`/achat/${order.id}` as Href);
    },
    onError: (e) => setError(marketError(e)),
  });

  const send = () => {
    if (qty < listing.minOrderQty) return setError(`Commandez au moins ${listing.minOrderQty} ${unit(listing.minOrderQty)}.`);
    if (qty > listing.availableQuantity) return setError(`Il reste ${listing.availableQuantity} ${unit(listing.availableQuantity)}.`);
    if (fulfilment === 'DELIVERY' && !address.trim()) return setError('Indiquez l’adresse de livraison.');
    if (phone.trim() && !isGabonPhoneValid(phone)) return setError('Numéro invalide : 9 chiffres commençant par 0.');
    setError(null);
    submit.mutate();
  };

  return (
    <Sheet
      visible={visible}
      title={listing.kind === 'PRE' ? 'Précommander' : 'Commander'}
      subtitle={`${fmtFcfa(listing.unitPriceFcfa)} / ${unit(1)}`}
      onClose={onClose}
      footer={<Button label="Envoyer ma demande" loading={submit.isPending} onPress={send} />}>
      <View style={{ gap: 14 }}>
        <Labeled label={`Quantité (${unit(2)})`} hint={`Minimum ${listing.minOrderQty}, ${listing.availableQuantity} disponibles.`}>
          <NumberInput value={quantity} onChangeText={setQuantity} />
        </Labeled>
        {listing.pickupAvailable && listing.deliveryAvailable ? (
          <Labeled label="Mode de remise" hint={listing.deliveryFeeFcfa ? `Frais de livraison : ${fmtFcfa(listing.deliveryFeeFcfa)}` : undefined}>
            <Segmented<MarketFulfilment>
              value={fulfilment}
              onChange={setFulfilment}
              options={[
                { key: 'PICKUP', label: 'Retrait' },
                { key: 'DELIVERY', label: 'Livraison' },
              ]}
            />
          </Labeled>
        ) : (
          <AppText size="small" color="muted">
            {fulfilment === 'DELIVERY' ? `Livraison par la ferme (${fmtFcfa(listing.deliveryFeeFcfa)})` : 'Retrait à la ferme'}
          </AppText>
        )}
        {fulfilment === 'DELIVERY' ? (
          <Labeled label="Adresse de livraison">
            <TextField value={address} onChangeText={setAddress} maxLength={200} accessibilityLabel="Adresse de livraison" />
          </Labeled>
        ) : null}
        {listing.kind === 'NOW' ? (
          <Labeled label="Date souhaitée (facultatif)">
            <DateField value={desiredDate} onChange={setDesiredDate} minimumDate={new Date()} placeholder="Date souhaitée" />
          </Labeled>
        ) : null}
        <Labeled label="Téléphone de contact (facultatif)" hint="Si différent de celui de votre compte.">
          <PhoneInput compact value={phone} onChangeText={setPhone} />
        </Labeled>
        <Labeled label="Message à la ferme (facultatif)">
          <TextField value={note} onChangeText={setNote} multiline maxLength={500} accessibilityLabel="Message à la ferme" />
        </Labeled>

        <View style={{ gap: 4, padding: 12, borderRadius: 12, backgroundColor: semantic.surfaceAlt }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText size="small" color="muted">Total</AppText>
            <AppText size="body" weight="bold">{fmtFcfa(orderTotal(qty, listing.unitPriceFcfa, fulfilment, listing.deliveryFeeFcfa))}</AppText>
          </View>
          {deposit > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText size="small" color="muted">Acompte ({listing.depositPct} %)</AppText>
              <AppText size="body" weight="semibold">{fmtFcfa(deposit)}</AppText>
            </View>
          ) : null}
        </View>

        {deposit > 0 ? (
          <Notice tone="warning" icon={AlertTriangle}>
            Une fois votre demande acceptée, vous aurez 24 heures pour remettre l’acompte de {fmtFcfa(deposit)} à la ferme. Sans cela, la précommande sera
            annulée automatiquement et les oiseaux seront remis en vente.
          </Notice>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <AppText size="caption" color="muted" align="center">
          La ferme doit accepter votre demande. Vous la payez directement : Fermia n’encaisse rien.
        </AppText>
      </View>
    </Sheet>
  );
}
