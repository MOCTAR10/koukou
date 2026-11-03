import React from 'react';
import { Image, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { ChevronRight, ClipboardList } from 'lucide-react-native';

import { fetchBuyerOrders } from '@/api/market';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Spinner } from '@/components/ui/Spinner';
import { color, fmtFcfa, radii } from '@/constants/theme';
import { listingTitle, timeLeft, unitName } from './rules';
import { listingPhoto, marketError, MarketStatusChip, useNow } from './shared';

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
      {query.isLoading ? <Spinner label="Chargement…" /> : null}
      {query.error && orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Chargement impossible" description={marketError(query.error)} actionLabel="Réessayer" onAction={() => void query.refetch()} />
      ) : null}
      {!query.isLoading && !query.error && orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Aucune commande" description="Vous n’avez encore rien commandé." />
      ) : null}
      <View style={{ gap: 10 }}>
        {orders.map((o) => {
          const left = o.status === 'AWAITING_DEPOSIT' && o.depositDueAt ? timeLeft(o.depositDueAt, now) : null;
          const photo = listingPhoto(o);
          return (
            <Card key={o.id} onPress={() => router.push(`/achat/${o.id}` as Href)} accessibilityLabel={listingTitle(o)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {photo ? <Image source={photo} resizeMode="contain" style={{ width: 52, height: 52, borderRadius: radii.md }} /> : null}
                <View style={{ flex: 1, gap: 4, alignItems: 'flex-start' }}>
                  <AppText size="bodyM" weight="semibold" numberOfLines={1}>
                    {listingTitle(o)}
                  </AppText>
                  <AppText size="caption" color="muted" numberOfLines={1}>
                    {o.farm.name} · {o.quantity} {unitName(o.product, o.quantity)} · {fmtFcfa(o.totalFcfa)}
                  </AppText>
                  <MarketStatusChip status={o.status} />
                  {left ? (
                    <AppText size="caption" weight="semibold" style={{ color: color.accent[700] }}>
                      Reste {left} pour l’acompte
                    </AppText>
                  ) : null}
                </View>
                <ChevronRight size={18} color={color.ink[300]} />
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
