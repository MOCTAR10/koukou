import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { palette, radii } from '@/constants/theme';
import type { Ranked } from './pnlAnalytics';

/**
 * Répartition en barres proportionnelles : la part dominante saute aux yeux
 * sans avoir à lire les chiffres. La part est toujours calculée sur le total
 * réel de la série.
 */
export function BreakdownBars<T>({
  rows,
  totalLabel,
  emptyLabel = 'Aucune donnée sur la période.',
  renderLabel,
  renderMeta,
}: {
  rows: Ranked<T>[];
  totalLabel: string;
  emptyLabel?: string;
  /** Rend le nom du poste (sinon la ligne est anonyme). */
  renderLabel: (item: T) => string;
  /** Texte secondaire accolé au nom (quantité…). */
  renderMeta?: (item: T) => string | undefined;
}) {
  if (rows.length === 0) {
    return (
      <AppText size="small" color="muted" style={{ paddingVertical: 10 }}>
        {emptyLabel}
      </AppText>
    );
  }

  return (
    <View style={styles.root}>
      {rows.map((row) => (
        <View key={renderLabel(row.item)} style={styles.row}>
          <View style={styles.rowHead}>
            <AppText size="small" weight="semibold" color="text" numberOfLines={1} style={{ flex: 1 }}>
              {renderLabel(row.item)}
              {renderMeta?.(row.item) ? (
                <AppText size="small" color="faint">
                  {'  '}
                  {renderMeta(row.item)}
                </AppText>
              ) : null}
            </AppText>
            <AppText size="small" weight="bold" color="text">
              {formatAmount(row.amountFcfa)}
            </AppText>
            <View style={styles.pctPill}>
              <AppText size="small" weight="bold" color="brand">
                {Math.round(row.pct)} %
              </AppText>
            </View>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(2, row.pct)}%` }]} />
          </View>
        </View>
      ))}

      <View style={styles.totalRow}>
        <AppText size="small" color="muted">
          Total
        </AppText>
        <AppText size="small" weight="bold" color="text">
          {totalLabel}
        </AppText>
      </View>
    </View>
  );
}

function formatAmount(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

/** Jauge d'encaissement : part encaissée vs reste à recouvrer. */
export function CollectionBar({
  ratePct,
  outstandingFcfa,
}: {
  ratePct: number | null;
  outstandingFcfa: number;
}) {
  const rate = ratePct ?? 0;
  const complete = outstandingFcfa <= 0;
  return (
    <View style={styles.root}>
      <View style={styles.rowHead}>
        <AppText size="small" weight="semibold" color="text" style={{ flex: 1 }}>
          Encaissement des ventes
        </AppText>
        <AppText size="small" weight="bold" color={complete ? 'success' : 'warn'}>
          {ratePct == null ? '—' : `${Math.round(rate)} %`}
        </AppText>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.min(100, Math.max(2, rate))}%`,
              backgroundColor: complete ? palette.green[500] : palette.amber[400],
            },
          ]}
        />
      </View>
      <AppText size="small" color="faint">
        {complete
          ? 'Tout est encaissé — aucune créance en cours.'
          : `Reste à recouvrer : ${Math.round(outstandingFcfa).toLocaleString('fr-FR')} FCFA.`}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  row: {
    gap: 6,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.surfaceAlt,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.brand[500],
  },
  pctPill: {
    minWidth: 42,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: palette.brand[50],
    alignItems: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
});