import React, { forwardRef } from 'react';
import { TextInput as RNTextInput, type TextInputProps } from 'react-native';

import { MAX_FONT_SCALE } from '@/constants/textScale';

/**
 * TextInput de l'app : identique à celui de React Native, avec le plafond de
 * taille de police (React Native 0.81 + React 19 n'offrent plus de moyen global
 * fiable : `defaultProps` est ignoré et `Text`/`TextInput` ne sont plus des
 * objets `forwardRef`). Un écran peut toujours passer sa propre valeur.
 */
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  return <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} ref={ref} />;
});
export type TextInput = RNTextInput;
