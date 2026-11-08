import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Info } from 'lucide-react-native';

import { Sheet } from './ui/Sheet';
import { AppText } from './ui/AppText';
import { GLOSSARY, type GlossaryKey } from '@/poufa/glossary';
import { radii, semantic } from '@/constants/theme';

interface GlossaryLinkProps {
  keys: GlossaryKey[];
  label?: string;
}

/** Lien « Définitions » : ouvre les définitions françaises des indicateurs donnés. */
export function GlossaryLink({ keys, label = 'Définitions des indicateurs' }: GlossaryLinkProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label} style={styles.link} hitSlop={8}>
        <Info size={14} color={semantic.primary} />
        <AppText size="small" weight="semibold" color="brand">{label}</AppText>
      </Pressable>
      <Sheet visible={open} title="Comprendre les indicateurs" subtitle="" onClose={() => setOpen(false)}>
        {keys.map((k) => {
          const e = GLOSSARY[k];
          return (
            <View key={k} style={styles.card}>
              <AppText size="body" weight="bold" color="ink">{e.term}</AppText>
              <AppText size="small" color="muted">{e.definition}</AppText>
              {e.formula ? <AppText size="small" weight="semibold" color="brand">Formule : {e.formula}</AppText> : null}
              {e.note ? <AppText size="caption" color="faint">{e.note}</AppText> : null}
            </View>
          );
        })}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  card: { backgroundColor: semantic.surface, borderRadius: radii.md, padding: 10, gap: 4 },
});
