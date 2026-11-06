import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { History, Trophy } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Spinner } from '@/components/ui/Spinner';
import { errorMessage } from '@/components/ui/Feedback';
import { fetchBandHistory } from '@/api/poufa';
import { cachedRead } from '@/offline/ref-cache';
import { HEADLINE, bestBands, findIndicator, officialText } from '@/poufa/official-headline';
import { color, fmtFcfa, palette, semantic } from '@/constants/theme';

function frDay(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * CDC n° 11 « Historique des bandes » : the farm's closed bands compared on
 * their last frozen bilan (official indicators, revenue, margin); the best
 * band on each indicator carries a trophy. `currentId`: the band on screen.
 */
export function BandHistoryList({ farmId, currentId }: { farmId: string; currentId?: string }) {
  const history = useQuery({
    queryKey: ['band-history', farmId, 'CLOTURE'],
    queryFn: () => cachedRead(`band-history.${farmId}.CLOTURE`, () => fetchBandHistory(farmId, 'CLOTURE')),
    retry: false,
  });
  const rows = history.data ?? [];
  const best = bestBands(rows);

  return (
    <View style={{ gap: 10 }}>
      <SectionHeader
        title="Historique des bandes"
        subtitle="Bandes clôturées de la ferme, sur leur dernier bilan figé"
        icon={History}
        iconColor={color.ink[600]}
        iconBg={semantic.surfaceAlt}
      />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {history.isLoading ? (
          <Spinner label="Lecture de l’historique…" />
        ) : history.isError ? (
          <AppText size="caption" color="danger" style={styles.pad}>
            {errorMessage(history.error)}
          </AppText>
        ) : rows.length === 0 ? (
          <AppText size="caption" color="muted" style={styles.pad}>
            Aucune bande clôturée pour l’instant : le bilan est figé à la clôture.
          </AppText>
        ) : (
          rows.map((r, i) => {
            const s = r.summary;
            return (
              <View key={r.id} style={[styles.band, i > 0 && styles.sep, r.id === currentId && styles.current]}>
                <View style={styles.head}>
                  <AppText size="body" weight="bold" color="text" style={{ flex: 1 }} numberOfLines={1}>
                    {r.code ?? r.batchName ?? 'Bande'}
                  </AppText>
                  <AppText size="caption" color="muted">
                    {frDay(r.integrationDate)} → {frDay(r.closedAt)}
                    {s?.durationDays != null ? ` · ${s.durationDays} j` : ''}
                  </AppText>
                </View>
                <View style={styles.grid}>
                  {HEADLINE.map(({ key, label }) => (
                    <View key={key} style={styles.cell}>
                      <AppText size="small" color="muted">
                        {label}
                      </AppText>
                      <View style={styles.value}>
                        <AppText size="small" weight="bold" color="text">
                          {officialText(findIndicator(s?.indicators, key))}
                        </AppText>
                        {best[key] === r.id ? <Trophy size={12} color={palette.amber[500]} accessibilityLabel="Meilleure bande" /> : null}
                      </View>
                    </View>
                  ))}
                </View>
                <AppText size="small" color="muted">
                  CA {s?.revenueFcfa != null ? fmtFcfa(s.revenueFcfa) : '—'} · Marge{' '}
                  <AppText size="small" weight="semibold" color={s?.marginFcfa != null && s.marginFcfa < 0 ? 'danger' : 'text'}>
                    {s?.marginFcfa != null ? fmtFcfa(s.marginFcfa) : '—'}
                  </AppText>
                  {s?.snapshotVersion && s.snapshotVersion > 1 ? ` · bilan v${s.snapshotVersion} (corrigé)` : ''}
                </AppText>
              </View>
            );
          })
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 12 },
  band: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.ink[200] },
  current: { backgroundColor: semantic.primarySoft },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grid: { flexDirection: 'row' },
  cell: { flex: 1, gap: 2 },
  value: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
