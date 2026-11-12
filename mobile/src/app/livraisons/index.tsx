import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bird, CloudUpload, PackageCheck, Truck } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Spinner } from '@/components/ui/Spinner';
import { StaleNotice } from '@/components/ui/StaleNotice';
import { DeclarativeStockCard } from '@/components/deliveries/DeclarativeStockCard';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { useProgrammeAccess } from '@/hooks/useProgrammeAccess';
import { fetchFarmDeliveries, type DeliveryView } from '@/api/poufa';
import { cachedRead } from '@/offline/ref-cache';
import { useOfflineQueue } from '@/offline';
import { canConfirmDeliveries, readsProgrammeDomain } from '@/poufa/access';
import {
  DELIVERY_STATUS_LABEL,
  deliverySupplier,
  fmtQty,
  lineLabel,
  openBandHintOf,
  pendingDeliveries,
  queuedDeliveryIds,
} from '@/poufa/deliveries';
import { color, palette, semantic } from '@/constants/theme';
import { errorText } from '@/api/errorText';

function frDay(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function DeliveryRow({ d, queued, onPress }: { d: DeliveryView; queued: boolean; onPress: () => void }) {
  const lines = d.lines
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((l) => `${lineLabel(l)} ${fmtQty(l.receivedQuantity ?? l.quantity, l.unitLabel ?? l.unitCode)}`)
    .join(' · ');
  const tone = queued ? 'amber' : d.status === 'EXPEDIEE' ? 'brand' : d.status === 'ANNULEE' ? 'neutral' : d.hasDiscrepancy ? 'amber' : 'green';
  const label = queued ? 'Confirmation en attente d’envoi' : d.status === 'CONFIRMEE' && d.hasDiscrepancy ? 'Confirmée avec écart' : DELIVERY_STATUS_LABEL[d.status];
  return (
    <Card onPress={onPress} style={styles.card} accessibilityLabel={`Livraison ${d.code}`}>
      <View style={styles.head}>
        <AppText size="body" weight="bold" color="text" style={{ flex: 1 }}>
          {d.code}
        </AppText>
        <Chip label={label} tone={tone} dot />
      </View>
      <AppText size="caption" color="muted">
        {deliverySupplier(d)} · expédiée le {frDay(d.shippedAt)}
        {d.receivedDate ? ` · reçue le ${frDay(d.receivedDate)}` : ''}
      </AppText>
      <AppText size="small" color="text" numberOfLines={2}>
        {lines || 'Aucune ligne'}
      </AppText>
      {d.band ? (
        <AppText size="small" color="muted">
          Bande : {d.band.batchName ?? d.band.code ?? '—'}
        </AppText>
      ) : null}
    </Card>
  );
}

/**
 * Programme input deliveries of the farm (CDC 17-18): those to confirm, the
 * chick deliveries whose band is still to open, the history, and the
 * declarative stock. Confirmations wait in the offline queue.
 */
export default function DeliveriesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { farmId, farms, user } = useAuth();
  const farmProfile = useFarmProfile();
  const access = useProgrammeAccess();
  const canRead = readsProgrammeDomain(user.role, access.matrix, 'INTRANTS');
  const canConfirm = canConfirmDeliveries(user.role, farmProfile.hasPermission('stock:gerer'));
  const queue = useOfflineQueue(farmId);
  const queued = queuedDeliveryIds(queue.pending, farmId);

  const list = useQuery({
    queryKey: ['input-deliveries', farmId],
    queryFn: () => cachedRead(`input-deliveries.${farmId}`, () => fetchFarmDeliveries(farmId)),
    enabled: Boolean(farmId) && canRead,
  });

  const all = list.data ?? [];
  const toConfirm = pendingDeliveries(all).filter((d) => !queued.has(d.id));
  const waiting = all.filter((d) => queued.has(d.id));
  const toOpen = all.filter((d) => openBandHintOf(d) != null);
  const history = all
    .filter((d) => d.status !== 'EXPEDIEE' && !queued.has(d.id) && openBandHintOf(d) == null)
    .sort((a, b) => (b.receivedDate ?? b.shippedAt).localeCompare(a.receivedDate ?? a.shippedAt));
  const farmName = (farms.find((f) => f.id === farmId) ?? farms[0])?.name ?? 'Ferme';
  const open = (id: string) => router.push(`/livraisons/${id}` as never);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['input-deliveries', farmId] });
    void qc.invalidateQueries({ queryKey: ['declarative-stock', farmId] });
  };

  return (
    <Screen
      header={<ScreenHeader title="Livraisons d’intrants" subtitle={farmName} back right={<Truck size={18} color={color.ink[300]} />} />}
      refreshing={list.isRefetching}
      onRefresh={canRead ? refresh : undefined}>
      {access.isLoading ? (
        <Spinner label="Lecture de vos droits…" />
      ) : !canRead ? (
        <Card style={styles.card}>
          <AppText size="body" color="muted">
            Votre profil d’accès ne couvre pas les intrants du programme.
          </AppText>
        </Card>
      ) : list.isLoading ? (
        <Spinner label="Lecture des livraisons…" />
      ) : list.isError && !list.data ? (
        <Card style={styles.card}>
          <AppText size="body" color="danger">
            {errorText(list.error, 'Livraisons indisponibles.')}
          </AppText>
        </Card>
      ) : (
        <>
          <StaleNotice show={list.isError} updatedAt={list.dataUpdatedAt} />
          <SectionHeader
            title="Livraisons à confirmer"
            subtitle={canConfirm ? 'Comptez ce que vous avez reçu, puis confirmez' : 'Confirmées par l’éleveur de la ferme'}
            icon={PackageCheck}
            iconColor={color.brand[700]}
            iconBg={semantic.primarySoft}
          />
          {toConfirm.length === 0 ? (
            <AppText size="caption" color="muted">
              Aucune livraison en attente de confirmation.
            </AppText>
          ) : (
            toConfirm.map((d) => <DeliveryRow key={d.id} d={d} queued={false} onPress={() => open(d.id)} />)
          )}

          {waiting.length > 0 ? (
            <>
              <SectionHeader
                title="Gardées sur le téléphone"
                subtitle="Envoyées dès que la connexion revient"
                icon={CloudUpload}
                iconColor={palette.amber[600]}
                iconBg={semantic.warnSoft}
              />
              {waiting.map((d) => (
                <DeliveryRow key={d.id} d={d} queued onPress={() => open(d.id)} />
              ))}
            </>
          ) : null}

          {toOpen.length > 0 ? (
            <>
              <SectionHeader
                title="Bandes à ouvrir"
                subtitle="Poussins reçus, pas encore de bande rattachée"
                icon={Bird}
                iconColor={palette.green[700]}
                iconBg={semantic.successSoft}
              />
              {toOpen.map((d) => (
                <DeliveryRow key={d.id} d={d} queued={false} onPress={() => open(d.id)} />
              ))}
            </>
          ) : null}

          {history.length > 0 ? (
            <>
              <SectionHeader title="Historique" subtitle={`${history.length} livraison${history.length > 1 ? 's' : ''}`} />
              {history.map((d) => (
                <DeliveryRow key={d.id} d={d} queued={false} onPress={() => open(d.id)} />
              ))}
            </>
          ) : null}

          <DeclarativeStockCard farmId={farmId} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
