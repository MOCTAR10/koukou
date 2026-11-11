import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { ChevronRight, ClipboardList, Clock } from 'lucide-react-native';

import { fetchBuyerOrders, type BuyerMarketOrder } from '@/api/market';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Skeleton } from '@/components/ui/Skeleton';
import { color, fmt, fmtFcfa, radii, semantic, spacing } from '@/constants/theme';
import { listingTitle, timeLeft, unitName } from './rules';
import { ListingThumb, marketError, MarketStatusChip, useNow } from './shared';

const THUMB = 72;

function OrderCard({ order, now }: { order: BuyerMarketOrder; now: number }) {
  const router = useRouter();
  const left = order.status === 'AWAITING_DEPOSIT' && order.depositDueAt ? timeLeft(order.depositDueAt, now) : null;
  return (
    <Card onPress={() => router.push(`/achat/${order.id}` as Href)} accessibilityLabel={`${listingTitle(order)}, ${fmtFcfa(order.totalFcfa)}`} style={styles.card}>
      <View style={styles.row}>
        <ListingThumb listing={order} size={THUMB} />
        <View style={styles.text}>
          <AppText size="bodyM" weight="semibold" numberOfLines={1}>
            {listingTitle(order)}
          </AppText>
          <AppText size="caption" color="muted" numberOfLines={1}>
            {order.farm.name} · {fmt(order.quantity)} {unitName(order.product, order.quantity)}
          </AppText>
          <AppText size="body" weight="bold" color={color.brand[800]}>
            {fmtFcfa(order.totalFcfa)}
          </AppText>
        </View>
        <ChevronRight size={18} color={color.ink[300]} />
      </View>
      <View style={styles.footer}>
        <MarketStatusChip status={order.status} />
        {left ? (
          <View style={styles.countdown}>
            <Clock size={13} color={semantic.accentText} />
            <AppText size="caption" weight="semibold" color={semantic.accentText}>
              Reste {left} pour l’acompte
            </AppText>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export function BuyerOrdersView({ back = false }: { back?: boolean }) {
  const router = useRouter();
  const now = useNow();
  const query = useQuery({ queryKey: ['market-orders'], queryFn: fetchBuyerOrders });
  const orders = query.data ?? [];

  return (
    <Screen
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={<ScreenHeader title="Mes commandes" subtitle="Vos demandes et précommandes" back={back} />}>
      {query.isLoading ? (
        <View style={styles.list} accessibilityLabel="Chargement de vos commandes">
          {[0, 1, 2].map((i) => (
            <Card key={i} style={styles.card}>
              <View style={styles.row}>
                <Skeleton width={THUMB} height={THUMB} radius={radii.lg} />
                <View style={styles.text}>
                  <Skeleton width="70%" />
                  <Skeleton width="50%" height={11} />
                  <Skeleton width="35%" height={16} />
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : null}
      {query.error && orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Chargement impossible" description={marketError(query.error)} actionLabel="Réessayer" onAction={() => void query.refetch()} />
      ) : null}
      {!query.isLoading && !query.error && orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Aucune commande"
          description="Parcourez les annonces des fermes : vos demandes apparaîtront ici."
          actionLabel="Voir les annonces"
          onAction={() => router.push('/annonces' as Href)}
        />
      ) : null}
      <View style={styles.list}>
        {orders.map((o) => (
          <OrderCard key={o.id} order={o} now={now} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.md,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
  },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
