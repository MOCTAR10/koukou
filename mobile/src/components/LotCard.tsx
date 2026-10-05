import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { AppText } from './ui/AppText';
import { Card } from './ui/Card';
import { Chip } from './ui/Chip';
import { color, palette, fmt } from '@/constants/theme';
import { normalizeMortalityStatus } from '@/constants/health';
import type { HealthOverviewRow } from '@/api/types';
import { SPECIES_ICONS, speciesLabel } from '@/api/format';

function typeLabel(t: string) {
  return t === 'CHAIR' ? 'Chair' : 'Pondeuse';
}

function statusTone(status: string): 'green' | 'brand' | 'neutral' {
  if (status === 'EN_VENTE') return 'green';
  if (status === 'ACTIF') return 'brand';
  return 'neutral';
}

function statusLabel(status: string) {
  if (status === 'EN_VENTE') return 'En vente';
  if (status === 'FINI') return 'Fini';
  if (status === 'CLOTURE') return 'Clôturé';
  return 'Actif';
}

export function LotCard({ row, onPress }: { row: HealthOverviewRow; onPress?: () => void }) {
  const lag = row.lastEntryLagDays;
  const bs = row.breedStatus;
  return (
    <Card onPress={onPress} padding={false} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.head}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText size="body" weight="bold" color="text" numberOfLines={1}>
              {row.batchName ?? 'Lot'}
            </AppText>
            {bs ? (
              <AppText size="small" color="muted" numberOfLines={1}>
                {bs.breedName} · Semaine {bs.week}
              </AppText>
            ) : null}
          </View>
          <View style={styles.chips}>
            <Chip label={typeLabel(row.type)} tone="brand" />
            {row.species && row.species !== 'POULET' && (
              <Chip label={`${SPECIES_ICONS[row.species] ?? ''} ${row.species === 'AUTRE' && row.customSpecies ? row.customSpecies : speciesLabel(row.species)}`} tone="neutral" />
            )}
            <Chip label={statusLabel(row.status)} tone={statusTone(row.status)} />
          </View>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <AppText size="h3" weight="bold" color="text">
              J{row.ageDays}
            </AppText>
            <AppText size="small" color="muted">
              âge
            </AppText>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <AppText size="h3" weight="bold" color="text">
              {fmt(row.liveCount)}
            </AppText>
            <AppText size="small" color="muted">
              vivants
            </AppText>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <AppText size="h3" weight="bold" color={normalizeMortalityStatus(row.mortalityStatus, row.mortalityPercent) === 'normal' ? 'text' : 'danger'}>
              {row.mortalityPercent.toLocaleString('fr-FR')}%
            </AppText>
            <AppText size="small" color="muted">
              mortalité
            </AppText>
          </View>
          <View style={styles.divider} />
          <View style={[styles.stat, { alignItems: 'flex-end' }]}>
            <View style={styles.alertDots}>
              {row.alertesRouges > 0 && <View style={styles.dotRouge} />}
              {row.alertesJaunes > 0 && <View style={styles.dotJaune} />}
              {row.alertesRouges === 0 && row.alertesJaunes === 0 && <View style={styles.dotVert} />}
            </View>
            <AppText size="small" color={lag != null && lag > 0 ? 'amber' : 'success'}>
              {lag != null && lag > 0 ? `saisie -${lag} j` : 'saisie ok'}
            </AppText>
          </View>
        </View>

        {bs && (bs.fcrDeviationPct != null || bs.layRateDeviationPct != null) ? (
          <View style={styles.breedRow}>
            {bs.fcrDeviationPct != null ? (
              <View style={styles.breedItem}>
                <AppText size="small" color="muted">IC vs cible</AppText>
                <AppText size="small" weight="semibold" color={bs.fcrDeviationPct > 10 ? 'danger' : bs.fcrDeviationPct < -5 ? 'success' : 'text'}>
                  {bs.fcrDeviationPct > 0 ? '+' : ''}{bs.fcrDeviationPct.toFixed(1)}%
                </AppText>
              </View>
            ) : null}
            {bs.layRateDeviationPct != null ? (
              <View style={styles.breedItem}>
                <AppText size="small" color="muted">Ponte vs cible</AppText>
                <AppText size="small" weight="semibold" color={bs.layRateDeviationPct < -10 ? 'danger' : 'success'}>
                  {bs.layRateDeviationPct > 0 ? '+' : ''}{bs.layRateDeviationPct.toFixed(1)}%
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}

        <ChevronRight size={18} color={color.ink[300]} style={styles.chevron} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
  },
  row: {
    gap: 12,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stat: {
    flex: 1,
    gap: 1,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: color.border,
    marginHorizontal: 10,
  },
  alertDots: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 2,
  },
  dotRouge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.red[500],
  },
  dotJaune: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.amber[500],
  },
  dotVert: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.green[600],
  },
  chevron: {
    position: 'absolute',
    right: 0,
    top: 2,
  },
  breedRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  breedItem: {
    gap: 1,
  },
});
