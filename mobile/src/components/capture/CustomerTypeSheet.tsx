import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, Tag } from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { Sheet } from '../ui/Sheet';
import type { CustomerType } from '@/api/types';
import { CUSTOMER_TYPES, customerTypeLabel } from '@/constants/customers';
import { color, radii, spacing } from '@/constants/theme';

interface CustomerTypeSheetProps {
  visible: boolean;
  value: CustomerType | null;
  onSelect: (type: CustomerType) => void;
  onClose: () => void;
}

export function CustomerTypeSheet({ visible, value, onSelect, onClose }: CustomerTypeSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Type de client"
      subtitle="Catégorie commerciale (descriptive)"
      icon={<Tag size={22} color={color.brand[600]} />}>
      <View style={{ gap: 6 }}>
        {CUSTOMER_TYPES.map((t) => {
          const selected = value === t;
          return (
            <Pressable
              key={t}
              onPress={() => {
                onSelect(t);
                onClose();
              }}
              style={[styles.row, selected && styles.rowSelected]}
              accessibilityRole="button">
              <View style={{ flex: 1, gap: 1 }}>
                <AppText size="body" weight={selected ? 'bold' : 'semibold'} color={selected ? 'brand' : 'text'}>
                  {customerTypeLabel(t)}
                </AppText>
              </View>
              {selected ? <Check size={18} color={color.brand[600]} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
  },
  rowSelected: {
    backgroundColor: color.brand[50],
    borderWidth: 1,
    borderColor: color.brand[200],
  },
});