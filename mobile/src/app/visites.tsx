import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Plus } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { StaleNotice } from '@/components/ui/StaleNotice';
import { VisitSheet } from '@/components/visits/VisitSheet';
import { useAuth } from '@/auth/AuthContext';
import { useProgrammeAccess } from '@/hooks/useProgrammeAccess';
import { fetchFarmVisit, fetchFarmVisits, visitPhotoSource, type VisitView } from '@/api/poufa';
import { cachedRead } from '@/offline/ref-cache';
import { useOfflineQueue } from '@/offline';
import {
  ANSWER_LABEL,
  CLASS_LABEL,
  canWriteVisits,
  classTone,
  groupByCategory,
  readsVisits,
  scoreLabel,
  VISIT_TYPE_LABEL,
} from '@/poufa/visits';
import { color } from '@/constants/theme';

function frDay(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function VisitDetailSheet({ farmId, visit, onClose }: { farmId: string; visit: VisitView | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['visit', farmId, visit?.id],
    queryFn: () => cachedRead(`visit.${farmId}.${visit?.id}`, () => fetchFarmVisit(farmId, visit?.id ?? '')),
    enabled: Boolean(visit),
  });
  const v = detail.data ?? visit;
  return (
    <Sheet visible={Boolean(visit)} title={v ? VISIT_TYPE_LABEL[v.type] : 'Visite'} subtitle={v ? frDay(v.visitDate) : undefined} onClose={onClose}>
      {!v ? null : (
        <View style={{ gap: 10 }}>
          <AppText size="small" color="muted">
            {v.agent.name} · {v.batchCode ?? 'Toute la ferme'}
            {v.nextVisitDate ? ` · prochaine visite le ${frDay(v.nextVisitDate)}` : ''}
          </AppText>
          {v.scorePct != null ? (
            <View style={styles.row}>
              <AppText size="bodyM" weight="bold" color="text">
                Biosécurité : {scoreLabel(v.scorePct)}
              </AppText>
              {v.classification ? <Chip label={CLASS_LABEL[v.classification]} tone={classTone(v.classification)} /> : null}
            </View>
          ) : null}
          {v.visaFrom && v.visaTo ? (
            <AppText size="small" color="text">
              Visa de l’agent : saisies vérifiées du {frDay(v.visaFrom)} au {frDay(v.visaTo)}.
            </AppText>
          ) : null}
          {v.observations ? <AppText size="body" color="text">{v.observations}</AppText> : null}
          {v.recommendations ? (
            <AppText size="body" color="text">
              Recommandations : {v.recommendations}
            </AppText>
          ) : null}
          {detail.isLoading ? <Spinner label="Chargement de la grille…" /> : null}
          {(detail.data?.photos ?? []).length > 0 ? (
            <View style={{ gap: 6 }}>
              <AppText size="small" weight="semibold" color="muted">
                Photos ({detail.data?.photos?.length})
              </AppText>
              <View style={styles.photos}>
                {(detail.data?.photos ?? []).map((p, i) => (
                  <Image
                    key={p.id}
                    source={visitPhotoSource(farmId, v.id, p.id)}
                    style={styles.photo}
                    accessibilityLabel={`Photo ${i + 1} de la visite`}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {groupByCategory(v.answers.map((a) => ({ ...a, category: a.category }))).map((g) => (
            <View key={g.category} style={{ gap: 4 }}>
              <AppText size="small" weight="semibold" color="muted">
                {g.category}
              </AppText>
              {g.items.map((a) => (
                <View key={a.criterionCode} style={styles.row}>
                  <AppText size="small" color="text" style={{ flex: 1 }}>
                    {a.label}
                    {a.comment ? ` — ${a.comment}` : ''}
                  </AppText>
                  <Chip label={ANSWER_LABEL[a.answer]} tone={a.answer === 'CONFORME' ? 'green' : a.answer === 'NON_CONFORME' ? 'red' : 'neutral'} />
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

/**
 * Visits of the active farm (CDC n° 45, n° 27): list with score and class,
 * detail with the grid, and (agent technique, TECHNIQUE:VALIDER) a new visit
 * that works offline through the queue.
 */
export default function VisitsScreen() {
  const qc = useQueryClient();
  const { farmId, farms, user } = useAuth();
  const access = useProgrammeAccess();
  const canRead = readsVisits(user.role, access.matrix);
  const canWrite = canWriteVisits(user.role, access.matrix);
  const queue = useOfflineQueue(farmId);
  const waiting = queue.pending.filter((o) => o.kind === 'farm-visit' && o.farmId === farmId).length;
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<VisitView | null>(null);

  const list = useQuery({
    queryKey: ['visits', farmId],
    queryFn: () => cachedRead(`visits.${farmId}`, () => fetchFarmVisits(farmId)),
    enabled: Boolean(farmId) && canRead,
  });
  const farmName = (farms.find((f) => f.id === farmId) ?? farms[0])?.name ?? 'Ferme';

  return (
    <Screen
      header={<ScreenHeader title="Visites techniques" subtitle={farmName} back right={<ClipboardCheck size={18} color={color.ink[300]} />} />}
      refreshing={list.isRefetching}
      onRefresh={canRead ? () => void qc.invalidateQueries({ queryKey: ['visits', farmId] }) : undefined}>
      {access.isLoading ? (
        <Spinner label="Lecture de vos droits…" />
      ) : !canRead ? (
        <Card style={styles.card}>
          <AppText size="body" color="muted">
            Votre profil d’accès ne couvre pas les visites techniques.
          </AppText>
        </Card>
      ) : (
        <>
          {canWrite ? <Button label="Nouvelle visite" icon={Plus} onPress={() => setCreating(true)} /> : null}
          {waiting > 0 ? (
            <Card tone="warn" style={styles.card}>
              <AppText size="small" color="text">
                {waiting} visite{waiting > 1 ? 's' : ''} en attente d’envoi (connexion).
              </AppText>
            </Card>
          ) : null}
          {list.isLoading ? <Spinner label="Chargement des visites…" /> : null}
          <StaleNotice show={list.isError && Boolean(list.data)} updatedAt={list.dataUpdatedAt} />
          {list.isError && !list.data ? (
            <AppText size="small" color="danger">
              Visites indisponibles pour le moment.
            </AppText>
          ) : null}
          {!list.isLoading && (list.data ?? []).length === 0 && !list.isError ? (
            <Card style={styles.card}>
              <AppText size="body" color="muted">
                Aucune visite enregistrée pour cette ferme.
              </AppText>
            </Card>
          ) : null}
          {(list.data ?? []).map((v) => (
            <Card key={v.id} onPress={() => setOpen(v)} style={styles.card} accessibilityLabel={`Visite du ${frDay(v.visitDate)}`}>
              <View style={styles.row}>
                <AppText size="body" weight="bold" color="text" style={{ flex: 1 }}>
                  {VISIT_TYPE_LABEL[v.type]} · {frDay(v.visitDate)}
                </AppText>
                {v.classification ? <Chip label={CLASS_LABEL[v.classification]} tone={classTone(v.classification)} dot /> : null}
              </View>
              <AppText size="caption" color="muted">
                {v.batchCode ?? 'Toute la ferme'}
                {v.scorePct != null ? ` · biosécurité ${scoreLabel(v.scorePct)}` : ''}
                {v.visaFrom ? ' · visa' : ''}
              </AppText>
            </Card>
          ))}
        </>
      )}
      {farmId ? <VisitSheet visible={creating} farmId={farmId} onClose={() => setCreating(false)} onSaved={() => undefined} /> : null}
      {farmId ? <VisitDetailSheet farmId={farmId} visit={open} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 96, height: 96, borderRadius: 8, backgroundColor: color.ink[100] },
});
