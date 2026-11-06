import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CloudUpload, FileLock2, Gauge, GitMerge, LogOut, Scale } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Spinner } from '@/components/ui/Spinner';
import { errorMessage } from '@/components/ui/Feedback';
import { SortieSheet } from './SortieSheet';
import { fetchBandComparison, fetchBandIndicators, fetchBandSnapshots, fetchSorties, type SortiePayload } from '@/api/poufa';
import { cachedRead } from '@/offline/ref-cache';
import { useOfflineQueue } from '@/offline';
import { COMPARISON_METRICS, comparisonRows, fmtIndicator, suppressionNote, type CellTone } from '@/poufa/comparison';
// POUFA lot A bande: weighing schedule and recorded offline conflicts.
import { fetchBandSheet, fetchSyncConflicts } from '@/api/poufa';
import { sampleWarning, weighingLine } from '@/poufa/weighing';
import { conflictExplanation } from '@/poufa/conflicts';
import { color, palette, radii, semantic } from '@/constants/theme';
// POUFA lot A indic: the farm's band history under the band sheet; margin label of the formula in force.
import { BandHistoryList } from './BandHistoryList';
import { marginLabel } from '@/poufa/official-headline';

const TRIGGER_LABEL: Record<string, string> = {
  CLOTURE_AUTO: 'Clôture automatique',
  CLOTURE_MANUELLE: 'Clôture',
  CORRECTION: 'Correction',
};

const TONE_COLOR: Record<CellTone, string> = {
  better: palette.green[700],
  worse: palette.red[600],
  same: color.ink[600],
  none: color.ink[600],
};

function frDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function Failure({ error }: { error: unknown }) {
  return (
    <AppText size="caption" color="danger" style={styles.pad}>
      {errorMessage(error)}
    </AppText>
  );
}

interface Props {
  farmId: string;
  batch: { id: string; batchName: string | null; quantityAlive: number; integrationDate: string; status: string };
  /** `saisie:creer` (POST sorties). */
  canExit: boolean;
  has: (code: string) => boolean;
}

/**
 * POUFA band sheet in the lot screen: official indicators (parameterised
 * formulas of the programme), frozen snapshots, comparison with the anonymous
 * programme average per age week, and band exits with a reason.
 */
export function BandPanel({ farmId, batch, canExit, has }: Props) {
  const batchId = batch.id;
  const [sortieOpen, setSortieOpen] = useState(false);
  const queue = useOfflineQueue(farmId);
  const queuedSorties = queue.pending
    .filter((op) => op.kind === 'sortie' && op.batchId === batchId)
    .map((op) => ({ id: op.id, payload: (op.payload as { payload: SortiePayload }).payload }));

  const indicators = useQuery({
    queryKey: ['band-indicators', farmId, batchId],
    queryFn: () => cachedRead(`band-indicators.${farmId}.${batchId}`, () => fetchBandIndicators(farmId, batchId)),
  });
  const comparison = useQuery({
    queryKey: ['band-comparison', farmId, batchId],
    queryFn: () => cachedRead(`band-comparison.${farmId}.${batchId}`, () => fetchBandComparison(farmId, batchId)),
  });
  const snapshots = useQuery({
    queryKey: ['band-snapshots', farmId, batchId],
    queryFn: () => cachedRead(`band-snapshots.${farmId}.${batchId}`, () => fetchBandSnapshots(farmId, batchId)),
  });
  const sorties = useQuery({
    queryKey: ['band-sorties', farmId, batchId],
    queryFn: () => cachedRead(`band-sorties.${farmId}.${batchId}`, () => fetchSorties(farmId, batchId)),
  });

  const sheet = useQuery({
    queryKey: ['band-sheet', farmId, batchId],
    queryFn: () => cachedRead(`band-sheet.${farmId}.${batchId}`, () => fetchBandSheet(farmId, batchId)),
  });
  const conflicts = useQuery({
    queryKey: ['sync-conflicts', farmId, batchId],
    queryFn: () => cachedRead(`sync-conflicts.${farmId}.${batchId}`, () => fetchSyncConflicts(farmId, batchId)),
  });

  const rows = comparison.data ? comparisonRows(comparison.data) : [];
  const note = comparison.data ? suppressionNote(comparison.data) : null;
  const closed = batch.status === 'CLOTURE';
  const weighing = sheet.data ? weighingLine(sheet.data.weighing, closed) : null;
  const weighingWarning = sheet.data ? sampleWarning(sheet.data.weighing) : null;

  return (
    <View style={{ gap: 14 }}>
      {/* Official indicators */}
      <SectionHeader
        title="Indicateurs officiels"
        subtitle={indicators.data ? `Au ${frDay(indicators.data.asOf)} · J${indicators.data.ageDays}` : 'Formules du programme'}
        icon={Gauge}
        iconColor={color.brand[700]}
        iconBg={semantic.primarySoft}
      />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {indicators.isLoading ? (
          <Spinner label="Calcul des indicateurs…" />
        ) : indicators.isError ? (
          <Failure error={indicators.error} />
        ) : (indicators.data?.indicators ?? []).length === 0 ? (
          <AppText size="caption" color="muted" style={styles.pad}>
            Aucun indicateur paramétré par le programme.
          </AppText>
        ) : (
          <>
            {indicators.data!.indicators.map((ind, i) => (
              <View key={ind.key} style={[styles.kv, i > 0 && styles.sep]}>
                <AppText size="body" color="text" style={{ flex: 1 }}>
                  {ind.label}
                </AppText>
                <AppText size="body" weight="bold" color="text">
                  {fmtIndicator(ind.value, ind.unit)}
                </AppText>
              </View>
            ))}
            {indicators.data!.completenessPct != null ? (
              <AppText size="small" color="muted" style={styles.pad}>
                Saisies complètes à {Math.round(indicators.data!.completenessPct)} %
              </AppText>
            ) : null}
          </>
        )}
      </Card>

      {/* Weighings (CDC 8): next due date, delay, sample size */}
      <SectionHeader
        title="Pesées"
        subtitle="Échéance et échantillon fixés par le programme"
        icon={Scale}
        iconColor={color.brand[700]}
        iconBg={semantic.primarySoft}
      />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {sheet.isLoading ? (
          <Spinner label="Lecture des pesées…" />
        ) : sheet.isError ? (
          <Failure error={sheet.error} />
        ) : weighing ? (
          <View style={styles.week}>
            <View style={styles.head}>
              <AppText size="body" weight="bold" color={weighing.tone === 'late' ? 'danger' : 'text'} style={{ flex: 1 }}>
                {weighing.label}
              </AppText>
              {weighing.tone === 'late' ? <Chip label="En retard" tone="red" /> : null}
            </View>
            <AppText size="small" color="muted">
              {weighing.detail}
            </AppText>
            {weighingWarning ? (
              <View style={styles.warn}>
                <AppText size="small" color="warn">
                  {weighingWarning}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>

      {/* Comparison with the programme average */}
      <SectionHeader
        title="Comparaison au programme"
        subtitle="Moyenne anonyme des autres bandes, même semaine d’âge"
        icon={BarChart3}
        iconColor={palette.accent[700]}
        iconBg={semantic.accentSoft}
      />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {comparison.isLoading ? (
          <Spinner label="Lecture de la comparaison…" />
        ) : comparison.isError ? (
          <Failure error={comparison.error} />
        ) : rows.length === 0 ? (
          <AppText size="caption" color="muted" style={styles.pad}>
            Pas encore de semaine complète à comparer.
          </AppText>
        ) : (
          <>
            {rows.map((r, i) => (
              <View key={r.week} style={[styles.week, i > 0 && styles.sep]}>
                <View style={styles.head}>
                  <AppText size="body" weight="bold" color="text" style={{ flex: 1 }}>
                    Semaine {r.week} <AppText size="caption" color="muted">({r.ages})</AppText>
                  </AppText>
                  {r.current ? <Chip label="En cours" tone="brand" /> : null}
                  {r.suppressed ? <Chip label="Moyenne masquée" tone="outline" /> : null}
                </View>
                {COMPARISON_METRICS.map((metric) => {
                  const c = r.cells[metric.key];
                  return (
                    <View key={metric.key} style={styles.metric}>
                      <AppText size="small" color="muted" style={{ width: 72 }}>
                        {metric.label}
                      </AppText>
                      <AppText size="small" weight="bold" style={{ flex: 1, color: TONE_COLOR[c.tone] }}>
                        {c.band}
                      </AppText>
                      <AppText size="small" color={r.suppressed ? 'faint' : 'muted'}>
                        Programme {c.programme}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            ))}
            {note ? (
              <AppText size="small" color="muted" style={styles.pad}>
                {note}
              </AppText>
            ) : null}
          </>
        )}
      </Card>

      {/* Band exits */}
      <SectionHeader
        title="Sorties de la bande"
        subtitle="Vente, abattoir, réforme, don…"
        icon={LogOut}
        iconColor={color.brand[700]}
        iconBg={semantic.primarySoft}
        right={
          canExit && !closed ? <Button label="Sortie" size="sm" block={false} icon={LogOut} onPress={() => setSortieOpen(true)} /> : undefined
        }
      />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {queuedSorties.map((q) => (
          <View key={q.id} style={[styles.kv, styles.queued]}>
            <CloudUpload size={14} color={palette.amber[700]} />
            <AppText size="small" color="text" style={{ flex: 1 }}>
              {q.payload.count} sujet{q.payload.count > 1 ? 's' : ''} · {q.payload.reasonCode} · {frDay(q.payload.sortieDate)}
            </AppText>
            <AppText size="caption" color="warn">
              En attente d’envoi
            </AppText>
          </View>
        ))}
        {sorties.isLoading ? (
          <Spinner label="Lecture des sorties…" />
        ) : sorties.isError ? (
          <Failure error={sorties.error} />
        ) : (sorties.data ?? []).length === 0 && queuedSorties.length === 0 ? (
          <AppText size="caption" color="muted" style={styles.pad}>
            Aucune sortie enregistrée.
          </AppText>
        ) : (
          (sorties.data ?? []).map((s, i) => (
            <View key={s.id} style={[styles.week, (i > 0 || queuedSorties.length > 0) && styles.sep]}>
              <View style={styles.head}>
                <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>
                  {s.count} sujet{s.count > 1 ? 's' : ''} · {s.reasonLabel ?? s.reasonCode}
                </AppText>
                <AppText size="caption" color="muted">
                  {frDay(s.sortieDate)}
                </AppText>
              </View>
              <AppText size="small" color="muted">
                {[
                  s.weightKg != null ? `${s.weightKg.toLocaleString('fr-FR')} kg` : null,
                  s.recipientName,
                  s.unitPriceFcfa != null ? `${s.unitPriceFcfa.toLocaleString('fr-FR')} FCFA/${s.priceUnit === 'KG' ? 'kg' : 'tête'}` : null,
                  s.slaughterStatus ? `abattage : ${s.slaughterStatus.toLowerCase()}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </AppText>
            </View>
          ))
        )}
      </Card>
      {closed ? (
        <AppText size="small" color="muted">
          Bande clôturée : lecture seule.
        </AppText>
      ) : null}

      {/* Offline conflicts (CDC §7.2): which value was kept, and why */}
      <SectionHeader
        title="Conflits de saisie hors ligne"
        subtitle="La saisie la plus récente est retenue"
        icon={GitMerge}
        iconColor={palette.amber[700]}
        iconBg={semantic.warnSoft}
      />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {conflicts.isLoading ? (
          <Spinner label="Lecture des conflits…" />
        ) : conflicts.isError ? (
          <Failure error={conflicts.error} />
        ) : (conflicts.data ?? []).length === 0 ? (
          <AppText size="caption" color="muted" style={styles.pad}>
            Aucun conflit : les saisies hors ligne de cette bande ont été appliquées sans écraser d’autre valeur.
          </AppText>
        ) : (
          (conflicts.data ?? []).map((c, i) => {
            const e = conflictExplanation(c);
            return (
              <View key={c.id} style={[styles.week, i > 0 && styles.sep]}>
                <View style={styles.head}>
                  <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>
                    {e.title}
                  </AppText>
                  <Chip label={`Retenu : ${e.kept}`} tone={c.winner === 'APPAREIL' ? 'brand' : 'neutral'} />
                </View>
                <AppText size="small" color="muted">
                  {e.text}
                </AppText>
              </View>
            );
          })
        )}
      </Card>

      {/* Frozen snapshots */}
      <SectionHeader
        title="Bilans figés"
        subtitle="Instantanés versionnés, jamais recalculés"
        icon={FileLock2}
        iconColor={color.ink[600]}
        iconBg={semantic.surfaceAlt}
      />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {snapshots.isLoading ? (
          <Spinner label="Lecture des bilans…" />
        ) : snapshots.isError ? (
          <Failure error={snapshots.error} />
        ) : (snapshots.data ?? []).length === 0 ? (
          <AppText size="caption" color="muted" style={styles.pad}>
            Aucun bilan figé : il est pris à la clôture de la bande.
          </AppText>
        ) : (
          (snapshots.data ?? [])
            .slice()
            .sort((a, b) => b.version - a.version)
            .map((snap, i) => (
              <View key={snap.id} style={[styles.week, i > 0 && styles.sep]}>
                <View style={styles.head}>
                  <AppText size="body" weight="bold" color="text" style={{ flex: 1 }}>
                    Version {snap.version} · {TRIGGER_LABEL[snap.trigger] ?? snap.trigger}
                  </AppText>
                  <AppText size="caption" color="muted">
                    {frDay(snap.asOf)} · J{snap.ageDays}
                  </AppText>
                </View>
                {snap.reason ? (
                  <AppText size="small" color="muted">
                    {snap.reason}
                  </AppText>
                ) : null}
                {snap.indicators.map((ind) => (
                  <View key={ind.key} style={styles.metric}>
                    <AppText size="small" color="muted" style={{ flex: 1 }}>
                      {ind.label}
                    </AppText>
                    <AppText size="small" weight="semibold" color="text">
                      {fmtIndicator(ind.value, ind.unit)}
                    </AppText>
                  </View>
                ))}
                {snap.marginFcfa != null ? (
                  <View style={styles.metric}>
                    <AppText size="small" color="muted" style={{ flex: 1 }}>
                      {marginLabel(snap.indicators, 'marge_fcfa')}
                    </AppText>
                    <AppText size="small" weight="semibold" color={snap.marginFcfa < 0 ? 'danger' : 'text'}>
                      {snap.marginFcfa.toLocaleString('fr-FR')} FCFA
                    </AppText>
                  </View>
                ) : null}
              </View>
            ))
        )}
      </Card>

      <BandHistoryList farmId={farmId} currentId={batchId} />

      {canExit ? <SortieSheet visible={sortieOpen} onClose={() => setSortieOpen(false)} farmId={farmId} batch={batch} has={has} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 12 },
  kv: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border },
  week: { padding: 12, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  queued: { backgroundColor: semantic.warnSoft },
  warn: { marginTop: 6, padding: 10, borderRadius: radii.md, backgroundColor: semantic.warnSoft },
});
