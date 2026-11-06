import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { confirm, errorMessage, toast } from '@/components/ui/Feedback';
import { DateField, Labeled, PillRow } from '@/components/market/shared';
import { invalidateFarmQueries } from '@/api/invalidate';
import { localYmd } from '@/api/mutations';
import { fetchOperators, fetchProgramList } from '@/api/poufa';
import { cachedRead, isNetworkFailure } from '@/offline/ref-cache';
import { createSortieQueued } from '@/offline';
import { allowedSortieReasons, buildSortiePayload, emptySortieDraft, sortieFamilyHint, sortieRefusal, type SortieDraft } from '@/poufa/sorties';
import { color, radii, semantic } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  farmId: string;
  batch: { id: string; batchName: string | null; quantityAlive: number; integrationDate: string; status: string };
  has: (code: string) => boolean;
}

/**
 * Band exit with a programme reason (CDC 9): reason from MOTIF_SORTIE, count,
 * weight, recipient, optional operator. Queued offline, deduplicated by the
 * server on `idempotencyKey = op id`.
 */
export function SortieSheet({ visible, onClose, farmId, batch, has }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SortieDraft>(() => emptySortieDraft(localYmd(new Date())));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) setDraft(emptySortieDraft(localYmd(new Date())));
  }, [visible]);

  const reasons = useQuery({
    queryKey: ['programme-list', 'MOTIF_SORTIE'],
    queryFn: () => cachedRead('list.MOTIF_SORTIE', () => fetchProgramList('MOTIF_SORTIE')),
    staleTime: 10 * 60_000,
    enabled: visible,
  });
  const operators = useQuery({
    queryKey: ['trace-operators'],
    queryFn: () => cachedRead('trace-operators', fetchOperators),
    staleTime: 10 * 60_000,
    enabled: visible,
  });

  const options = allowedSortieReasons(reasons.data ?? [], has);
  const reason = options.find((r) => r.code === draft.reasonCode) ?? null;
  const family = reason?.family ?? null;
  const activeOperators = (operators.data ?? []).filter((o) => o.active);
  const refusal = sortieRefusal(draft, {
    family,
    alive: batch.quantityAlive,
    integrationDate: batch.integrationDate,
    today: localYmd(new Date()),
    closed: batch.status === 'CLOTURE',
  });
  const set = (patch: Partial<SortieDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async () => {
    if (refusal || !family || !reason) return;
    const ok = await confirm({
      title: `Sortir ${draft.count} sujet${Number(draft.count) > 1 ? 's' : ''} ?`,
      message: `${reason.label}, le ${draft.sortieDate.split('-').reverse().join('/')}. ${sortieFamilyHint(family)}`,
      confirmLabel: 'Enregistrer la sortie',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await createSortieQueued(farmId, batch.id, buildSortiePayload(draft, family));
      if (result.status === 'queued') {
        toast.info('Sortie gardée sur le téléphone', 'Elle partira dès que la connexion revient.');
      } else {
        toast.success('Sortie enregistrée');
        void qc.invalidateQueries({ queryKey: ['band-sorties', farmId, batch.id] });
        invalidateFarmQueries(qc, { farmId });
      }
      onClose();
    } catch (e) {
      toast.error('Sortie refusée', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Sortie de bande"
      subtitle={`${batch.batchName ?? 'Bande'} · ${batch.quantityAlive} présents`}
      icon={<LogOut size={18} color={color.brand[700]} />}
      onClose={onClose}
      footer={
        <View style={{ gap: 6 }}>
          {refusal && draft.reasonCode ? (
            <AppText size="small" color="danger">
              {refusal}
            </AppText>
          ) : null}
          <Button label="Enregistrer la sortie" onPress={() => void submit()} disabled={Boolean(refusal)} loading={busy} />
        </View>
      }>
      <View style={{ gap: 14 }}>
        <Labeled label="Motif (liste du programme)" hint={sortieFamilyHint(family) || undefined}>
          {reasons.isLoading ? (
            <AppText size="caption" color="muted">
              Chargement des motifs…
            </AppText>
          ) : options.length === 0 ? (
            <AppText size="caption" color="muted">
              {reasons.isError
                ? isNetworkFailure(reasons.error)
                  ? 'Motifs indisponibles hors ligne (jamais chargés sur ce téléphone).'
                  : errorMessage(reasons.error)
                : 'Aucun motif de sortie autorisé pour votre compte.'}
            </AppText>
          ) : (
            <View style={styles.wrap}>
              {options.map((o) => (
                <Pressable
                  key={o.code}
                  onPress={() => set({ reasonCode: o.code })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: o.code === draft.reasonCode }}
                  accessibilityLabel={o.label}>
                  <Chip label={o.label} tone={o.code === draft.reasonCode ? 'brand' : 'outline'} dot={o.code === draft.reasonCode} />
                </Pressable>
              ))}
            </View>
          )}
        </Labeled>

        <Labeled label="Date de la sortie">
          <DateField value={draft.sortieDate} onChange={(v) => set({ sortieDate: v })} minimumDate={new Date(`${batch.integrationDate.slice(0, 10)}T12:00:00`)} />
        </Labeled>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Labeled label="Nombre de sujets">
              <TextField value={draft.count} onChangeText={(t) => set({ count: t })} keyboardType="number-pad" placeholder="Ex : 50" accessibilityLabel="Nombre de sujets" />
            </Labeled>
          </View>
          <View style={{ flex: 1 }}>
            <Labeled label="Poids total (kg)">
              <TextField value={draft.weightKg} onChangeText={(t) => set({ weightKg: t })} keyboardType="decimal-pad" placeholder="Optionnel" accessibilityLabel="Poids total en kilos" />
            </Labeled>
          </View>
        </View>

        {family === 'VENTE' ? (
          <View style={{ gap: 8 }}>
            <PillRow
              options={[
                { key: 'TETE', label: 'Prix par tête' },
                { key: 'KG', label: 'Prix au kg' },
              ]}
              value={draft.priceUnit}
              onChange={(k) => set({ priceUnit: k })}
            />
            <Labeled label={draft.priceUnit === 'KG' ? 'Prix du kg (FCFA)' : 'Prix par tête (FCFA)'}>
              <TextField value={draft.unitPriceFcfa} onChangeText={(t) => set({ unitPriceFcfa: t })} keyboardType="number-pad" placeholder="Ex : 3500" accessibilityLabel="Prix unitaire" />
            </Labeled>
          </View>
        ) : null}

        <Labeled label="Destinataire">
          <TextField value={draft.recipientName} onChangeText={(t) => set({ recipientName: t })} placeholder="Nom (optionnel)" accessibilityLabel="Nom du destinataire" />
        </Labeled>
        <TextField
          value={draft.recipientPhone}
          onChangeText={(t) => set({ recipientPhone: t })}
          keyboardType="phone-pad"
          placeholder="Téléphone (optionnel)"
          accessibilityLabel="Téléphone du destinataire"
        />

        <Labeled label="Opérateur du programme (optionnel)" hint="Abattoir, collecteur ou acheteur enregistré dans le programme.">
          {operators.isLoading ? (
            <AppText size="caption" color="muted">
              Chargement des opérateurs…
            </AppText>
          ) : activeOperators.length === 0 ? (
            <AppText size="caption" color="muted">
              {operators.isError
                ? isNetworkFailure(operators.error)
                  ? 'Opérateurs indisponibles hors ligne.'
                  : errorMessage(operators.error)
                : 'Aucun opérateur enregistré.'}
            </AppText>
          ) : (
            <View style={styles.wrap}>
              {activeOperators.map((o) => {
                const on = o.id === draft.operatorId;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => set({ operatorId: on ? null : o.id })}
                    style={[styles.operator, on && styles.operatorOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={o.name}>
                    <AppText size="small" weight="semibold" color={on ? 'brand' : 'text'}>
                      {o.name}
                    </AppText>
                    <AppText size="caption" color="muted">
                      {o.code}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Labeled>

        <Labeled label="Notes">
          <TextField value={draft.notes} onChangeText={(t) => set({ notes: t })} placeholder="Optionnel" accessibilityLabel="Notes" />
        </Labeled>

        <AppText size="small" color="faint">
          Hors connexion, la sortie est gardée sur le téléphone et envoyée plus tard, une seule fois.
        </AppText>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  operator: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  operatorOn: { borderColor: color.brand[400], backgroundColor: semantic.primarySoft },
});
