import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { RefreshCw } from 'lucide-react-native';

import { AppText } from './ui/AppText';
import { color, palette, radii } from '@/constants/theme';
import type { SyncStatus } from '@/api/types';

export function TrustBar({ status, onRefresh }: { status: SyncStatus; onRefresh?: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.pill}>
        <View style={[styles.dot, { backgroundColor: status.online ? palette.green[600] : palette.amber[500] }]} />
        <AppText size="small" color="muted">
          {status.online ? 'En ligne' : 'Hors-ligne'}
        </AppText>
      </View>
      <View style={styles.pill}>
        <AppText size="small" color="muted">
          il y a {status.freshSince}
        </AppText>
      </View>
      <View style={[styles.pill, status.pending > 0 && styles.pendingPill]}>
        <AppText size="small" color={status.pending > 0 ? 'accent' : 'muted'} weight={status.pending > 0 ? 'semibold' : 'regular'}>
          {status.pending > 0 ? `${status.pending} en attente` : 'synchronisé'}
        </AppText>
      </View>
      <Pressable accessibilityLabel="Actualiser" onPress={onRefresh} hitSlop={10} style={styles.refresh} accessibilityRole="button">
        <RefreshCw size={15} color={color.brand[600]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: color.surfaceAlt,
  },
  pendingPill: {
    backgroundColor: color.accent[50],
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  refresh: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
});