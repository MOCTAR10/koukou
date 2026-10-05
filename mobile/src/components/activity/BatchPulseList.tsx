import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import type { HealthOverviewRow } from '@/api/types';
import { color } from '@/constants/theme';
import { normalizeMortalityStatus } from '@/constants/health';

/**
 * Vue « Lots » : l'état de vie de chaque lot, pas une liste de plus — seuls les
 * chiffres qui décident quelque chose (vivants, âge, mortalité, saisie du jour).
 */
export function BatchPulseList({ rows }: { rows: HealthOverviewRow[] }) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <AppText size="small" color="faint" align="center">
          Aucun lot actif. Créez un premier lot pour suivre sa croissance.
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {rows.map((row) => {
        const stale = (row.lastEntryLagDays ?? 0) > 0;
        // `/dashboard` ne renvoie pas `mortalityStatus` : on normalise sur place.
        const status = normalizeMortalityStatus(row.mortalityStatus, row.mortalityPercent);
        return (
          <Pressable
            key={row.batchId}
            onPress={() => router.push(`/lot/${row.batchId}`)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`${row.batchName ?? 'Lot'}, ${row.liveCount} vivants, ${row.ageDays} jours`}>
            <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
              <View style={styles.titleRow}>
                <AppText size="bodyM" weight="bold" color="text" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {row.batchName ?? 'Lot'}
                </AppText>
                {row.alertesRouges > 0 ? (
                  <View style={styles.alertTag}>
                    <AppText size="small" weight="bold" style={{ color: '#B37C6A' }}>
                      {row.alertesRouges} alerte{row.alertesRouges > 1 ? 's' : ''}
                    </AppText>
                  </View>
                ) : status === 'normal' ? null : (
                  <View style={styles.watchTag}>
                    <AppText size="small" weight="bold" style={{ color: '#8A7845' }}>
                      À surveiller
                    </AppText>
                  </View>
                )}
              </View>
              <AppText size="small" color="muted" numberOfLines={1}>
                {fmtNum(row.liveCount ?? 0)} vivants · {row.ageDays ?? 0} j
                {row.weekDeaths > 0 ? ` · ${fmtNum(row.weekDeaths)} morts / sem.` : ''}
              </AppText>
              {stale ? (
                <AppText size="small" color="muted" numberOfLines={1}>
                  Aucune saisie depuis {row.lastEntryLagDays} j
                </AppText>
              ) : null}
            </View>

            <View style={styles.mortality}>
              <AppText
                size="bodyM"
                weight="bold"
                color={status === 'critical' ? 'danger' : status === 'elevated' ? 'muted' : 'text'}
                numberOfLines={1}>
                {(row.mortalityPercent ?? 0).toFixed(1)}%
              </AppText>
              <AppText size="small" color="faint" numberOfLines={1}>
                mort.
              </AppText>
            </View>
            <ChevronRight size={15} color={color.ink[300]} />
          </Pressable>
        );
      })}
    </View>
  );
}

function fmtNum(value: number): string {
  return value.toLocaleString('fr-FR');
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  readyTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#E6F0E0',
  },
  watchTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#F3EEDA',
  },
  alertTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#F6E7E2',
  },
  mortality: {
    alignItems: 'flex-end',
  },
  empty: {
    paddingVertical: 18,
  },
});