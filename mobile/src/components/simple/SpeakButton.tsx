import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Volume2 } from 'lucide-react-native';

import { palette, semantic } from '@/constants/theme';
import { speak } from '@/voice/speak';

/** Round speaker button: reads the screen's instruction aloud, whatever the voice setting. */
export function SpeakButton({ text, size = 64 }: { text: string; size?: number }) {
  return (
    <Pressable
      onPress={() => speak(text)}
      accessibilityRole="button"
      accessibilityLabel="Écouter la consigne"
      hitSlop={6}
      style={({ pressed }) => [styles.btn, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed]}>
      <Volume2 size={Math.round(size * 0.5)} color={semantic.surface} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: palette.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: palette.brand[800], transform: [{ scale: 0.96 }] },
});
