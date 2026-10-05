import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { palette, radii } from '@/constants/theme';

interface EmptyStateProps {
  emoji: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ emoji, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.emojiCircle}>
        <AppText style={styles.emoji}>{emoji}</AppText>
      </View>
      <AppText size="body" weight="semibold" color="text" style={styles.title}>
        {title}
      </AppText>
      {description ? (
        <AppText size="caption" color="muted" style={styles.desc}>
          {description}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} tone="brand" size="md" onPress={onAction} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
  },
  emojiCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emoji: {
    fontSize: 32,
  },
  title: {
    textAlign: 'center',
  },
  desc: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
