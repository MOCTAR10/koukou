import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, LocateFixed } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { confirm, errorMessage, toast } from '@/components/ui/Feedback';
import { DateField, Labeled, PillRow } from '@/components/market/shared';
import { librevilleDay } from '@/utils/libreville';
import { fetchBandHistory, fetchVisitGrid, type BiosecurityAnswer, type DeclarationPhoto, type VisitType } from '@/api/poufa';
import { getCurrentPosition } from '@/location/current-position';
import { cachedRead } from '@/offline/ref-cache';
import { createVisitQueued } from '@/offline';
import { persistPhoto } from '@/offline/photo-files';
import { VisitPhotoPicker } from './VisitPhotoPicker';
import {
  ANSWER_LABEL,
  buildVisitPayload,
  classOf,
  classTone,
  CLASS_LABEL,
  emptyVisitDraft,
  groupByCategory,
  scoreLabel,
  scoreOf,
  VISIT_TYPE_LABEL,
  visitRefusal,
  type VisitDraft,
} from '@/poufa/visits';
import { color, radii, semantic } from '@/constants/theme';

const ANSWERS: BiosecurityAnswer[] = ['CONFORME', 'NON_CONFORME', 'NA'];

/**
 * New visit with the biosecurity grid (CDC n° 27, n° 45, §3.2 visa). The grid
 * and the thresholds are cached at each opening, so the form works offline;
 * the visit is queued with its idempotency key and the phone's capture time.
 */
export function VisitSheet({ visible, onClose, farmId, onSaved }: { visible: boolean; onClose: () => void; farmId: string; onSaved: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<VisitDraft>(() => emptyVisitDraft(librevilleDay()));
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [photos, setPhotos] = useState<DeclarationPhoto[]>([]);

  useEffect(() => {
    if (visible) {
      setDraft(emptyVisitDraft(librevilleDay()));
      setPhotos([]);
    }
  }, [visible]);

  const grid = useQuery({
    queryKey: ['visit-grid', farmId],
    queryFn: () => cachedRead(`visit-grid.${farmId}`, () => fetchVisitGrid(farmId)),
    enabled: visible,
    staleTime: 5 * 60_000,
  });
  const bands = useQuery({
    queryKey: ['band-history', farmId, 'ALL'],
    queryFn: () => cachedRead(`band-history.${farmId}.ALL`, () => fetchBandHistory(farmId)),
    enabled: visible,
    retry: false,
  });

  const criteria = useMemo(() => grid.data?.criteria ?? [], [grid.data]);
  const thresholds = grid.data?.thresholds ?? { a: 80, b: 60 };
  const score = scoreOf(criteria, draft.answers);
  const klass = classOf(score, thresholds);
  const band = (bands.data ?? []).find((b) => b.id === draft.batchId) ?? null;
  const today = librevilleDay();
  const refusal = visitRefusal(draft, { today, bandStart: band?.integrationDate });
  const set = (patch: Partial<VisitDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const locate = async () => {
    setLocating(true);
    try {
      const p = await getCurrentPosition();
      set({ position: { latitude: p.latitude, longitude: p.longitude } });
    } catch (e) {
      toast.error('Position indisponible', errorMessage(e));
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    if (refusal) return;
    const ok = await confirm({
      title: 'Enregistrer cette visite ?',
      message: `${VISIT_TYPE_LABEL[draft.type]} du ${draft.visitDate.split('-').reverse().join('/')}${score != null ? `, score ${scoreLabel(score)}` : ''}. Elle ne pourra plus être modifiée.`,
      confirmLabel: 'Enregistrer',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await createVisitQueued(farmId, buildVisitPayload(draft, criteria), photos.map(persistPhoto));
      if (result.status === 'queued') {
        toast.info('Visite gardée sur le téléphone', 'Elle partira dès que la connexion revient.');
      } else if (result.data.photosRefused.length > 0) {
        toast.error('Visite enregistrée, photo(s) refusée(s)', result.data.photosRefused.join('\n'));
        void qc.invalidateQueries({ queryKey: ['visits', farmId] });
      } else {
        toast.success('Visite enregistrée');
        void qc.invalidateQueries({ queryKey: ['visits', farmId] });
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Visite refusée', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Nouvelle visite"
      icon={<ClipboardCheck size={18} color={color.brand[700]} />}
      onClose={onClose}
      footer={
        <View style={{ gap: 6 }}>
          {refusal ? (
            <AppText size="small" color="danger">
              {refusal}
            </AppText>
          ) : null}
          <Button label="Enregistrer la visite" onPress={() => void submit()} disabled={Boolean(refusal)} loading={busy} />
        </View>
      }>
      <View style={{ gap: 14 }}>
        <Labeled label="Type de visite">
          <PillRow<VisitType>
            options={(Object.keys(VISIT_TYPE_LABEL) as VisitType[]).map((k) => ({ key: k, label: VISIT_TYPE_LABEL[k] }))}
            value={draft.type}
            onChange={(type) => set({ type })}
          />
        </Labeled>
        <Labeled label="Jour de la visite">
          <DateField value={draft.visitDate} onChange={(visitDate) => set({ visitDate })} />
        </Labeled>
        <Labeled label="Bande concernée (facultatif)" hint={bands.isError ? 'Liste des bandes indisponible hors connexion (jamais chargée).' : undefined}>
          <PillRow<string>
            options={[{ key: '', label: 'Toute la ferme' }, ...(bands.data ?? []).map((b) => ({ key: b.id, label: b.code ?? b.batchName ?? 'Bande' }))]}
            value={draft.batchId}
            onChange={(batchId) => set({ batchId })}
          />
        </Labeled>
        <Labeled label="Observations">
          <TextField value={draft.observations} onChangeText={(observations) => set({ observations })} multiline maxLength={4000} />
        </Labeled>
        <Labeled label="Recommandations">
          <TextField value={draft.recommendations} onChangeText={(recommendations) => set({ recommendations })} multiline maxLength={4000} />
        </Labeled>
        <Labeled label="Prochaine visite (facultatif)">
          <DateField value={draft.nextVisitDate} onChange={(nextVisitDate) => set({ nextVisitDate })} />
        </Labeled>
        <Labeled label="Position de la visite (facultatif)">
          <Button
            label={draft.position ? `${draft.position.latitude.toFixed(5)}, ${draft.position.longitude.toFixed(5)}` : 'Relever ma position'}
            icon={LocateFixed}
            tone="ghost"
            size="sm"
            onPress={() => void locate()}
            loading={locating}
          />
        </Labeled>
        <Labeled label={`Photos (${photos.length}/8, facultatif)`}>
          <VisitPhotoPicker photos={photos} onPhotos={setPhotos} disabled={busy} />
        </Labeled>
        <View style={styles.box}>
          <AppText size="body" weight="semibold" color="text">
            Visa des saisies de la bande
          </AppText>
          <AppText size="caption" color="muted">
            Si vous avez vérifié sur place les saisies quotidiennes, indiquez la période (la bande est alors obligatoire).
          </AppText>
          <Labeled label="Du">
            <DateField value={draft.visaFrom} onChange={(visaFrom) => set({ visaFrom })} />
          </Labeled>
          <Labeled label="Au">
            <DateField value={draft.visaTo} onChange={(visaTo) => set({ visaTo })} />
          </Labeled>
        </View>

        <View style={styles.box}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>
              Grille de biosécurité
            </AppText>
            <AppText size="bodyM" weight="bold" color="text">
              {scoreLabel(score)}
            </AppText>
            {klass ? <Chip label={CLASS_LABEL[klass]} tone={classTone(klass)} /> : null}
          </View>
          <AppText size="caption" color="muted">
            Classe A dès {thresholds.a} %, B dès {thresholds.b} %.
          </AppText>
          {grid.isLoading ? <AppText size="caption" color="muted">Chargement de la grille…</AppText> : null}
          {grid.isError ? (
            <AppText size="caption" color="danger">
              Grille indisponible hors connexion (jamais chargée sur ce téléphone) : ouvrez ce formulaire une fois en ligne.
            </AppText>
          ) : null}
          {groupByCategory(criteria).map((g) => (
            <View key={g.category} style={{ gap: 8 }}>
              <AppText size="small" weight="semibold" color="muted">
                {g.category}
              </AppText>
              {g.items.map((c) => (
                <View key={c.code} style={{ gap: 6 }}>
                  <AppText size="body" color="text">
                    {c.label}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {ANSWERS.map((a) => {
                      const on = draft.answers[c.code] === a;
                      return (
                        <Pressable
                          key={a}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          onPress={() => set({ answers: { ...draft.answers, [c.code]: on ? undefined : a } })}
                          style={[styles.answer, on && styles.answerOn]}>
                          <AppText size="small" weight="semibold" style={{ color: on ? semantic.surface : color.ink[700] }}>
                            {ANSWER_LABEL[a]}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                  {draft.answers[c.code] === 'NON_CONFORME' ? (
                    <TextField
                      placeholder="Constat (facultatif)"
                      value={draft.comments[c.code] ?? ''}
                      maxLength={500}
                      onChangeText={(t) => set({ comments: { ...draft.comments, [c.code]: t } })}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: semantic.primarySoft },
  answer: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: semantic.surface },
  answerOn: { backgroundColor: color.brand[600] },
});
