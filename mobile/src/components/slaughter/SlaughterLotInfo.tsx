import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle, Bird } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { color, palette } from '@/constants/theme';
import type { LotSlaughterSummary } from '@/utils/slaughterInsights';

/** Petit badge de carte de lot : activité d'abattage en un coup d'œil. */
export function SlaughterBadge({ summary }: { summary: LotSlaughterSummary }) {
  if (!summary.hasActivity) return null;
  const over = summary.overbooked;
  const fg = over ? palette.red[700] : summary.pendingCount > 0 ? palette.amber[700] : palette.green[700];
  return (
    <View style={[styles.badge, { backgroundColor: over ? palette.red[50] : summary.pendingCount > 0 ? palette.amber[50] : palette.green[50], borderColor: over ? palette.red[200] : summary.pendingCount > 0 ? palette.amber[200] : palette.green[200] }]}>
      {over ? <AlertTriangle size={12} color={fg} /> : <Bird size={12} color={fg} />}
      <AppText size="small" weight="bold" color={fg}>
        {over
          ? 'Surcapacité d’abattage'
          : summary.pendingCount > 0
            ? `${summary.pendingBirds} réservés à l’abattage`
            : `${summary.processedBirds} abattus · ${Math.round(summary.carcassKg)} kg`}
      </AppText>
    </View>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'amber' | 'green' | 'brand' | 'default' }) {
  const valueColor = tone === 'amber' ? palette.amber[600] : tone === 'green' ? palette.green[600] : tone === 'brand' ? palette.brand[600] : color.ink[500];
  return (
    <View style={styles.stat}>
      <AppText size="small" color="muted">{label}</AppText>
      <AppText size="body" weight="bold" color={valueColor}>
        {value}
      </AppText>
      {sub ? <AppText size="caption" color="faint">{sub}</AppText> : null}
    </View>
  );
}

/** Carte compacte d'abattage d'un lot (fiche lot / bottom sheet). */
export function SlaughterInfoCard({ summary, showEmpty }: { summary: LotSlaughterSummary; showEmpty?: boolean }) {
  if (!summary.hasActivity) {
    if (!showEmpty) return null;
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.iconTile, { backgroundColor: palette.brand[50] }]}>
            <Bird size={15} color={palette.brand[600]} />
          </View>
          <AppText size="body" weight="bold" color="brand">Abattage</AppText>
        </View>
        <AppText size="small" color="muted">Aucun ordre d’abattage pour ce lot pour le moment.</AppText>
      </Card>
    );
  }

  const over = summary.overbooked;
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconTile, { backgroundColor: palette.brand[50] }]}>
          <Bird size={15} color={palette.brand[600]} />
        </View>
        <AppText size="body" weight="bold" color="brand">Abattage</AppText>
        {over ? (
          <View style={[styles.overPill, { backgroundColor: palette.red[50] }]}>
            <AlertTriangle size={11} color={palette.red[600]} />
            <AppText size="small" weight="bold" color={palette.red[600]}>Surcapacité</AppText>
          </View>
        ) : (
          <AppText size="small" color="muted" style={{ marginLeft: 'auto' }}>
            {summary.pendingCount + summary.processedCount} ordres
          </AppText>
        )}
      </View>

      <View style={styles.row}>
        <Stat
          label="À abattre"
          value={summary.pendingCount > 0 ? `${summary.pendingBirds}` : '—'}
          sub={summary.pendingCount > 0 ? `${summary.pendingCount} ordre${summary.pendingCount > 1 ? 's' : ''}` : 'aucun'}
          tone="amber"
        />
        <Stat
          label="Abattus"
          value={summary.processedCount > 0 ? `${summary.processedBirds}` : '—'}
          sub={summary.processedCount > 0 ? `${summary.processedCount} ordre${summary.processedCount > 1 ? 's' : ''}` : 'aucun'}
          tone="green"
        />
        <Stat label="Carcasse" value={summary.carcassKg > 0 ? `${Math.round(summary.carcassKg)} kg` : '—'} tone="brand" />
        <Stat label="Rendement" value={summary.rendementPct != null ? `${summary.rendementPct.toFixed(1)} %` : '—'} tone="default" />
      </View>

      <View style={[styles.foot, { backgroundColor: over ? palette.red[50] : palette.surfaceAlt }]}>
        {over ? (
          <>
            <AlertTriangle size={12} color={palette.red[600]} />
            <AppText size="small" color={palette.red[700]}>
              {summary.pendingBirds} réservés &gt; {summary.alive} vivants — traitez les ordres en cours avant d’en créer de nouveaux.
            </AppText>
          </>
        ) : (
          <AppText size="small" color="muted">Restants pour un nouvel ordre : {summary.remaining} oiseaux.</AppText>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  card: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconTile: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginLeft: 'auto',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
});