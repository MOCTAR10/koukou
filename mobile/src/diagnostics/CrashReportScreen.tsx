import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import * as SplashScreen from 'expo-splash-screen';

import { clearLastCrash, formatCrash, shareCrash, type CrashRecord } from './crash-log';
import { MAX_FONT_SCALE } from '@/constants/textScale';

/**
 * Shown instead of the app when the previous session ended on a fatal
 * JavaScript error. Core components only: it must render even if the crash
 * comes from a provider, a font or a native module of the app.
 */
export function CrashReportScreen({ crash, onContinue }: { crash: CrashRecord; onContinue: () => void }) {
  // The root layout keeps the native splash up until fonts load: hide it here.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={styles.root}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.title}>L’application s’est fermée la dernière fois</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.lead}>Partagez ce rapport avec l’équipe Fermia (WhatsApp, e-mail…), puis continuez.</Text>
      <ScrollView style={styles.box}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} selectable style={styles.mono}>{formatCrash(crash)}</Text>
      </ScrollView>
      <Pressable style={[styles.btn, styles.primary]} onPress={() => shareCrash(crash)}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.primaryText}>Partager le rapport</Text>
      </Pressable>
      <Pressable
        style={styles.btn}
        onPress={() => {
          clearLastCrash();
          onContinue();
        }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.btnText}>Continuer vers l’application</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 64, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: '700', color: '#0C2331' },
  lead: { marginTop: 8, fontSize: 15, color: '#3A4A55' },
  box: { flex: 1, marginTop: 16, padding: 12, borderRadius: 8, backgroundColor: '#F2F4F5' },
  mono: { fontFamily: 'monospace', fontSize: 12, color: '#0C2331' },
  btn: { marginTop: 12, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#C9D1D6' },
  btnText: { fontSize: 16, color: '#0C2331', fontWeight: '600' },
  primary: { backgroundColor: '#0C2331', borderColor: '#0C2331' },
  primaryText: { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
});
