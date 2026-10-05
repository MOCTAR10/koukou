import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { palette, radii } from '@/constants/theme';
import { compactFcfa, plainPct, signedPct } from './pnlAnalytics';

/**
 * Bloc « résultat » : la carte sombre qui donne le chiffre en un coup d'œil.
 * Fond dégradé brand → ink, montant net en display, marge et comparaison à la
 * fenêtre précédente. Le contraste est calculé pour rester lisible sur fond
 * sombre (texte blanc à 88/72/56 %, jamais `faint`).
 */
export function PnlHero({
  netFcfa,
  marginPct: margin,
  deltaPct: delta,
  periodLabel,
  revenueFcfa,
  expensesFcfa,
}: {
  netFcfa: number;
  marginPct: number | null;
  deltaPct: number | null;
  periodLabel: string;
  revenueFcfa: number;
  expensesFcfa: number;
}) {
  const positive = netFcfa >= 0;
  const accent = positive ? palette.green[300] : palette.red[300];

  const DeltaIcon = delta == null ? Minus : delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deltaText = delta == null ? 'Pas de comparaison' : signedPct(delta) ?? '—';

  return (
    <View style={styles.hero}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.head}>
        <AppText size="label" weight="bold" color={palette.brand[200]} numberOfLines={1} style={{ flex: 1 }}>
          RÉSULTAT NET · {periodLabel.toUpperCase()}
        </AppText>
        <View style={[styles.badge, { backgroundColor: positive ? 'rgba(108,170,88,0.20)' : 'rgba(213,67,43,0.20)' }]}>
          <AppText size="small" weight="bold" color={accent}>
            {positive ? 'Bénéfice' : 'Perte'}
          </AppText>
        </View>
      </View>

      <AppText
        size="display"
        weight="bold"
        color="#FFFFFF"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={styles.amount}>
        {netFcfa < 0 ? '−' : ''}
        {compactFcfa(Math.abs(netFcfa))} FCFA
      </AppText>

      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <AppText size="small" color={palette.brand[200]}>
            Marge
          </AppText>
          <AppText size="bodyM" weight="bold" color="#FFFFFF">
            {plainPct(margin) ?? '—'}
          </AppText>
        </View>

        <View style={styles.metaDivider} />

        <View style={[styles.metaChip, { flex: 1 }]}>
          <View style={styles.deltaRow}>
            <DeltaIcon size={14} color={delta == null ? palette.brand[300] : delta > 0 ? palette.green[300] : delta < 0 ? palette.red[300] : palette.brand[300]} />
            <AppText
              size="bodyM"
              weight="bold"
              color={delta == null ? palette.brand[100] : delta > 0 ? palette.green[300] : delta < 0 ? palette.red[300] : palette.brand[100]}>
              {deltaText}
            </AppText>
          </View>
          <AppText size="small" color={palette.brand[300]} numberOfLines={1}>
            vs période précédente
          </AppText>
        </View>
      </View>

      <View style={styles.ledger}>
        <LedgerCell label="Revenus" value={compactFcfa(revenueFcfa)} />
        <View style={styles.ledgerDivider} />
        <LedgerCell label="Dépenses" value={`− ${compactFcfa(expensesFcfa)}`} />
      </View>
    </View>
  );
}

function LedgerCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <AppText size="small" color={palette.brand[300]}>
        {label}
      </AppText>
      <AppText size="h3" weight="bold" color="#FFFFFF" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radii.xxl,
    padding: 20,
    gap: 12,
    overflow: 'hidden',
    backgroundColor: palette.brand[950],
    borderWidth: 1,
    borderColor: palette.brand[800],
    shadowColor: palette.brand[950],
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  glowTop: {
    position: 'absolute',
    top: -70,
    right: -50,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: palette.brand[700],
    opacity: 0.4,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -90,
    left: -40,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: palette.accent[700],
    opacity: 0.16,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  amount: {
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaChip: {
    gap: 2,
  },
  metaDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: palette.brand[800],
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ledger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.brand[800],
  },
  ledgerDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: palette.brand[800],
  },
});