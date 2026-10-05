import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BookOpen, Coins, FileBarChart2, HandCoins, Syringe, Wheat } from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { color, palette, radii } from '@/constants/theme';

interface QuickActionsProps {
  onPick: (key: 'saisie' | 'vente' | 'soin' | 'provende' | 'caisse' | 'rapports') => void;
}

const ACTIONS = [
  { key: 'saisie' as const, label: 'Saisie du jour', sub: 'Morts, aliments, eau', icon: BookOpen, bg: color.brand[50], fg: color.brand[600] },
  { key: 'vente' as const, label: 'Encaisser', sub: 'POS espèces', icon: HandCoins, bg: color.accent[50], fg: color.accent[600] },
  { key: 'caisse' as const, label: 'Caisse', sub: 'Ouvrir / clôturer', icon: Coins, bg: color.green[50], fg: color.green[600] },
  { key: 'soin' as const, label: 'Soin', sub: 'Prophylaxie', icon: Syringe, bg: color.brand[50], fg: color.brand[700] },
  { key: 'provende' as const, label: 'Provende', sub: 'Entrée HACCP', icon: Wheat, bg: color.amber[50], fg: color.amber[600] },
  { key: 'rapports' as const, label: 'Rapports', sub: 'P&L & exports', icon: FileBarChart2, bg: color.surfaceAlt, fg: color.ink[600] },
];

export function QuickActions({ onPick }: QuickActionsProps) {
  return (
    <View style={styles.grid}>
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        return (
          <Pressable
            key={a.key}
            onPress={() => onPick(a.key)}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <View style={[styles.iconWrap, { backgroundColor: a.bg }]}>
              <Icon size={20} color={a.fg} />
            </View>
            <AppText size="body" weight="semibold" color="text" numberOfLines={1}>
              {a.label}
            </AppText>
            <AppText size="small" color="muted" numberOfLines={1}>
              {a.sub}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 4,
  },
  tile: {
    width: '47%',
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    gap: 4,
  },
  pressed: {
    backgroundColor: palette.surfaceAlt,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});