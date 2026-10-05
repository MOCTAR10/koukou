import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Clock,
  Dna,
  Info,
  Layers,
  MapPin,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Store,
  Syringe,
  Ticket as TicketCheck,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { orderCanalLabel, orderStatusLabel, orderStatusTone, productLabel } from '@/components/orders/labels';
import { useAuth } from '@/auth/AuthContext';
import { fetchOrder, fetchPointsOfSale } from '@/api';
import { downloadPdf } from '@/api/pdf';
import { invalidateFarmQueries } from '@/api/invalidate';
import { canManageFarm } from '@/api/roles';
import { cancelOrderQueued, deliverOrderQueued, recordOrderPaymentQueued } from '@/offline/engine';
import type { OrderFull, OrderPassport } from '@/api/types';
import { color, palette, radii, spacing, fmt, fmtFcfa } from '@/constants/theme';

function OrderItems({ order }: { order: OrderFull }) {
  const remaining = Math.max(order.totalAmountFcfa - order.depositFcfa, 0);
  const payRate = order.totalAmountFcfa > 0 ? Math.min(1, order.depositFcfa / order.totalAmountFcfa) : 0;
  return (
    <Card tone="default" style={{ gap: 8 }}>
      <AppText size="label" color="muted">
        ARTICLES
      </AppText>
      {order.items.map((i) => (
        <View key={i.saleItemId || `${i.productType}-${i.label}-${i.quantity}`} style={styles.itemRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText size="body" weight="semibold" color="text" numberOfLines={1}>
              {i.label || productLabel(i.productType)}
            </AppText>
            <AppText size="small" color="muted">
              {fmt(i.quantity)} {i.unit} × {fmt(i.unitPriceFcfa)} FCFA
            </AppText>
          </View>
          <AppText size="body" weight="bold" color="text">
            {fmt(i.amountFcfa)} FCFA
          </AppText>
        </View>
      ))}
      <View style={[styles.divider, { marginVertical: 6 }]} />
      <View style={styles.totalRow}>
        <AppText size="body" color="muted">
          Total
        </AppText>
        <AppText size="h3" weight="bold" color="accent">
          {fmtFcfa(order.totalAmountFcfa)}
        </AppText>
      </View>
      <View style={styles.totalRow}>
        <AppText size="body" color="muted">
          Acomptes versés
        </AppText>
        <AppText size="body" weight="semibold" color="text">
          {fmtFcfa(order.depositFcfa)}
        </AppText>
      </View>
      <View style={styles.totalRow}>
        <AppText size="body" color="muted">
          Reste dû
        </AppText>
        <AppText size="h3" weight="bold" color={remaining > 0 ? 'brand' : 'green'}>
          {fmtFcfa(remaining)}
        </AppText>
      </View>
      <View style={styles.microTrack}>
        <View
          style={[
            styles.microFill,
            { width: `${Math.round(payRate * 100)}%`, backgroundColor: remaining === 0 ? palette.green[500] : palette.accent[300] },
          ]}
        />
      </View>
      <AppText size="caption" color="muted">
        {Math.round(payRate * 100)} % versé{order.depositFcfa > 0 ? ` · ${fmtFcfa(order.depositFcfa)} encaissés` : ' · aucun acompte'}
      </AppText>
    </Card>
  );
}

function passportDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : iso;
}

function conformityChip(passport: OrderPassport) {
  const c = passport.sanitary.conformity;
  if (c === 'CONFORME') return <Chip label="Conforme" tone="green" />;
  if (c === 'PRECONFORMITE') return <Chip label="Préconformité" tone="amber" />;
  return <Chip label="En attente" tone="red" />;
}

function PassportCard({ passport }: { passport: OrderPassport }) {
  const ready = passport.readiness;
  const notReady = !ready.readyForSale;
  const bannerTone = notReady
    ? ready.readyReason === 'SANITARY'
      ? 'red'
      : 'amber'
    : 'green';
  const BannerIcon = notReady
    ? ready.readyReason === 'SANITARY'
      ? ShieldAlert
      : Info
    : ShieldCheck;
  const bannerColor =
    bannerTone === 'green'
      ? palette.green[600]
      : bannerTone === 'red'
        ? palette.red[500]
        : palette.amber[600];
  const bannerBg =
    bannerTone === 'green'
      ? palette.green[50]
      : bannerTone === 'red'
        ? palette.red[50]
        : palette.amber[50];
  const lastVaccine = passport.vaccinations.last;

  return (
    <Card tone={notReady ? 'warn' : 'default'} style={{ gap: 12 }}>
      <View style={styles.passportHeader}>
        <View style={styles.passportTitle}>
          <ShieldCheck size={18} color={color.brand[600]} />
          <AppText size="label" color="muted">
            PASSEPORT & TRAÇABILITÉ
          </AppText>
        </View>
        <Chip label={`figé le ${passportDate(passport.generatedAt)}`} tone="outline" />
      </View>

      <View style={[styles.passportBanner, { backgroundColor: bannerBg }]}>
        <BannerIcon size={18} color={bannerColor} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size="body" weight="bold" color={bannerTone === 'green' ? 'green' : bannerTone === 'red' ? 'danger' : 'text'}>
            {ready.label}
          </AppText>
          <AppText size="small" color="text">
            {ready.note}
          </AppText>
        </View>
      </View>

      <View style={{ gap: 5 }}>
        <InfoRow icon={<Layers size={15} color={color.ink[400]} />} label="Lot" value={passport.batchLabel} />
        <InfoRow icon={<Dna size={15} color={color.ink[400]} />} label="Souche" value={passport.breedName ?? 'Non renseignée'} />
        <InfoRow icon={<Activity size={15} color={color.ink[400]} />} label="Type" value={passport.batchTypeLabel} />
        <InfoRow icon={<Users size={15} color={color.ink[400]} />} label="Espèce" value={passport.speciesLabel} />
        <InfoRow icon={<CalendarDays size={15} color={color.ink[400]} />} label="Intégration" value={passportDate(passport.integrationDate)} />
        <InfoRow icon={<Clock size={15} color={color.ink[400]} />} label="Âge au bon" value={`J${passport.ageDays}`} />
        <InfoRow icon={<Users size={15} color={color.ink[400]} />} label="Effectif vivant" value={fmt(passport.liveCount)} />
      </View>

      <View style={[styles.divider, { marginVertical: 2 }]} />

      <View style={{ gap: 6 }}>
        <AppText size="caption" color="muted">
          INDICATEURS DU LOT
        </AppText>
        {passport.metrics.map((m) => (
          <View key={m.label} style={styles.totalRow}>
            <AppText size="small" color="muted">
              {m.label}
            </AppText>
            <AppText size="small" weight="semibold" color="text">
              {m.value}
            </AppText>
          </View>
        ))}
      </View>

      <View style={{ gap: 6 }}>
        <AppText size="caption" color="muted">
          VACCINATIONS
        </AppText>
        <View style={styles.totalRow}>
          <View style={styles.passportTitle}>
            <Syringe size={15} color={color.brand[600]} />
            <AppText size="small" color="muted">
              Dernier vaccin
            </AppText>
          </View>
          <AppText size="small" weight="semibold" color="text">
            {lastVaccine
              ? `${lastVaccine.name}${lastVaccine.date ? ` (${passportDate(lastVaccine.date)})` : ''}`
              : 'Aucun enregistré'}
          </AppText>
        </View>
        <View style={styles.totalRow}>
          <AppText size="small" color="muted">
            Faites / restantes
          </AppText>
          <AppText size="small" weight="semibold" color="text">
            {passport.vaccinations.completed} / {passport.vaccinations.planned}
          </AppText>
        </View>
      </View>

      {passport.withdrawals.length > 0 ? (
        <View style={{ gap: 6 }}>
          <AppText size="caption" color="muted">
            RETRAITS EN COURS (CARENCE)
          </AppText>
          {passport.withdrawals.map((w) => (
            <View key={`${w.productName}-${w.withdrawalEndDate}`} style={[styles.passportBanner, { backgroundColor: palette.amber[50] }]}>
              <Clock size={16} color={palette.amber[600]} />
              <AppText size="small" color="text" style={{ flex: 1 }}>
                {w.productName} ({w.careTypeLabel}) — retrait jusqu’au {passportDate(w.withdrawalEndDate)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {passport.sanitary.alerts.length > 0 ? (
        <View style={{ gap: 6 }}>
          <AppText size="caption" color="muted">
            ALERTES SANITAIRES ACTIVES
          </AppText>
          {passport.sanitary.alerts.map((a) => (
            <View
              key={`${a.kind}-${a.message}`}
              style={[styles.passportBanner, { backgroundColor: a.level === 'ROUGE' ? palette.red[50] : palette.amber[50] }]}>
              {a.level === 'ROUGE' ? (
                <AlertTriangle size={16} color={palette.red[500]} />
              ) : (
                <Info size={16} color={palette.amber[600]} />
              )}
              <AppText size="small" color="text" style={{ flex: 1 }}>
                {a.message}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {passport.sanitary.events.length > 0 ? (
        <View style={{ gap: 6 }}>
          <AppText size="caption" color="muted">
            MALADIES DÉCLARÉES
          </AppText>
          {passport.sanitary.events.map((e) => (
            <View key={`${e.title}-${e.occurredAt}`} style={styles.totalRow}>
              <AppText size="small" color="muted" style={{ flex: 1 }}>
                {e.title}
              </AppText>
              <AppText size="small" weight="semibold" color={e.severity === 'ROUGE' ? 'danger' : 'text'}>
                {e.severity} · {passportDate(e.occurredAt)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.divider, { marginVertical: 2 }]} />

      <View style={{ gap: 8 }}>
        <View style={styles.totalRow}>
          <View style={styles.passportTitle}>
            {passport.sanitary.vetVisited ? (
              <Stethoscope size={15} color={color.green[600]} />
            ) : (
              <Info size={15} color={color.ink[400]} />
            )}
            <AppText size="small" color="muted">
              Visite vétérinaire
            </AppText>
          </View>
          <AppText size="body" weight="bold" color="text">
            {passport.sanitary.vetVisited ? 'Oui' : 'Non'}
          </AppText>
        </View>
        <View style={styles.totalRow}>
          <AppText size="small" color="muted">
            Conformité sanitaire
          </AppText>
          {conformityChip(passport)}
        </View>
        <AppText size="small" color="text">
          {passport.sanitary.conformityNote}
        </AppText>
      </View>
    </Card>
  );
}

function DepositSheet({ order, onClose }: { order: OrderFull; onClose: () => void }) {
  const { farmId } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = Math.max(order.totalAmountFcfa - order.depositFcfa, 0);

  const submit = async () => {
    if (amount <= 0 || amount > remaining) {
      setError(`Montant entre 1 et ${fmt(remaining)} FCFA.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recordOrderPaymentQueued(farmId, order.id, amount);
      invalidateFarmQueries(queryClient, { farmId });
      await queryClient.invalidateQueries({ queryKey: ['order', farmId, order.id] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l’encaissement.');
      setBusy(false);
    }
  };

  return (
    <Sheet visible onClose={onClose} title="Encaisser un acompte" subtitle={`Reste dû : ${fmtFcfa(remaining)}`} icon={<Wallet size={22} color={color.brand[600]} />}>
      <View style={{ gap: spacing.lg }}>
        <TextInput
          value={amount > 0 ? String(amount) : ''}
          onChangeText={(t) => {
            const n = parseInt(t.replace(/\D/g, ''), 10);
            setAmount(Number.isFinite(n) ? n : 0);
          }}
          placeholder="Montant (FCFA)"
          placeholderTextColor={color.ink[300]}
          keyboardType="number-pad"
          style={styles.input}
        />
        <View style={styles.rowWrap}>
          {[Math.round((remaining / 2) / 100) * 100, remaining]
            .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i)
            .map((v) => (
              <Pressable key={v} onPress={() => setAmount(Math.round(v))} accessibilityRole="button">
                <Chip label={fmt(Math.round(v)) + ' FCFA'} tone="brand" selected={amount === Math.round(v)} />
              </Pressable>
            ))}
        </View>
        <View style={styles.totalRow}>
          <AppText size="body" color="muted">
            Encaissé
          </AppText>
          <AppText size="body" weight="bold" color={amount > 0 ? 'text' : 'faint'}>
            {fmt(amount)} FCFA
          </AppText>
        </View>
        <View style={styles.totalRow}>
          <AppText size="body" color="muted">
            Reste dû après paiement
          </AppText>
          <AppText size="body" weight="bold" color={remaining - amount === 0 ? 'green' : 'brand'}>
            {fmtFcfa(Math.max(remaining - amount, 0))}
          </AppText>
        </View>
        {error ? (
          <AppText size="small" color="danger">
            {error}
          </AppText>
        ) : null}
        <Button label={`Encaisser ${fmt(amount)} FCFA`} tone="brand" loading={busy} disabled={amount <= 0} onPress={() => void submit()} />
      </View>
    </Sheet>
  );
}

export default function CommandeDetailScreen() {
  const { farmId, user } = useAuth();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const canManage = canManageFarm(user.role);

  const orderQuery = useQuery({ queryKey: ['order', farmId, id], queryFn: () => fetchOrder(farmId, id) });
  const pdvQuery = useQuery({ queryKey: ['points-of-sale', farmId], queryFn: () => fetchPointsOfSale(farmId), enabled: !!orderQuery.data?.pointOfSaleId });

  const [depositOpen, setDepositOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (orderQuery.isLoading || !orderQuery.data) {
    return (
      <Screen header={<ScreenHeader title="Commande" subtitle="" back />}>
        <Spinner label="Chargement de la commande…" />
      </Screen>
    );
  }
  const order = orderQuery.data;
  const pdv = (pdvQuery.data ?? []).find((p) => p.id === order.pointOfSaleId);

  const pulldown = async () => {
    await invalidateFarmQueries(queryClient, { farmId });
    await orderQuery.refetch();
  };

  const doCancel = () => {
    Alert.alert('Annuler la commande', `${order.referenceNumber} sera passée « Annulée ». Confirmer ?`, [
      { text: 'Retour', style: 'cancel' },
      {
        text: 'Annuler',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          cancelOrderQueued(farmId, order.id, 'Annulée sur demande de la ferme')
            .then(async () => {
              await invalidateFarmQueries(queryClient, { farmId });
              await orderQuery.refetch();
            })
            .catch((e) => Alert.alert('Annulation impossible', e instanceof Error ? e.message : 'Erreur inattendue.'))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  const doDeliver = () => {
    if (order.status !== 'CONFIRMED') {
      Alert.alert('Impossible', 'Encoder un acompte (→ Confirmer) avant de livrer.');
      return;
    }
    Alert.alert('Livrer la commande', 'Le cheptel sera décrémenté et le bon de commande PDF généré. Confirmer ?', [
      { text: 'Retour', style: 'cancel' },
      {
        text: 'Livrer',
        onPress: () => {
          setBusy(true);
          deliverOrderQueued(farmId, order.id)
            .then(async () => {
              await invalidateFarmQueries(queryClient, { farmId });
              await orderQuery.refetch();
              Alert.alert('Commande livrée', `${order.referenceNumber} : cheptel mis à jour et bon de commande généré.`);
            })
            .catch((e) => Alert.alert('Livraison impossible', e instanceof Error ? e.message : 'Erreur inattendue.'))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  const doPdf = () => {
    downloadPdf(`/farms/${farmId}/orders/${order.id}/bon-de-commande`, `${order.referenceNumber}.pdf`)
      .then(() => Alert.alert('Bon de commande', `« ${order.referenceNumber}.pdf » enregistré sur votre appareil.`))
      .catch((e) => Alert.alert('Téléchargement impossible', e instanceof Error ? e.message : 'Erreur inattendue.'));
  };

  const remaining = Math.max(order.totalAmountFcfa - order.depositFcfa, 0);
  const canLivrer = order.status === 'CONFIRMED';
  const canCancel = order.status === 'PENDING' || order.status === 'CONFIRMED';

  return (
    <Screen header={<ScreenHeader title="Commande" subtitle={order.referenceNumber} back />} bottomPad={128} refreshing={orderQuery.isFetching} onRefresh={() => void pulldown()}>
      <View style={{ gap: spacing.lg }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.avatar}>
              <Image source={require('@/assets/images/logo-white.png')} style={styles.avatarLogo} accessibilityLabel="Logo KouKou" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText size="h3" weight="bold" color="text">
                {order.customer?.fullName ?? 'Client non renseigné'}
              </AppText>
              <AppText size="small" color="muted">
                {order.customer?.phone ?? 'Sans téléphone'}
              </AppText>
            </View>
            <Chip label={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />
          </View>
          <View style={[styles.divider, { marginVertical: 12 }]} />
          <View style={{ gap: 8 }}>
            <InfoRow icon={<TicketCheck size={15} color={color.ink[400]} />} label="Canal" value={orderCanalLabel(order.canal)} />
            <InfoRow icon={<Truck size={15} color={color.ink[400]} />} label="Retrait" value={pdv ? `${pdv.name} (point de vente)` : order.address ?? 'À la ferme'} />
            <InfoRow icon={<Store size={15} color={color.ink[400]} />} label="Lot" value={order.batch?.batchName ?? 'Œufs (stock)'} />
            <InfoRow
              icon={<MapPin size={15} color={color.ink[400]} />}
              label="Prévu"
              value={order.expectedDate ? order.expectedDate.split('-').reverse().join('/') : 'À convenir'}
            />
            <InfoRow icon={<X size={15} color={color.ink[400]} />} label="Créée le" value={new Date(order.createdAt).toLocaleDateString('fr-FR')} />
            {order.cancelledReason ? <InfoRow icon={<X size={15} color={color.red[500]} />} label="Motif" value={order.cancelledReason} /> : null}
          </View>
        </Card>

        <OrderItems order={order} />

        {order.passport ? <PassportCard passport={order.passport} /> : null}

        <View style={{ gap: spacing.sm }}>
          {order.status === 'PENDING' ? (
            <Button label={`Encaisser un acompte · reste ${fmtFcfa(remaining)}`} tone="brand" disabled={busy || remaining <= 0} onPress={() => setDepositOpen(true)} />
          ) : null}
          {canLivrer ? (
            <Button label={`Livrer la commande · reste ${fmtFcfa(remaining)}`} tone="accent" loading={busy} onPress={doDeliver} />
          ) : null}
          {order.status === 'LIVRE' || order.status === 'CANCELLED' ? (
            <Button label="Télécharger le bon de commande PDF" tone="ghost" icon={Printer} onPress={doPdf} />
          ) : null}
          {canManage && canCancel ? (
            <Button label="Annuler la commande" tone="danger" disabled={busy} onPress={doCancel} />
          ) : null}
        </View>
      </View>

      {depositOpen ? <DepositSheet order={order} onClose={() => setDepositOpen(false)} /> : null}
    </Screen>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {icon}
      <AppText size="small" color="muted">
        {label} :
      </AppText>
      <AppText size="small" weight="semibold" color="text" numberOfLines={2} style={{ flex: 1 }}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brand[600],
  },
  avatarLogo: {
    width: 26,
    height: 26,
  },
  microTrack: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.ink[100],
    overflow: 'hidden',
    marginTop: 4,
  },
  microFill: {
    height: 6,
    borderRadius: radii.pill,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '700',
    color: color.ink[800],
    backgroundColor: color.surface,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  passportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  passportTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  passportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
  },
});