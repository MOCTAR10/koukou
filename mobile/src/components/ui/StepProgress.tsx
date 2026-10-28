import React from 'react';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';

import { AppText } from './AppText';
import { color, palette, semantic } from '@/constants/theme';

export interface StepDef {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface StepProgressProps {
  steps: StepDef[];
  activeIndex: number;
  /** completed[i] = true → vignette verte ✓ (sautable quand onSelect fourni). */
  completed: boolean[];
  onSelect?: (index: number) => void;
}

export function StepProgress({ steps, activeIndex, completed, onSelect }: StepProgressProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {steps.map((s, i) => {
        const done = completed[i] ?? false;
        const active = i === activeIndex;
        const canTap = !!onSelect && done;

        const circleBg = done ? palette.green[500] : active ? palette.accent[500] : semantic.surfaceAlt;
        const circleBorder = done ? palette.green[600] : active ? palette.accent[600] : color.border;

        return (
          <React.Fragment key={s.key}>
            {i > 0 ? <View style={[styles.line, done && styles.lineActive]} /> : null}
            <Pressable
              onPress={() => {
                if (canTap) onSelect(i);
              }}
              disabled={!canTap}
              style={styles.step}
              accessibilityRole="button"
              accessibilityLabel={s.label}>
              <View style={[styles.circle, { backgroundColor: circleBg, borderColor: circleBorder }]}>
                {done ? <Check size={15} color={semantic.surface} strokeWidth={3} /> : s.icon ?? null}
                {!done && !s.icon ? (
                  <AppText size="small" weight="bold" style={{ color: active ? semantic.surface : color.ink[500] }}>
                    {i + 1}
                  </AppText>
                ) : null}
              </View>
              <AppText
                size="small"
                weight={active ? 'bold' : 'medium'}
                color={active ? 'accent' : done ? 'muted' : 'faint'}
                numberOfLines={2}
                style={styles.label}>
                {s.label}
              </AppText>
            </Pressable>
          </React.Fragment>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: 4,
  },
  step: {
    alignItems: 'center',
    width: 76,
    gap: 4,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    width: 16,
    height: 2,
    backgroundColor: color.border,
    marginTop: 15,
  },
  lineActive: {
    backgroundColor: palette.green[400],
  },
  label: {
    textAlign: 'center',
    fontSize: 10.5,
    lineHeight: 12.5,
  },
});