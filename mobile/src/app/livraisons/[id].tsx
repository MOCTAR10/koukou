import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bird, CheckCircle2, Info, Link2, PackageCheck, Truck } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { confirm, errorMessage, toast } from '@/components/ui/Feedback';
import { DateField, Labeled, Notice } from '@/components/market/shared';
import { CreateLotSheet, type LotPrefill } from '@/components/CreateLotSheet';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { useProgrammeAccess } from '@/hooks/useProgrammeAccess';
import { fetchBatches } from '@/api';
import { librevilleDay } from '@/utils/libreville';
import { attachDeliveryBand, fetchFarmDelivery, type DeliveryView, type OpenBandHint } from '@/api/poufa';
import { cachedRead } from '@/offline/ref-cache';
import { confirmDeliveryQueued, useOfflineQueue } from '@/offline';
import { canConfirmDeliveries, readsProgrammeDomain } from '@/poufa/access';
import {
  DELIVERY_STATUS_LABEL,
  buildConfirmPayload,
  confirmRefusal,
  deliverySupplier,
  fmtQty,
  initialDrafts,
  isDiscrepancy,
  lineLabel,
  openBandHintOf,
  parseQuantity,
  queuedDeliveryIds,
  type LineDraft,
} from '@/poufa/deliveries';
import { color, palette, radii, semantic } from '@/constants/theme';

function frDay(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function LineEditor({ draft, onChange, disabled }: { draft: LineDraft; onChange: (d: LineDraft) => void; disabled: boolean }) {
  const received = parseQuantity(draft.received);
  const gap = received != null && isDiscrepancy(draft.shipped, received);
  return (
    <View style={styles.line}>
      <View style={styles.head}>
        <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>
          {draft.label}
        </AppText>
        <AppText size="caption" color="muted">
          Expédié {fmtQty(draft.shipped, draft.unit)}
        </AppText>
      </View>
      <Labeled label={`Reçu (${draft.unit})`}>
        <TextField
          value={draft.received}
          onChangeText={(t) => onChange({ ...draft, received: t })}
          keyboardType={draft.family === 'POUSSIN' ? 'number-pad' : 'decimal-pad'}
          editable={!disabled}
          accessibilityLabel={`Quantité reçue, ${draft.label}`}
        />
      </Labeled>
      {gap ? (
        <Labeled label="Motif de l’écart" hint="Obligatoire quand le reçu diffère de l’expédié (3 caractères minimum).">
          <TextField
            value={draft.reason}
            onChangeText={(t) => onChange({ ...draft, reason: t })}
            placeholder="Ex : 2 sacs déchirés, 15 poussins morts au transport"
            editable={!disabled}
            accessibilityLabel={`Motif de l’écart, ${draft.label}`}
          />
        </Labeled>
      ) : null}
    </View>
  );
}

function ReadLines({ view }: { view: DeliveryView }) {
  return (
    <Card style={{ gap: 0, paddingVertical: 4 }}>
      {view.lines
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((l, i) => (
          <View key={l.id} style={[styles.readLine, i > 0 && styles.sep]}>
            <View style={styles.head}>
              <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>
                {lineLabel(l)}
              </AppText>
              <AppText size="body" weight="bold" color="text">
                {fmtQty(l.receivedQuantity ?? l.quantity, l.unitLabel ?? l.unitCode)}
              </AppText>
            </View>
            <AppText size="small" color="muted">
              Expédié {fmtQty(l.quantity)}
              {l.receivedQuantity != null ? ` · reçu ${fmtQty(l.receivedQuantity)}` : ''}
              {l.supplierLotNumber ? ` · lot ${l.supplierLotNumber}` : ''}
              {l.subsidized ? ' · subventionné' : ''}
            </AppText>
            {l.discrepancyReason ? (
              <AppText size="small" color="warn">
                Écart : {l.discrepancyReason}
              </AppText>
            ) : null}
          </View>
        ))}
    </Card>
  );
}

/** Open bands of the farm, to link a delivery to a band opened earlier. */
function BandPicker({
  visible,
  farmId,
  onPick,
  onClose,
}: {
  visible: boolean;
  farmId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const batches = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId), enabled: visible && Boolean(farmId) });
  const open = (batches.data ?? []).filter((b) => b.status === 'ACTIF' || b.status === 'EN_VENTE');
  return (
    <Sheet visible={visible} title="Rattacher une bande" subtitle="Bandes en cours de la ferme" onClose={onClose}>
      {batches.isLoading ? (
        <Spinner label="Lecture des bandes…" />
      ) : batches.isError ? (
        <AppText size="body" color="danger">
          {errorMessage(batches.error)}
        </AppText>
      ) : open.length === 0 ? (
        <AppText size="body" color="muted">
          Aucune bande en cours.
        </AppText>
      ) : (
        <View style={{ gap: 8 }}>
          {open.map((b) => (
            <Pressable key={b.id} onPress={() => onPick(b.id)} style={styles.pick} accessibilityRole="button">
              <AppText size="body" weight="semibold" color="text">
                {b.batchName ?? 'Bande sans nom'}
              </AppText>
              <AppText size="small" color="muted">
                Mise en place le {frDay(b.integrationDate)} · {b.quantityAlive} vivants
              </AppText>
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  );
}

/**
 * One input delivery: the farmer confirms what he received (per line, with
 * the reason of any gap and the reception day), queued offline with
 * `idempotencyKey = op id`. A chick delivery then offers to open its band
 * (`CreateLotSheet`, no chick price when already an expense) and links it.
 */
export default function DeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { farmId, user } = useAuth();
  const farmProfile = useFarmProfile();
  const access = useProgrammeAccess();
  const canRead = readsProgrammeDomain(user.role, access.matrix, 'INTRANTS');
  const canConfirm = canConfirmDeliveries(user.role, farmProfile.hasPermission('stock:gerer'));
  // PUT …/band needs stock:gerer; opening the band needs production:gerer.
  const canOpenBand = canConfirm && farmProfile.hasPermission('production:gerer');
  const queue = useOfflineQueue(farmId);
  const queued = queuedDeliveryIds(queue.pending, farmId).has(id ?? '');

  const delivery = useQuery({
    queryKey: ['input-delivery', farmId, id],
    queryFn: () => cachedRead(`input-delivery.${farmId}.${id}`, () => fetchFarmDelivery(farmId, id ?? '')),
    enabled: Boolean(farmId && id) && canRead,
    placeholderData: () => qc.getQueryData<DeliveryView[]>(['input-deliveries', farmId])?.find((d) => d.id === id),
  });
  const view = delivery.data;

  const [drafts, setDrafts] = useState<LineDraft[]>([]);
  const [receivedDate, setReceivedDate] = useState(librevilleDay());
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<OpenBandHint | null>(null);
  const [lotOpen, setLotOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const viewId = view?.id;
  const viewStatus = view?.status;
  useEffect(() => {
    if (view && view.status === 'EXPEDIEE') setDrafts(initialDrafts(view));
    // Reset only when another delivery or status shows up, not on refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId, viewStatus]);

  const bandHint = hint ?? (view ? openBandHintOf(view) : null);
  const prefill = useMemo<LotPrefill | null>(
    () =>
      bandHint
        ? {
            quantityAtStart: bandHint.quantityAtStart,
            integrationDate: bandHint.integrationDate,
            couvoirSupplier: bandHint.couvoirSupplier,
            chickLotNumber: bandHint.chickLotNumber,
            chickCostBooked: bandHint.chickCostBooked,
          }
        : null,
    [bandHint],
  );

  const refusal = view ? confirmRefusal({ drafts, receivedDate, shippedAt: view.shippedAt, today: librevilleDay() }) : null;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['input-deliveries', farmId] });
    void qc.invalidateQueries({ queryKey: ['input-delivery', farmId, id] });
    void qc.invalidateQueries({ queryKey: ['declarative-stock', farmId] });
  };

  const submit = async () => {
    if (!view || refusal) return;
    const gaps = drafts.filter((d) => isDiscrepancy(d.shipped, parseQuantity(d.received) ?? d.shipped)).length;
    const ok = await confirm({
      title: `Confirmer la livraison ${view.code} ?`,
      message: `Réception le ${frDay(receivedDate)}${gaps ? `, ${gaps} ligne${gaps > 1 ? 's' : ''} avec écart` : ', tout reçu'}. La confirmation ne se modifie plus ensuite.`,
      confirmLabel: 'Confirmer',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await confirmDeliveryQueued(farmId, view.id, buildConfirmPayload(drafts, receivedDate));
      if (result.status === 'queued') {
        toast.info('Confirmation gardée sur le téléphone', 'Elle partira dès que la connexion revient.');
        router.back();
        return;
      }
      qc.setQueryData(['input-delivery', farmId, view.id], result.data);
      invalidate();
      toast.success(result.data.replay ? 'Livraison déjà confirmée' : 'Livraison confirmée');
      if (result.data.openBandHint) setHint(result.data.openBandHint);
    } catch (e) {
      toast.error('Confirmation refusée', errorMessage(e));
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const attach = useMutation({
    mutationFn: (bandId: string) => attachDeliveryBand(farmId, id ?? '', bandId),
    onSuccess: (updated) => {
      qc.setQueryData(['input-delivery', farmId, id], updated);
      setHint(null);
      invalidate();
      toast.success('Bande rattachée à la livraison');
    },
    onError: (e) => toast.error('Rattachement refusé', `${errorMessage(e)} Vous pouvez réessayer avec « Rattacher une bande existante ».`),
  });

  const confirmed = view?.status === 'CONFIRMEE';

  return (
    <Screen
      header={<ScreenHeader title={view?.code ?? 'Livraison'} subtitle={view ? deliverySupplier(view) : undefined} back right={<Truck size={18} color={color.ink[300]} />} />}
      refreshing={delivery.isRefetching}
      onRefresh={canRead ? invalidate : undefined}>
      {!canRead ? (
        <Card>
          <AppText size="body" color="muted">
            Votre profil d’accès ne couvre pas les intrants du programme.
          </AppText>
        </Card>
      ) : delivery.isLoading && !view ? (
        <Spinner label="Lecture de la livraison…" />
      ) : !view ? (
        <Card>
          <AppText size="body" color="danger">
            {delivery.error ? errorMessage(delivery.error) : 'Livraison introuvable.'}
          </AppText>
        </Card>
      ) : (
        <>
          <Card style={{ gap: 6 }}>
            <View style={styles.head}>
              <AppText size="h3" weight="bold" color="text" style={{ flex: 1 }}>
                {view.code}
              </AppText>
              <Chip
                label={queued ? 'Confirmation en attente d’envoi' : DELIVERY_STATUS_LABEL[view.status]}
                tone={queued ? 'amber' : view.status === 'EXPEDIEE' ? 'brand' : view.status === 'ANNULEE' ? 'neutral' : 'green'}
                dot
              />
            </View>
            <AppText size="caption" color="muted">
              Expédiée le {frDay(view.shippedAt)}
              {view.receivedDate ? ` · reçue le ${frDay(view.receivedDate)}` : ''}
            </AppText>
            {view.band ? (
              <AppText size="caption" color="muted">
                Bande rattachée : {view.band.batchName ?? view.band.code ?? '—'}
              </AppText>
            ) : null}
            {view.status === 'ANNULEE' && view.cancelReason ? (
              <AppText size="small" color="muted">
                Annulée : {view.cancelReason}
              </AppText>
            ) : null}
            {view.notes ? (
              <AppText size="small" color="muted">
                {view.notes}
              </AppText>
            ) : null}
          </Card>

          {view.status === 'EXPEDIEE' && queued ? (
            <Notice tone="info" icon={Info}>
              Votre confirmation est gardée sur le téléphone et partira dès que la connexion revient.
            </Notice>
          ) : null}

          {view.status === 'EXPEDIEE' && !queued && canConfirm ? (
            <>
              <Card style={{ gap: 12 }}>
                <Labeled label="Date de réception">
                  <DateField value={receivedDate} onChange={setReceivedDate} minimumDate={new Date(`${view.shippedAt.slice(0, 10)}T12:00:00`)} />
                </Labeled>
                {drafts.map((d) => (
                  <LineEditor
                    key={d.lineId}
                    draft={d}
                    disabled={busy}
                    onChange={(next) => setDrafts((all) => all.map((x) => (x.lineId === next.lineId ? next : x)))}
                  />
                ))}
              </Card>
              {refusal ? (
                <AppText size="small" color="danger">
                  {refusal}
                </AppText>
              ) : null}
              <Button label="Confirmer la réception" icon={PackageCheck} onPress={() => void submit()} disabled={Boolean(refusal)} loading={busy} />
              <AppText size="small" color="faint">
                Hors connexion, la confirmation est gardée sur le téléphone et envoyée plus tard.
              </AppText>
            </>
          ) : null}

          {view.status === 'EXPEDIEE' && !queued && !canConfirm ? (
            <>
              <Notice tone="info" icon={Info}>
                Seul l’éleveur de la ferme confirme ce qu’il a reçu.
              </Notice>
              <ReadLines view={view} />
            </>
          ) : null}

          {view.status !== 'EXPEDIEE' ? <ReadLines view={view} /> : null}

          {confirmed && !view.band && bandHint ? (
            <Card tone="green" style={{ gap: 10 }}>
              <View style={styles.head}>
                <Bird size={18} color={palette.green[700]} />
                <AppText size="body" weight="bold" color="text" style={{ flex: 1 }}>
                  Ouvrir la bande
                </AppText>
              </View>
              <AppText size="small" color="text">
                {bandHint.message}
              </AppText>
              {canOpenBand ? (
                <>
                  <Button label="Ouvrir la bande avec ces données" icon={Bird} tone="success" onPress={() => setLotOpen(true)} loading={attach.isPending} />
                  <Button label="Rattacher une bande existante" icon={Link2} tone="ghost" onPress={() => setPickerOpen(true)} disabled={attach.isPending} />
                </>
              ) : (
                <AppText size="small" color="muted">
                  L’ouverture de la bande revient à l’éleveur autorisé à créer des bandes.
                </AppText>
              )}
            </Card>
          ) : null}

          {confirmed && view.band ? (
            <Card tone="green" style={styles.headRow}>
              <CheckCircle2 size={16} color={palette.green[700]} />
              <AppText size="small" color="text" style={{ flex: 1 }}>
                Livraison rattachée à la bande {view.band.batchName ?? view.band.code ?? ''}.
              </AppText>
            </Card>
          ) : null}
        </>
      )}

      {canOpenBand ? (
        <>
          <CreateLotSheet
            visible={lotOpen}
            onClose={() => setLotOpen(false)}
            prefill={prefill}
            onCreated={(batch) => attach.mutate(batch.id)}
          />
          <BandPicker
            visible={pickerOpen}
            farmId={farmId}
            onClose={() => setPickerOpen(false)}
            onPick={(bandId) => {
              setPickerOpen(false);
              attach.mutate(bandId);
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
  },
  readLine: { padding: 12, gap: 4 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border },
  pick: {
    padding: 12,
    gap: 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
});
