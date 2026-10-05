import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building, Check, FileText, Printer, Scale, Truck } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NumberInput } from '@/components/ui/NumberInput';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { MiniStatColumn, OrderCard } from '@/components/slaughter/OrderCard';
import { PipelineHero } from '@/components/slaughter/PipelineHero';
import { useAuth } from '@/auth/AuthContext';
import { fetchBatches, fetchSlaughterOrders } from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import { downloadPdf } from '@/api/pdf';
import { canManageFarm } from '@/api/roles';
import { speciesLabel } from '@/api/format';
import { breedImageForLot } from '@/constants/breedImages';
import {
  cancelSlaughterOrder,
  createSlaughterOrder,
  processSlaughterOrder,
  sendSlaughterOrder,
  todayStr,
} from '@/api/mutations';
import { lotAvailability, projectOrder, slaughterRefs, type Horizon } from '@/utils/slaughterInsights';
import type { ProductionBatch, SlaughterDestination, SlaughterOrder, SlaughterType } from '@/api/types';
import { color, palette } from '@/constants/theme';

type SubView = 'new' | 'orders';

function sumBirds(list: SlaughterOrder[]): number {
  return list.reduce((s, o) => s + o.birdCount, 0);
}

function DestOption({
  selected,
  onPress,
  icon,
  title,
  caption,
}: {
  selected: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  title: string;
  caption: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.destOption, selected && styles.destOptionActive, pressed && styles.pressed]}>
      <View style={styles.destTop}>
        <View style={[styles.destIcon, selected && styles.destIconActive]}>{icon}</View>
        <View style={[styles.destRadio, selected && styles.destRadioOn]}>
          {selected ? <Check size={11} color="#FFFFFF" strokeWidth={3.5} /> : null}
        </View>
      </View>
      <View style={styles.destBody}>
        <AppText size="small" weight="bold" color={selected ? 'brand' : 'text'}>
          {title}
        </AppText>
        <AppText size="caption" color={selected ? 'brand' : 'faint'}>
          {caption}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function SlaughterScreen() {
  const { farms, user, farmId } = useAuth();
  const canManage = canManageFarm(user.role);
  const queryClient = useQueryClient();

  const batchesQuery = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId) });
  const ordersQuery = useQuery({ queryKey: ['slaughter-orders', farmId], queryFn: () => fetchSlaughterOrders(farmId) });
  const orders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const lots = (batchesQuery.data ?? []).filter((b) => b.status === 'ACTIF' || b.status === 'EN_VENTE');

  const [subView, setSubView] = useState<SubView>(canManage ? 'new' : 'orders');
  const [horizon, setHorizon] = useState<Horizon>({ kind: 'today' });
  const [today] = useState(todayStr);

  const [lotId, setLotId] = useState('');
  const lot = lots.find((b) => b.id === lotId) ?? lots[0];

  const [sType, setType] = useState<SlaughterType>('ABATTU');
  const [dest, setDest] = useState<SlaughterDestination>('EXTERNE');
  const [birds, setBirds] = useState(0);
  const [date, setDate] = useState(today);
  const [liveWeight, setLiveWeight] = useState('');
  const [abattoirCode, setAbattoirCode] = useState('');
  const [notes, setNotes] = useState('');
  const [processWeights, setProcessWeights] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDest = (d: SlaughterDestination) => {
    setDest(d);
    if (d === 'INTERNE') setType('ABATTU');
  };

  const refs = useMemo(() => slaughterRefs(orders), [orders]);
  const avail = lot ? lotAvailability(orders, lot) : null;
  const proj = lot && birds > 0 ? projectOrder(lot, birds, refs) : null;
  const fillPct = avail && avail.alive > 0 ? Math.min(100, Math.round((avail.ordered / avail.alive) * 100)) : 0;
  const barColor = avail?.overbooked ? color.red[500] : fillPct >= 70 ? palette.amber[500] : palette.brand[500];

  const download = async (order: SlaughterOrder) => {
    setBusy(order.id);
    try {
      await downloadPdf(`/farms/${farmId}/slaughter-orders/${order.id}/bordereau`, `${order.referenceNumber}.pdf`);
      Alert.alert('Bordereau téléchargé', `Partagez « ${order.referenceNumber}.pdf » avec l’abattoir.`);
    } catch (e) {
      Alert.alert('Téléchargement impossible', e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setBusy(null);
    }
  };

  const downloadPasseport = async (b: ProductionBatch) => {
    setBusy(b.id);
    try {
      await downloadPdf(`/farms/${farmId}/batches/${b.id}/passeport`, `passeport-${b.batchName ?? b.id}.pdf`);
      Alert.alert('Passeport sanitaire', `« passeport-${b.batchName ?? b.id}.pdf » enregistré : il certifie la conformité sanitaire du lot pour l’abattoir.`);
    } catch (e) {
      Alert.alert('Téléchargement impossible', e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setBusy(null);
    }
  };

  const invalidate = async () => {
    await invalidateFarmQueries(queryClient, { farmId, batchId: lot?.id });
  };

  const onBirds = (t: string) => {
    setBirds(Math.min(parseInt(t, 10) || 0, lot?.quantityAlive ?? 0));
    setError(null);
  };

  const create = async () => {
    const lotNow = lot;
    if (!lotNow || birds <= 0) return;
    setError(null);
    setBusy('create');
    try {
      await createSlaughterOrder(farmId, {
        batchId: lotNow.id,
        slaughterType: sType,
        destination: dest,
        plannedDate: date || today,
        birdCount: birds,
        ...(liveWeight.trim() ? { totalWeightKg: parseFloat(liveWeight) } : {}),
        ...(abattoirCode.trim() ? { abattoirLotCode: abattoirCode.trim() } : {}),
        ...(notes.trim() ? { abattoirNotes: notes.trim() } : {}),
      });
      setBirds(0);
      setLiveWeight('');
      setAbattoirCode('');
      setNotes('');
      await invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création de l’ordre.');
    } finally {
      setBusy(null);
    }
  };

  const sendOrder = async (order: SlaughterOrder) => {
    setError(null);
    setBusy(order.id);
    try {
      await sendSlaughterOrder(farmId, order.id, { abattoirLotCode: order.abattoirLotCode ?? undefined });
      await invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l’envoi de l’ordre.');
    } finally {
      setBusy(null);
    }
  };

  const processOrder = async (order: SlaughterOrder) => {
    const w = parseFloat(processWeights[order.id] ?? '');
    setError(null);
    setBusy(order.id);
    try {
      await processSlaughterOrder(farmId, order.id, {
        carcassWeightKg: Number.isFinite(w) && w > 0 ? w : undefined,
        abattoirLotCode: order.abattoirLotCode ?? undefined,
      });
      setProcessWeights((prev) => ({ ...prev, [order.id]: '' }));
      await invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors du traitement de l’ordre.');
    } finally {
      setBusy(null);
    }
  };

  const doCancel = async (order: SlaughterOrder) => {
    setError(null);
    setBusy(order.id);
    try {
      await cancelSlaughterOrder(farmId, order.id, 'Annulé depuis le mobile');
      await invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l’annulation de l’ordre.');
    } finally {
      setBusy(null);
    }
  };

  const cancelOrder = async (order: SlaughterOrder) => {
    Alert.alert('Annuler l’ordre', `${order.referenceNumber} sera annulé. Confirmer ?`, [
      { text: 'Non', style: 'cancel' },
      { text: 'Annuler', style: 'destructive', onPress: () => void doCancel(order) },
    ]);
  };

  const drafts = orders.filter((o) => o.status === 'DRAFT');
  const sent = orders.filter((o) => o.status === 'SENT');
  const processed = orders.filter((o) => o.status === 'PROCESSED');
  const cancelled = orders.filter((o) => o.status === 'CANCELLED');

  const renderOrder = (o: SlaughterOrder) => (
    <OrderCard
      key={o.id}
      order={o}
      canManage={canManage}
      busy={busy !== null}
      loading={busy === o.id}
      processWeight={processWeights[o.id] ?? ''}
      onProcessWeightChange={(v) => setProcessWeights((prev) => ({ ...prev, [o.id]: v }))}
      onSend={() => void sendOrder(o)}
      onProcess={() => void processOrder(o)}
      onCancel={() => void cancelOrder(o)}
      onBordereau={() => void download(o)}
    />
  );

  return (
    <Screen header={<ScreenHeader title="Abattage & passeport" subtitle={farms[0]?.name ?? 'Ferme'} back right={<Scale size={18} color={color.ink[300]} />} />}>
      {canManage ? (
        <View style={styles.tabWrap}>
          <Segmented
            options={[
              { key: 'new', label: 'Nouvel ordre' },
              { key: 'orders', label: 'Ordres & historique' },
            ]}
            value={subView}
            onChange={setSubView}
            haptic
          />
        </View>
      ) : null}

      {subView === 'new' && canManage ? (
        <>
          {batchesQuery.isLoading ? (
            <Spinner label="Chargement des lots…" />
          ) : lots.length === 0 ? (
            <AppText size="caption" color="muted">
              Aucun lot actif.
            </AppText>
          ) : (
            <>
              <View style={styles.lotHead}>
                <AppText size="label" color="muted">
                  LOT À ABATTRE
                </AppText>
                <Button label="Passeport sanitaire" tone="ghost" size="md" block={false} icon={Printer} onPress={() => lot && void downloadPasseport(lot)} disabled={busy !== null} loading={busy === lot?.id} />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.lotCarousel}
                style={{ flexGrow: 0 }}>
                {lots.map((b) => {
                  const spec = b.species ?? 'POULET';
                  const active = lot?.id === b.id;
                  const img = breedImageForLot(b.breedName, b.species);
                  const selling = b.status === 'EN_VENTE';
                  const ready = b.metrics?.readyForSale === true;
                  return (
                    <Pressable
                      key={b.id}
                      onPress={() => setLotId(b.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.lotCarouselItem,
                        active && styles.lotCarouselItemActive,
                        pressed && styles.lotCarouselItemPressed,
                      ]}>
                      <View style={styles.lotCarouselImg}>
                        {img ? (
                          <Image source={img} style={styles.lotCarouselImgImg} resizeMode="cover" />
                        ) : (
                          <View style={styles.lotCarouselImgFallback}>
                            <AppText size="label" weight="bold" color="brand" numberOfLines={2} style={styles.lotCarouselImgText}>
                              {speciesLabel(spec)}
                            </AppText>
                          </View>
                        )}
                        {selling ? <View style={[styles.lotBadge, styles.lotBadgeSelling]} /> : null}
                        {!selling && ready ? <View style={[styles.lotBadge, styles.lotBadgeReady]} /> : null}
                      </View>
                      <AppText
                        size="label"
                        weight="semibold"
                        color="text"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        style={styles.lotCarouselName}>
                        {b.batchName ?? b.id}
                      </AppText>
                      <AppText
                        size="label"
                        color="muted"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        style={styles.lotCarouselSouche}>
                        {b.breedName ?? speciesLabel(spec)}
                      </AppText>
                      <AppText
                        size="label"
                        color="brand"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        style={styles.lotCarouselCode}>
                        {b.breedCode ?? '—'}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {avail ? (
                <Card style={styles.card}>
                  <AppText size="label" color="muted">
                    DISPOSITION DU LOT — {(lot?.batchName ?? '—').toUpperCase()}
                  </AppText>
                  <View style={styles.availRow}>
                    <MiniStatColumn label="Vivants" value={String(avail.alive)} tone={color.ink[800]} />
                    <MiniStatColumn label="Déjà ordonnés" value={String(avail.ordered)} tone={avail.overbooked ? color.red[500] : color.brand[600]} />
                    <MiniStatColumn label="Restants" value={String(avail.remaining)} tone={avail.remaining <= 0 ? color.red[500] : color.green[600]} />
                  </View>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${fillPct}%`, backgroundColor: barColor }]} />
                  </View>
                  {avail.overbooked ? (
                    <AppText size="small" color="warn">
                      Attention : les ordres en cours du lot couvrent déjà le cheptel vivant.
                    </AppText>
                  ) : (
                    <AppText size="small" color="faint">
                      {avail.processed > 0 ? `${avail.processed} oiseaux déjà traités · ` : ''}
                      {avail.remaining} oiseaux encore disponibles à planifier.
                    </AppText>
                  )}
                </Card>
              ) : null}

              <Card tone="default" style={styles.formCard}>
                <AppText size="label" color="muted" style={{ marginBottom: 4 }}>
                  NOUVEL ORDRE — {(lot?.batchName ?? '').toUpperCase()}
                </AppText>

                <AppText size="label" color="muted">
                  OÙ ABATTRE ?
                </AppText>
                <View style={styles.destRow}>
                  <DestOption
                    selected={dest === 'INTERNE'}
                    onPress={() => onDest('INTERNE')}
                    icon={<Building size={20} color={dest === 'INTERNE' ? color.brand[600] : color.ink[500]} />}
                    title="Abattoir interne"
                    caption="À la ferme · code de suivi généré"
                  />
                  <DestOption
                    selected={dest === 'EXTERNE'}
                    onPress={() => onDest('EXTERNE')}
                    icon={<Truck size={20} color={dest === 'EXTERNE' ? color.brand[600] : color.ink[500]} />}
                    title="Abattoir externe"
                    caption="Partenaire · bordereau PDF"
                  />
                </View>

                {dest === 'EXTERNE' ? (
                  <View style={styles.typeWrap}>
                    <AppText size="label" color="muted">
                      TYPE D’ORDRE
                    </AppText>
                    <Segmented
                      options={[
                        { key: 'ABATTU', label: 'Abattu' },
                        { key: 'VIVANT', label: 'Vivant' },
                      ]}
                      value={sType}
                      onChange={setType}
                    />
                    <AppText size="caption" color="faint">
                      {sType === 'ABATTU'
                        ? 'Abattu : carcasses récupérées après abattage — elles deviennent vendables au point de vente.'
                        : 'Vivant : volaille envoyée vivante au partenaire — aucune carcasse n’est stockée.'}
                    </AppText>
                  </View>
                ) : (
                  <View style={styles.typeWrap}>
                    <AppText size="label" color="muted">
                      FORMULE
                    </AppText>
                    <AppText size="caption" color="faint">
                      Abattage à la ferme : les carcasses sont récupérées au traitement de l’ordre et deviennent vendables au point de vente.
                    </AppText>
                  </View>
                )}

                <View style={styles.envoiCard}>
                  <AppText size="small" weight="semibold" color={dest === 'EXTERNE' ? 'accent' : 'brand'}>
                    {dest === 'EXTERNE' ? "À L'ENVOI — BORDEREAU PDF" : "À L'ENVOI — CODE DE SUIVI"}
                  </AppText>
                  {dest === 'INTERNE' ? (
                    <AppText size="small" color="muted">
                      Un code de suivi interne (format ABT-AAAA-MM-JJ-######-I) est généré automatiquement : il trace le lot jusqu’au traitement. Saisissez-y le poids carcasse (kg).
                    </AppText>
                  ) : (
                    <AppText size="small" color="muted">
                      Un bordereau PDF est généré avec le code de suivi de la ferme et le QR de traçabilité : emportez-le avec les volailles livrées à l’abattoir partenaire.
                    </AppText>
                  )}
                </View>

                <NumberInput
                  value={birds > 0 ? String(birds) : ''}
                  onChangeText={onBirds}
                  suffix="oiseaux"
                  placeholder="0"
                />
                {birds > 0 ? (
                  proj && proj.estLiveKg != null ? (
                    <View style={styles.projCard}>
                      <AppText size="small" weight="semibold" color="text" align="center">
                        ≈ {Math.round(proj.estLiveKg)} kg vif
                        {proj.estCarcassKg != null ? ` → ${Math.round(proj.estCarcassKg)} kg carcasse estimée` : ''}
                        {proj.avgRendementPct != null ? ` (rendement moyen ${proj.avgRendementPct.toFixed(1)} %)` : ''}
                      </AppText>
                      <AppText size="small" color="faint" align="center">
                        Restants après cet ordre : {proj.remainingAfter} oiseaux
                      </AppText>
                    </View>
                  ) : (
                    <AppText size="caption" color="faint" style={{ textAlign: 'center' }}>
                      Les estimations vif/carcasse apparaîtront après vos premières pesées (kg vif à la création, kg carcasse au traitement).
                    </AppText>
                  )
                ) : null}
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  placeholder="Date prévue (AAAA-MM-JJ)"
                  placeholderTextColor={color.ink[300]}
                  autoCapitalize="none"
                  style={styles.input}
                  editable={busy === null}
                />
                <NumberInput
                  value={liveWeight}
                  onChangeText={(t) => {
                    setLiveWeight(t);
                    setError(null);
                  }}
                  decimal
                  suffix="kg"
                  placeholder="Poids vif total (optionnel)"
                />
                {dest === 'EXTERNE' ? (
                  <>
                    <TextInput
                      value={abattoirCode}
                      onChangeText={setAbattoirCode}
                      placeholder="Code lot abattoir (optionnel, saisi manuellement)"
                      placeholderTextColor={color.ink[300]}
                      style={styles.input}
                      editable={busy === null}
                    />
                    <TextInput
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="Instructions abattoir (optionnel)"
                      placeholderTextColor={color.ink[300]}
                      style={styles.input}
                      editable={busy === null}
                    />
                  </>
                ) : null}
                {error ? (
                  <AppText size="small" color="danger">
                    {error}
                  </AppText>
                ) : null}
                <Button label="Créer l’ordre" tone="accent" icon={FileText} onPress={() => void create()} disabled={busy !== null} loading={busy === 'create'} />
                <AppText size="caption" color="faint" style={{ textAlign: 'center' }}>
                  Envoi : les critères sanitaires du lot sont vérifiés côté serveur.
                </AppText>
              </Card>
            </>
          )}
        </>
      ) : (
        <>
          {!canManage ? (
            <Card tone="default" style={styles.card}>
              <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
                ORDRES D’ABATTAGE
              </AppText>
              <AppText size="body" color="muted">
                La création, l’envoi et le traitement des ordres sont réservés au propriétaire. Vous pouvez suivre les ordres en cours et télécharger les bordereaux PDF.
              </AppText>
            </Card>
          ) : null}

          {ordersQuery.isLoading ? (
            <Spinner label="Lecture des ordres…" />
          ) : (
            <>
              <PipelineHero orders={orders} horizon={horizon} onHorizonChange={setHorizon} today={today} />

              {error ? (
                <Card tone="alert" style={styles.card}>
                  <AppText size="small" color="danger">
                    {error}
                  </AppText>
                </Card>
              ) : null}

              {orders.length === 0 ? (
                <AppText size="caption" color="muted">
                  Aucun ordre d’abattage pour l’instant.
                </AppText>
              ) : (
                <>
                  {drafts.length > 0 ? (
                    <>
                      <SectionHeader title="À envoyer" subtitle={`${drafts.length} brouillon(s) · ${sumBirds(drafts)} oiseaux`} />
                      <View style={{ gap: 10 }}>{drafts.map(renderOrder)}</View>
                    </>
                  ) : null}

                  {sent.length > 0 ? (
                    <>
                      <SectionHeader title="À réceptionner" subtitle={`${sent.length} ordre(s) · ${sumBirds(sent)} oiseaux`} />
                      <View style={{ gap: 10 }}>{sent.map(renderOrder)}</View>
                    </>
                  ) : null}

                  {processed.length > 0 ? (
                    <>
                      <SectionHeader title="Traités" subtitle={`${processed.length} ordre(s) · ${sumBirds(processed)} oiseaux`} />
                      <View style={{ gap: 10 }}>{processed.map(renderOrder)}</View>
                    </>
                  ) : null}

                  {cancelled.length > 0 ? (
                    <>
                      <SectionHeader title="Annulés" subtitle={`${cancelled.length} ordre(s)`} />
                      <View style={{ gap: 10 }}>{cancelled.map(renderOrder)}</View>
                    </>
                  ) : null}
                </>
              )}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabWrap: {
    marginBottom: 12,
  },
  formCard: {
    gap: 10,
    padding: 14,
  },
  card: {
    gap: 10,
    padding: 14,
  },
  projCard: {
    gap: 2,
    padding: 10,
    borderRadius: 12,
    backgroundColor: color.brand[50],
    borderWidth: 1,
    borderColor: color.brand[100],
  },
  lotHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  lotCarousel: {
    gap: 8,
    paddingRight: 2,
    paddingBottom: 2,
  },
  lotCarouselItem: {
    width: 92,
    alignItems: 'center',
    gap: 3,
    padding: 8,
    borderRadius: 12,
    backgroundColor: palette.surface,
    borderWidth: 2,
    borderColor: palette.border,
  },
  lotCarouselItemActive: {
    borderColor: palette.brand[600],
    backgroundColor: palette.brand[50],
  },
  lotCarouselItemPressed: {
    opacity: 0.7,
  },
  lotCarouselImg: {
    width: 44,
    height: 44,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceAlt,
  },
  lotCarouselImgImg: {
    width: '100%',
    height: '100%',
  },
  lotCarouselImgFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  lotCarouselImgText: {
    textAlign: 'center',
  },
  lotBadge: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: palette.surface,
  },
  lotBadgeSelling: {
    backgroundColor: palette.green[600],
  },
  lotBadgeReady: {
    backgroundColor: palette.amber[500],
  },
  lotCarouselName: {
    fontSize: 10,
    lineHeight: 12,
  },
  lotCarouselSouche: {
    fontSize: 9,
    lineHeight: 11,
  },
  lotCarouselCode: {
    fontSize: 9,
    lineHeight: 11,
  },
  destRow: {
    flexDirection: 'row',
    gap: 8,
  },
  destOption: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  destOptionActive: {
    borderColor: palette.brand[600],
    backgroundColor: palette.brand[50],
    shadowColor: palette.brand[600],
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  destTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  destIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceAlt,
  },
  destIconActive: {
    backgroundColor: color.brand[100],
  },
  destRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.ink[300],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
  },
  destRadioOn: {
    borderColor: color.brand[600],
    backgroundColor: color.brand[600],
  },
  destBody: {
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  typeWrap: {
    gap: 6,
  },
  envoiCard: {
    gap: 4,
    padding: 10,
    borderRadius: 12,
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  availRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.surfaceAlt,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    color: color.ink[800],
    backgroundColor: color.surface,
  },
});