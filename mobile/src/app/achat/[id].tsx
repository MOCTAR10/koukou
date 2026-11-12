import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { telUrl } from '@/utils/safeUrl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Banknote, CalendarClock, CalendarDays, ClipboardList, House, MapPin, Package, Phone, Truck, Wallet } from 'lucide-react-native';

import { cancelBuyerOrder, fetchBuyerOrder, withdrawBuyerOrder, type BuyerMarketOrder } from '@/api/market';
import { dateTimeLabel, dayLabel, listingTitle, timeLeft, unitName } from '@/components/market/rules';
import { FactGrid, FactTile, invalidateBuyerQueries, ListingThumb, marketError, MarketStatusChip, Notice, TIMELINE_LABEL, useNow } from '@/components/market/shared';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { confirm, toast } from '@/components/ui/Feedback';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Skeleton } from '@/components/ui/Skeleton';
import { color, fmt, fmtFcfa, radii, semantic, spacing } from '@/constants/theme';

const THUMB = 88;

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

/** The order's history as a vertical track; the latest step stands out. */
function Timeline({ events }: { events: BuyerMarketOrder['timeline'] }) {
  const last = events.length - 1;
  return (
    <View>
      {events.map((e, i) => (
        <View key={`${e.type}-${e.at}`} style={styles.step}>
          <View style={styles.rail}>
            <View style={[styles.dot, i === last && styles.dotOn]} />
            {i < last ? <View style={styles.line} /> : null}
          </View>
          <View style={[styles.stepText, i < last && styles.stepGap]}>
            <AppText size="small" weight={i === last ? 'semibold' : 'regular'}>
              {TIMELINE_LABEL[e.type] ?? e.type}
            </AppText>
            <AppText size="caption" color="faint">
              {dateTimeLabel(e.at)}
            </AppText>
          </View>
        </View>
      ))}
    </View>
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

  return (
    <Screen
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={<ScreenHeader title="Ma commande" subtitle={order?.orderReference ?? undefined} back />}>
      {query.isLoading ? (
        <View style={styles.page} accessibilityLabel="Chargement de la commande">
          <Card style={styles.head}>
            <Skeleton width={THUMB} height={THUMB} radius={radii.lg} />
            <View style={styles.headText}>
              <Skeleton width="75%" height={18} />
              <Skeleton width="50%" height={12} />
              <Skeleton width="40%" height={22} />
            </View>
          </Card>
          <Skeleton height={62} radius={radii.lg} />
          <Skeleton height={62} radius={radii.lg} />
        </View>
      ) : null}
      {!order && query.error ? <EmptyState icon={ClipboardList} title="Chargement impossible" description={marketError(query.error)} /> : null}
      {order ? (
        <View style={styles.page}>
          <Card style={styles.head}>
            <ListingThumb listing={order} size={THUMB} />
            <View style={styles.headText}>
              <View style={styles.start}>
                <MarketStatusChip status={order.status} />
              </View>
              <AppText size="h3" weight="bold" numberOfLines={2}>
                {listingTitle(order)}
              </AppText>
              <AppText size="caption" color="muted" numberOfLines={2}>
                {order.farm.name}
                {order.farm.city ? ` · ${order.farm.city}` : ''}
              </AppText>
              <AppText size="h2" weight="bold" color={color.brand[800]}>
                {fmtFcfa(order.totalFcfa)}
              </AppText>
            </View>
          </Card>

          <FactGrid>
            <FactTile icon={Package} label="Quantité" value={`${fmt(order.quantity)} ${unitName(order.product, order.quantity)}`} />
            <FactTile icon={Banknote} label="Prix unitaire" value={fmtFcfa(order.unitPriceFcfa)} />
            {order.depositRequiredFcfa > 0 ? (
              <FactTile icon={Wallet} label="Acompte reçu par la ferme" value={`${fmtFcfa(order.depositPaidFcfa)} sur ${fmtFcfa(order.depositRequiredFcfa)}`} />
            ) : null}
            <FactTile icon={order.fulfilment === 'DELIVERY' ? Truck : House} label="Remise" value={order.fulfilment === 'DELIVERY' ? 'Livraison' : 'Retrait à la ferme'} />
            {order.readyDate ? <FactTile icon={CalendarClock} label="Prêts le" value={dayLabel(order.readyDate)} /> : null}
            {order.desiredDate ? <FactTile icon={CalendarDays} label="Date souhaitée" value={dayLabel(order.desiredDate)} /> : null}
          </FactGrid>
          {order.fulfilment === 'DELIVERY' && order.address ? (
            <View style={styles.address}>
              <MapPin size={15} color={color.ink[400]} style={styles.addressIcon} />
              <AppText size="small" color="muted" style={styles.flex}>
                Adresse de livraison : {order.address}
              </AppText>
            </View>
          ) : null}

          {order.farm.phone ? (
            <Button
              label={`Appeler la ferme : ${order.farm.phone}`}
              icon={Phone}
              tone="ghost"
              size="lg"
              onPress={() => {
                const url = telUrl(order.farm.phone);
                if (url) void Linking.openURL(url);
              }}
            />
          ) : null}

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

          <Card style={styles.history}>
            <AppText size="label" weight="semibold" color="muted" style={styles.eyebrow}>
              HISTORIQUE
            </AppText>
            <Timeline events={order.timeline} />
          </Card>

          {pending || canCancel ? (
            <Button
              label={pending ? 'Retirer ma demande' : paid ? 'Demander l’annulation' : 'Annuler la commande'}
              tone="ghost"
              loading={action.isPending}
              onPress={() => void askConfirmation()}
            />
          ) : null}
          <AppText size="caption" color="muted" align="center">
            Vous payez directement la ferme : Fermia n’encaisse rien.
          </AppText>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  start: {
    alignItems: 'flex-start',
  },
  address: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addressIcon: {
    marginTop: 2,
  },
  flex: {
    flex: 1,
  },
  history: {
    gap: spacing.md,
  },
  eyebrow: {
    letterSpacing: 1.2,
  },
  step: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rail: {
    width: 12,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    backgroundColor: color.ink[200],
  },
  dotOn: {
    backgroundColor: semantic.primary,
  },
  line: {
    flex: 1,
    width: StyleSheet.hairlineWidth * 2,
    marginTop: 2,
    backgroundColor: semantic.borderStrong,
  },
  stepText: {
    flex: 1,
  },
  stepGap: {
    paddingBottom: spacing.md,
  },
});
