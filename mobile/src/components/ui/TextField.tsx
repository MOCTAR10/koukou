import React, { useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { fontFamily, palette, radii, semantic } from '@/constants/theme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  style?: StyleProp<ViewStyle>;
}

/** Shared single-line input: hairline border, brand ring on focus, Inter text. */
export function TextField({ style, onFocus, onBlur, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, focused && styles.wrapFocused, style]}>
      <TextInput
        placeholderTextColor={palette.ink[400]}
        {...rest}
        style={styles.input}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1.5,
    borderColor: semantic.border,
    borderRadius: radii.md,
    backgroundColor: semantic.surface,
  },
  wrapFocused: {
    borderColor: palette.brand[500],
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: fontFamily.regular,
    color: semantic.text,
  },
});
