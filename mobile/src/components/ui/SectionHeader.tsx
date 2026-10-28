import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { AppText } from './AppText';
import { semantic } from '@/constants/theme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
}

export function SectionHeader({ title, subtitle, right, icon: Icon, iconColor, iconBg }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textWrap}>
        <View style={styles.titleRow}>
          {Icon ? (
            <View style={[styles.iconChip, { backgroundColor: iconBg ?? semantic.primarySoft }]}>
              <Icon size={18} color={iconColor ?? semantic.primary} strokeWidth={2.4} />
            </View>
          ) : null}
          <AppText size="h3" weight="bold">
            {title}
          </AppText>
        </View>
        {subtitle ? (
          <AppText size="caption" color="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 6,
  },
  textWrap: {
    gap: 3,
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconChip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.primarySoft,
  },
});