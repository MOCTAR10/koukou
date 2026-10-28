import React, { useState } from 'react';
import { TextInput, View, StyleSheet, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';

import { AppText } from './AppText';
import { color, radii, fontFamily, semantic } from '@/constants/theme';

interface NumberInputProps {
  value: string;
  onChangeText: (text: string) => void;
  suffix?: string;
  placeholder?: string;
  /** Allow decimal separator (replaces ',' with '.'). Default false = integer only. */
  decimal?: boolean;
  maxLength?: number;
  editable?: boolean;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

function sanitize(raw: string, decimal: boolean): string {
  if (decimal) {
    const s = raw.replace(',', '.').replace(/[^0-9.]/g, '');
    const dot = s.indexOf('.');
    if (dot === -1) return s;
    return s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  }
  return raw.replace(/\D/g, '');
}

function numericOf(text: string): number {
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : 0;
}

export function NumberInput({
  value,
  onChangeText,
  suffix,
  placeholder = '0',
  decimal = false,
  maxLength,
  editable = true,
  autoFocus = false,
  style,
  inputStyle,
}: NumberInputProps) {
  // Parents often store the parsed number and pass back String(n), which
  // drops an in-progress "2." (typing "2,5" became 25). Keep the raw draft
  // while it still denotes the same number as `value`.
  const [draft, setDraft] = useState(value);
  const shown = numericOf(draft) === numericOf(value) ? draft : value;
  return (
    <View style={[styles.wrap, style]}>
      <TextInput
        value={shown}
        onChangeText={(t) => {
          const clean = sanitize(t, decimal);
          setDraft(clean);
          onChangeText(clean);
        }}
        placeholder={placeholder}
        placeholderTextColor={color.ink[300]}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        maxLength={maxLength}
        editable={editable}
        autoFocus={autoFocus}
        selectTextOnFocus
        style={[styles.input, inputStyle]}
      />
      {suffix ? (
        <AppText size="body" weight="semibold" color="muted" style={styles.suffix}>
          {suffix}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radii.md,
    backgroundColor: semantic.surface,
    paddingHorizontal: 12,
  },
  input: {
    fontFamily: fontFamily.regular,
    flex: 1,
    fontSize: 16,
    color: color.ink[900],
    paddingVertical: 10,
  },
  suffix: {
    marginLeft: 6,
  },
});
