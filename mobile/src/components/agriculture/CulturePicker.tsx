import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';
import { Check, ChevronDown, Sprout } from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { enter, staggeredEnter } from '@/constants/motion';
import type { CropCategory, Culture } from '@/api/types';
import {
  CROP_CATEGORY_LABELS,
  CULTURE_EMOJI,
  groupCulturesByCategory,
} from '@/constants/agriculture';
import { color, palette, radii } from '@/constants/theme';

interface CulturePickerProps {
  cultures: Culture[];
  value: Culture | null;
  /** Sélection (null = catégorie changée → culture à re-choisir). */
  onSelect: (c: Culture | null) => void;
}

/**
 * Sélecteur culture par cascade : on choisit d'abord la catégorie,
 * puis la culture souhaitée dans cette catégorie.
 */
export function CulturePicker({ cultures, value, onSelect }: CulturePickerProps) {
  const groups = useMemo(() => groupCulturesByCategory(cultures), [cultures]);
  const [category, setCategory] = useState<CropCategory | null>(value?.category ?? null);
  const [openPanel, setOpenPanel] = useState<'category' | 'culture' | null>(null);

  // Garde la catégorie en phase avec une sélection extérieure (édition).
  useEffect(() => {
    if (value) setCategory(value.category);
  }, [value]);

  const activeGroup = groups.find((g) => g.category === category);

  const pickCategory = (cat: CropCategory) => {
    Haptics.selectionAsync().catch(() => {});
    setCategory(cat);
    // Une culture d'une autre catégorie n'est plus valable : on la retire.
    if (value && value.category !== cat) onSelect(null);
    setOpenPanel(null);
  };

  const pickCulture = (c: Culture) => {
    Haptics.selectionAsync().catch(() => {});
    onSelect(c);
    setOpenPanel(null);
  };

  const toggle = (panel: 'category' | 'culture') => {
    Haptics.selectionAsync().catch(() => {});
    setOpenPanel((p) => (p === panel ? null : panel));
  };

  return (
    <View style={styles.wrap}>
      {/* ── 1. Catégorie ── */}
      <View style={styles.field}>
        <AppText size="label" weight="semibold" color="muted">Catégorie *</AppText>
        <Pressable
          onPress={() => {
            if (groups.length === 0) return;
            toggle('category');
          }}
          style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
          accessibilityRole="button"
          accessibilityState={{ expanded: openPanel === 'category' }}>
          {category ? (
            <View style={styles.triggerValue}>
              <AppText style={{ fontSize: 16 }}>{CULTURE_EMOJI[category]}</AppText>
              <View style={{ flex: 1 }}>
                <AppText size="small" weight="semibold" color="text" numberOfLines={1}>
                  {CROP_CATEGORY_LABELS[category]}
                </AppText>
                <AppText size="caption" color="muted">
                  {activeGroup?.cultures.length ?? 0} culture(s)
                </AppText>
              </View>
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Sprout size={15} color={color.ink[400]} />
              <AppText size="small" color="muted">
                {groups.length > 0 ? 'Choisir une catégorie…' : 'Chargement du référentiel…'}
              </AppText>
            </View>
          )}
          <ChevronDown size={16} color={color.ink[400]} strokeWidth={2.4} />
        </Pressable>

        {openPanel === 'category' ? (
          <Animated.View entering={enter.fadeDown()} style={styles.panel}>
            {groups.map((g, i) => {
              const active = g.category === category;
              return (
                <Animated.View key={g.category} entering={staggeredEnter(i, 35)}>
                  <Pressable
                    onPress={() => pickCategory(g.category)}
                    style={[styles.row, active && styles.rowActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}>
                    <AppText style={{ fontSize: 17 }}>{CULTURE_EMOJI[g.category]}</AppText>
                    <AppText
                      size="small"
                      weight={active ? 'bold' : 'semibold'}
                      color={active ? 'brand' : 'text'}
                      numberOfLines={1}
                      style={styles.rowName}>
                      {g.label}
                    </AppText>
                    <AppText size="caption" weight="bold" color="muted">{g.cultures.length}</AppText>
                    {active ? <Check size={16} color={palette.green[600]} strokeWidth={2.6} /> : null}
                  </Pressable>
                </Animated.View>
              );
            })}
          </Animated.View>
        ) : null}
      </View>

      {/* ── 2. Culture (dans la catégorie choisie) ── */}
      <View style={styles.field}>
        <AppText size="label" weight="semibold" color="muted">
          {category ? 'Culture *' : 'Culture'}
        </AppText>
        <Pressable
          onPress={() => {
            if (!category) return;
            toggle('culture');
          }}
          disabled={!category}
          style={({ pressed }) => [
            styles.trigger,
            !category && styles.triggerDisabled,
            pressed && category && styles.triggerPressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ expanded: openPanel === 'culture', disabled: !category }}>
          {value ? (
            <View style={styles.triggerValue}>
              <AppText style={{ fontSize: 16 }}>{CULTURE_EMOJI[value.category]}</AppText>
              <View style={{ flex: 1 }}>
                <AppText size="small" weight="semibold" color="text" numberOfLines={1}>
                  {value.name}
                </AppText>
                <AppText size="caption" color="muted">
                  {value.defaultCycleDays ? `Cycle ≈ ${value.defaultCycleDays} j` : 'Culture'}{' '}
                </AppText>
              </View>
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Sprout size={15} color={color.ink[400]} />
              <AppText size="small" color="muted">
                {category ? 'Choisir une culture…' : 'Choisissez d’abord la catégorie'}
              </AppText>
            </View>
          )}
          <ChevronDown size={16} color={color.ink[400]} strokeWidth={2.4} />
        </Pressable>

        {openPanel === 'culture' && activeGroup ? (
          <Animated.View entering={enter.fadeDown()} style={styles.panel}>
            {activeGroup.cultures.length === 0 ? (
              <View style={styles.empty}>
                <AppText size="caption" color="faint">Aucune culture dans cette catégorie</AppText>
              </View>
            ) : (
              activeGroup.cultures.map((c, i) => {
                const selected = value?.id === c.id;
                return (
                  <Animated.View key={c.id} entering={staggeredEnter(i, 35)}>
                    <Pressable
                      onPress={() => pickCulture(c)}
                      style={[styles.row, selected && styles.rowActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}>
                      <AppText style={{ fontSize: 17 }}>{CULTURE_EMOJI[c.category]}</AppText>
                      <AppText
                        size="small"
                        weight={selected ? 'bold' : 'medium'}
                        color={selected ? 'brand' : 'text'}
                        numberOfLines={1}
                        style={styles.rowName}>
                        {c.name}
                      </AppText>
                      <AppText size="caption" color="faint">
                        {c.defaultCycleDays ? `≈ ${c.defaultCycleDays} j` : 'libre'}
                      </AppText>
                      {selected ? <Check size={16} color={palette.green[600]} strokeWidth={2.6} /> : null}
                    </Pressable>
                  </Animated.View>
                );
              })
            )}
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  field: { gap: 6 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: color.surfaceAlt,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  triggerPressed: { opacity: 0.82 },
  triggerDisabled: { opacity: 0.55 },
  triggerValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },
  placeholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panel: {
    backgroundColor: color.surfaceAlt,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.border,
    padding: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.paper,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 4,
  },
  rowActive: {
    borderColor: palette.green[400],
    backgroundColor: color.green[50],
  },
  rowName: { flex: 1 },
  empty: {
    paddingVertical: 14,
    alignItems: 'center',
  },
});