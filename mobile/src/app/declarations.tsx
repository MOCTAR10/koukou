import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { errorMessage, toast } from '@/components/ui/Feedback';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { StaleNotice } from '@/components/ui/StaleNotice';
import { useAuth } from '@/auth/AuthContext';
import { useProgrammeAccess } from '@/hooks/useProgrammeAccess';
import { ReadOnlyNotice } from '@/components/ReadOnlyNotice';
import { fetchDeclarations, reviewDeclaration, type SanitaryDeclaration } from '@/api/poufa';
import {
  REVIEW_DECISION_LABELS,
  REVIEW_STATE_LABELS,
  canReviewDeclarations,
  reviewBody,
  reviewFormProblem,
  type ReviewDecision,
  type ReviewState,
} from '@/poufa/declaration-review';
import { color, radii, semantic } from '@/constants/theme';

const FILTERS: readonly (ReviewState | 'TOUTES')[] = ['A_EXAMINER', 'VALIDEE', 'INFIRMEE', 'ALERTE', 'TOUTES'];
const DECISIONS: readonly ReviewDecision[] = ['VALIDEE', 'INFIRMEE', 'ALERTE'];

const frDay = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

function stateTone(s: ReviewState) {
  return s === 'A_EXAMINER' ? 'amber' : s === 'ALERTE' ? 'red' : s === 'VALIDEE' ? 'green' : 'neutral';
}

/**
 * Register of the sanitary declarations for the veterinary services (CDC
 * n° 26 « valident les événements »). Reached from the menu only with
 * SANITAIRE:VALIDER in the access matrix; the server decides and its French
 * message is shown on a refusal.
 */
export default function DeclarationsScreen() {
  const { user } = useAuth();
  const { matrix } = useProgrammeAccess();
  const allowed = canReviewDeclarations(user.role, matrix);
  const [filter, setFilter] = useState<ReviewState | 'TOUTES'>('A_EXAMINER');
  const [open, setOpen] = useState<SanitaryDeclaration | null>(null);
  const list = useQuery({
    queryKey: ['declarations', filter],
    queryFn: () => fetchDeclarations(filter === 'TOUTES' ? undefined : filter),
    enabled: allowed,
    retry: false,
  });

  return (
    <Screen refreshing={list.isFetching} onRefresh={() => void list.refetch()} header={<ScreenHeader title="Déclarations sanitaires" back />}>
      {!allowed ? (
        <ReadOnlyNotice what="l’examen des déclarations sanitaires (droit Sanitaire : Valider)" />
      ) : (
        <>
          <View style={styles.filters}>
            {FILTERS.map((f) => (
              <Pressable key={f} onPress={() => setFilter(f)} accessibilityRole="button">
                <Chip label={f === 'TOUTES' ? 'Toutes' : REVIEW_STATE_LABELS[f]} tone={filter === f ? 'solid' : 'outline'} />
              </Pressable>
            ))}
          </View>
          <StaleNotice show={list.isError && Boolean(list.data)} updatedAt={list.dataUpdatedAt} />
          {list.isLoading ? (
            <Spinner label="Lecture des déclarations…" />
          ) : list.isError && !list.data ? (
            <AppText size="small" color="danger">
              {errorMessage(list.error)}
            </AppText>
          ) : (list.data?.items ?? []).length === 0 ? (
            <EmptyState title="Aucune déclaration" description="Rien à afficher pour ce filtre." />
          ) : (
            (list.data?.items ?? []).map((d) => (
              <Pressable key={d.id} onPress={() => setOpen(d)} accessibilityRole="button" accessibilityLabel={d.title}>
                <Card style={styles.card}>
                  <View style={styles.head}>
                    <AppText size="body" weight="bold" color="text" style={{ flex: 1 }} numberOfLines={1}>
                      {d.title}
                    </AppText>
                    <Chip label={REVIEW_STATE_LABELS[d.reviewState]} tone={stateTone(d.reviewState)} dot />
                  </View>
                  <AppText size="caption" color="muted">
                    {[d.farmCode, d.farmName].filter(Boolean).join(' ')} · {d.batchCode ?? 'bande'} · {frDay(d.occurredAt)}
                    {d.quantity > 0 ? ` · ${d.quantity} sujets` : ''}
                  </AppText>
                </Card>
              </Pressable>
            ))
          )}
        </>
      )}
      {open ? <ReviewSheet declaration={open} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}

function ReviewSheet({ declaration, onClose }: { declaration: SanitaryDeclaration; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [d, setD] = useState(declaration);
  const [decision, setDecision] = useState<ReviewDecision>('VALIDEE');
  const [comment, setComment] = useState('');
  const problem = reviewFormProblem(decision, comment);
  const review = useMutation({
    mutationFn: () => reviewDeclaration(d.id, reviewBody(decision, comment)),
    onSuccess: (fresh) => {
      setD(fresh);
      toast.success('Décision enregistrée', REVIEW_STATE_LABELS[fresh.reviewState]);
      void queryClient.invalidateQueries({ queryKey: ['declarations'] });
      void queryClient.invalidateQueries({ queryKey: ['sanitary-alerts'] });
    },
  });
  const pending = d.reviewState === 'A_EXAMINER';
  return (
    <Sheet visible title={d.title} subtitle={`${d.farmName ?? ''} · ${frDay(d.occurredAt)}`} onClose={onClose}>
      <View style={{ gap: 6 }}>
        <AppText size="small" color="muted">
          Bande {d.batchCode ?? '—'} · {d.quantity} sujets · déclarée par {d.createdByName ?? '—'}
        </AppText>
        {d.symptoms ? <AppText size="small" color="text">{d.symptoms}</AppText> : null}
        {d.description ? <AppText size="small" color="text">{d.description}</AppText> : null}
        {d.clinicalSigns.length > 0 ? <AppText size="small" color="muted">Signes : {d.clinicalSigns.join(', ')}</AppText> : null}
        <Chip label={REVIEW_STATE_LABELS[d.reviewState]} tone={stateTone(d.reviewState)} dot />
        {d.reviewStatus ? (
          <AppText size="small" color="muted">
            Examinée par {d.reviewedByName ?? '—'}
            {d.reviewedAt ? ` le ${frDay(d.reviewedAt)}` : ''}
            {d.reviewComment ? ` : « ${d.reviewComment} »` : '.'}
          </AppText>
        ) : d.alertCode ? (
          <AppText size="small" color="warn">
            Alerte {d.alertCode} ouverte : qualifiez-la dans le circuit des alertes.
          </AppText>
        ) : null}
      </View>
      {pending && !d.alertCode ? (
        <View style={{ gap: 8, marginTop: 12 }}>
          <View style={styles.filters}>
            {DECISIONS.map((x) => (
              <Pressable key={x} onPress={() => setDecision(x)} accessibilityRole="radio" accessibilityState={{ selected: decision === x }}>
                <Chip label={REVIEW_DECISION_LABELS[x]} tone={decision === x ? 'solid' : 'outline'} />
              </Pressable>
            ))}
          </View>
          <TextInput
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={1000}
            placeholder={decision === 'INFIRMEE' ? 'Commentaire (obligatoire)' : 'Commentaire (optionnel)'}
            placeholderTextColor={color.ink[300]}
            style={styles.input}
            editable={!review.isPending}
          />
          {problem ? <AppText size="caption" color="warn">{problem}</AppText> : null}
          {review.isError ? <AppText size="caption" color="danger">{errorMessage(review.error)}</AppText> : null}
          <Button label="Enregistrer la décision" tone="brand" size="lg" disabled={!!problem || review.isPending} onPress={() => review.mutate()} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  card: { gap: 4, padding: 12, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.md,
    padding: 10,
    textAlignVertical: 'top',
    backgroundColor: semantic.surface,
  },
});
