import React, { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { AlertTriangle, ClipboardList, MapPin, ShoppingBag, Store, UserRound } from 'lucide-react-native';

import { fetchFarmMarketOrders } from '@/api/market';
import { useAuth } from '@/auth/AuthContext';
import { FarmListingsPanel } from '@/components/market/FarmListingsPanel';
import { FarmRequestsPanel } from '@/components/market/FarmRequestsPanel';
import { Notice } from '@/components/market/shared';
import { Card } from '@/components/ui/Card';
import { ListRow } from '@/components/ui/ListRow';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { color } from '@/constants/theme';
import { useFarmProfile } from '@/hooks/useFarmProfile';

type Tab = 'listings' | 'requests';

/** The farm's side of the Market: what it publishes and what buyers ask for. */
export default function MarcheScreen() {
  const router = useRouter();
  const { farmId, farms } = useAuth();
  const { hasPermission } = useFarmProfile();
  const canPublish = hasPermission('market:publier');
  const canAnswer = hasPermission('vente:commande');
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab: Tab = picked ?? (canPublish ? 'listings' : 'requests');
  const farm = farms.find((f) => f.id === farmId);

  const ordersQuery = useQuery({
    queryKey: ['market-farm-orders', farmId],
    queryFn: () => fetchFarmMarketOrders(farmId),
    enabled: Boolean(farmId) && canAnswer,
  });
  const orders = ordersQuery.data ?? [];
  const toAnswer = orders.filter((o) => o.state === 'REQUESTED').length;

  return (
    <Screen bottomPad={120} header={<ScreenHeader title="Marché" subtitle="Publiez votre stock, répondez aux acheteurs" back />}>
      <View style={{ gap: 12 }}>
        {farm && !farm.isVerified ? (
          <Notice tone="warning" icon={AlertTriangle}>
            Votre ferme n’est pas encore vérifiée. Vous pouvez préparer vos annonces, mais seules les fermes vérifiées peuvent publier. Contactez Fermia.
          </Notice>
        ) : null}
        {canPublish && canAnswer ? (
          <Segmented<Tab>
            value={tab}
            onChange={setPicked}
            options={[
              { key: 'listings', label: 'Mes annonces' },
              { key: 'requests', label: toAnswer > 0 ? `Demandes (${toAnswer})` : 'Demandes' },
            ]}
          />
        ) : null}
        {farmId && tab === 'listings' && canPublish ? <FarmListingsPanel farmId={farmId} /> : null}
        {farmId && tab === 'requests' && canAnswer ? (
          <FarmRequestsPanel farmId={farmId} orders={orders} isLoading={ordersQuery.isLoading} error={ordersQuery.error} />
        ) : null}

        <Card padding={false}>
          <ListRow icon={<Store size={18} color={color.brand[600]} />} title="Voir le marché" subtitle="Ce que voient les acheteurs" onPress={() => router.push('/annonces' as Href)} />
          <ListRow icon={<ShoppingBag size={18} color={color.brand[600]} />} title="Mes achats" subtitle="Ce que vous avez commandé à d’autres fermes" onPress={() => router.push('/mes-achats' as Href)} />
          <ListRow icon={<UserRound size={18} color={color.brand[600]} />} title="Mon profil d’acheteur" onPress={() => router.push('/profil-acheteur' as Href)} />
          <ListRow icon={<ClipboardList size={18} color={color.brand[600]} />} title="Commandes" subtitle="Acomptes et livraisons" onPress={() => router.push('/commandes')} />
          <ListRow icon={<MapPin size={18} color={color.green[600]} />} title="Points de vente" subtitle="Boutiques et adresses de retrait" onPress={() => router.push('/points-vente')} />
        </Card>
      </View>
    </Screen>
  );
}
