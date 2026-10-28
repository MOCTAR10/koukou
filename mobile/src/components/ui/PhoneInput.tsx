import React, { forwardRef, useState, useEffect } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';

import { color, palette, fontFamily, semantic } from '@/constants/theme';
import { GABON_FLAG, GABON_PREFIX, isGabonPhoneValid, normalizeGabonPhone } from '@/constants/phone';

export interface PhoneInputProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType' | 'maxLength' | 'textContentType'> {
  value: string;
  onChangeText: (cleaned: string) => void;
  showValidation?: boolean;
  compact?: boolean;
}

export const PhoneInput = forwardRef<TextInput, PhoneInputProps>(
  function PhoneInput({ value, onChangeText, showValidation = true, compact = false, ...rest }, ref) {
    const valid = showValidation && isGabonPhoneValid(value);
    const [displayValue, setDisplayValue] = useState(value);

    useEffect(() => {
      // On blur or programmatic value change, normalize the value.
      setDisplayValue(normalizeGabonPhone(value));
    }, [value]);

    const handleChangeText = (text: string) => {
      // During typing, just pass through — normalize on blur to avoid cursor jump.
      setDisplayValue(text);
      onChangeText(normalizeGabonPhone(text));
    };

    return (
      <View style={[styles.field, compact ? styles.fieldCompact : null]}>
        <Text style={[styles.prefix, compact ? styles.prefixCompact : null]}>
          {GABON_FLAG} {GABON_PREFIX}
        </Text>
        <TextInput
          ref={ref}
          style={[styles.input, compact ? styles.inputCompact : null]}
          value={displayValue}
          onChangeText={handleChangeText}
          placeholder="Téléphone"
          placeholderTextColor={palette.ink[300]}
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="telephoneNumber"
          accessibilityLabel="Téléphone"
          blurOnSubmit={true}
          onSubmitEditing={rest.onSubmitEditing}
          {...rest}
        />
        {valid ? <CheckCircle2 size={compact ? 18 : 20} color={palette.green[600]} /> : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  field: {
    fontFamily: fontFamily.regular,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 52,
    borderRadius: 18,
    backgroundColor: semantic.surfaceAlt,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: color.border,
  },
  fieldCompact: {
    fontFamily: fontFamily.regular,
    height: 44,
    borderRadius: 14,
    gap: 10,
    paddingHorizontal: 14,
  },
  prefix: {
    fontSize: 15,
    fontFamily: fontFamily.semibold,
    color: palette.ink[400],
  },
  prefixCompact: {
    fontSize: 14,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: palette.ink[900],
    padding: 0,
  },
  inputCompact: {
    fontSize: 15,
  },
});