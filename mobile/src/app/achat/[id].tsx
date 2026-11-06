import React from 'react';
import { Image, Linking, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, CalendarClock, ClipboardList, Phone } from 'lucide-react-native';

import { cancelBuyerOrder, fetchBuyerOrder, withdrawBuyerOrder, type BuyerMarketOrder } from '@/api/market';
import { dateTimeLabel, dayLabel, listingTitle, timeLeft, unitName } from '@/components/market/rules';
import { invalidateBuyerQueries, listingPhoto, marketError, MarketStatusChip, Notice, TIMELINE_LABEL, useNow } from '@/components/market/shared';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { confirm, toast } from '@/components/ui/Feedback';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Spinner } from '@/components/ui/Spinner';
import { fmtFcfa, radii } from '@/constants/theme';

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <AppText size="small" color="muted">{label}</AppText>
      <AppText size="small" weight="semibold" align="right" style={{ flex: 1 }}>{value}</AppText>
    </View>
  );
}

function DepositNotice({ order }: { order: BuyerMarketOrder }) {
  const now = useNow();
  const left = order.depositDueAt ? timeLeft(order.depositDueAt, now) : null;
  return (
    <Notice tone="warning" icon={AlertTriangle}>
      Acompte à remettre : {fmtFcfa(order.depositRequiredFcfa)}.{' '}
      {order.depositDueAt
        ? left
          ? `Il vous reste ${left}, jusqu’au ${dateTimeLabel(order.depositDueAt)}. `
          : 'Le délai est dépassé : la commande va être annulée automatiquement. Contactez vite la ferme si vous avez déjà payé. '
        : ''}
      Sans acompte enregistré par la ferme à temps, la commande est annulée et les oiseaux sont remis en vente.
    </Notice>
  );
}

export default function BuyerOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['market-order', id], queryFn: () => fetchBuyerOrder(id) });
  const order = query.data;
  const pending = order?.status === 'PENDING';
  const paid = (order?.depositPaidFcfa ?? 0) > 0;

  const action = useMutation({
    mutationFn: () => (pending ? withdrawBuyerOrder(id) : cancelBuyerOrder(id)),
    onSuccess: () => invalidateBuyerQueries(client),
    onError: (e) => toast.error('Action impossible', marketError(e)),
  });

  const askConfirmation = async () => {
    if (!order) return;
    const ok = await confirm({
      title: pending ? 'Retirer la demande ?' : paid ? 'Demander l’annulation ?' : 'Annuler la commande ?',
      message: pending
        ? 'La ferme ne recevra plus cette demande.'
        : paid
          ? `La ferme a reçu ${fmtFcfa(order.depositPaidFcfa)} d’acompte. La commande reste en place tant que la ferme ne l’a pas annulée, et le remboursement est à convenir directement avec elle.`
          : `Les ${unitName(order.product, 2)} seront remis en vente.`,
      cancelLabel: 'Retour',
      confirmLabel: 'Confirmer',
      destructive: true,
    });
    if (ok) action.mutate();
  };

  const canCancel = order?.status === 'AWAITING_DEPOSIT' || order?.status === 'CONFIRMED';
  const photo = order ? listingPhoto(order) : null;

  return (
    <Screen
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={<ScreenHeader title="Ma commande" back />}>
      {query.isLoading ? <Spinner label="Chargement…" /> : null}
      {!order && query.error ? <EmptyState icon={ClipboardList} title="Chargement impossible" description={marketError(query.error)} /> : null}
      {order ? (
        <View style={{ gap: 12 }}>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {photo ? <Image source={photo} resizeMode="contain" style={{ width: 56, height: 56, borderRadius: radii.md }} /> : null}
              <View style={{ flex: 1, gap: 4, alignItems: 'flex-start' }}>
                <AppText size="bodyM" weight="bold">{listingTitle(order)}</AppText>
                <AppText size="caption" color="muted">
                  {order.farm.name}
                  {order.farm.city ? ` · ${order.farm.city}` : ''}
                </AppText>
                <MarketStatusChip status={order.status} />
              </View>
            </View>
            <Info label="Quantité" value={`${order.quantity} ${unitName(order.product, order.quantity)}`} />
            <Info label="Total" value={fmtFcfa(order.totalFcfa)} />
            {order.depositRequiredFcfa > 0 ? (
              <Info label="Acompte reçu par la ferme" value={`${fmtFcfa(order.depositPaidFcfa)} sur ${fmtFcfa(order.depositRequiredFcfa)}`} />
            ) : null}
            <Info label="Remise" value={order.fulfilment === 'DELIVERY' ? `Livraison : ${order.address ?? ''}` : 'Retrait à la ferme'} />
            {order.readyDate ? <Info label="Prêts le" value={dayLabel(order.readyDate)} /> : null}
            {order.desiredDate ? <Info label="Date souhaitée" value={dayLabel(order.desiredDate)} /> : null}
            {order.farm.phone ? (
              <Button
                label={`Appeler la ferme : ${order.farm.phone}`}
                icon={Phone}
                tone="ghost"
                size="md"
                onPress={() => void Linking.openURL(`tel:${order.farm.phone}`)}
              />
            ) : null}
          </Card>

          {order.status === 'AWAITING_DEPOSIT' ? <DepositNotice order={order} /> : null}
          {order.status === 'PENDING' && order.requestExpiresAt ? (
            <Notice tone="info">La ferme a jusqu’au {dateTimeLabel(order.requestExpiresAt)} pour répondre. Rien n’est réservé tant qu’elle n’a pas accepté.</Notice>
          ) : null}
          {order.status === 'CANCEL_REQUESTED' ? (
            <Notice tone="warning">Vous avez demandé l’annulation. Un acompte a été versé : le remboursement est à convenir avec la ferme, qui finalisera l’annulation.</Notice>
          ) : null}
          {order.status === 'REJECTED' && order.rejectReason ? <Notice tone="danger">Motif de la ferme : {order.rejectReason}</Notice> : null}
          {order.previousReadyDate && canCancel ? (
            <Notice tone="info" icon={CalendarClock}>
              La ferme a déplacé la date du {dayLabel(order.previousReadyDate)} au {dayLabel(order.readyDate)}. Sans réponse de votre part, la commande est
              maintenue. Vous pouvez aussi l’annuler.
            </Notice>
          ) : null}

          <Card style={{ gap: 8 }}>
            <AppText size="body" weight="semibold">Historique</AppText>
            {order.timeline.map((e) => (
              <View key={`${e.type}-${e.at}`} style={{ gap: 1 }}>
                <AppText size="small">{TIMELINE_LABEL[e.type] ?? e.type}</AppText>
                <AppText size="caption" color="faint">{dateTimeLabel(e.at)}</AppText>
              </View>
            ))}
          </Card>

          {pending || canCancel ? (
            <Button
              label={pending ? 'Retirer ma demande' : paid ? 'Demander l’annulation' : 'Annuler la commande'}
              tone="ghost"
              loading={action.isPending}
              onPress={() => void askConfirmation()}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
