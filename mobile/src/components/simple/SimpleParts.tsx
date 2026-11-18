// Building blocks shared by the full-screen steps of the SIMPLE experience:
// the screen frame (back, connection state, speaker), the big keypad, the
// green validate button and the full-screen green / red result screens.
import React, { createContext, useContext, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Delete, Minus, Plus } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { ConnectionPill } from '@/components/ui/ConnectionStrip';
import { palette, radii, semantic } from '@/constants/theme';
import { useScreen } from '@/theme/useScreen';
import { onBehalfBanner } from '@/poufa/delegated-entry';
import { useAnnounce } from '@/voice/useAnnounce';
import { CheckPicto, WarningPicto } from './pictos/Pictos';
import { SpeakButton } from './SpeakButton';
import { KEYPAD_MAX, pressKey, stepValue, type KeypadKey } from './simple-logic';

/** Touch targets of the simple experience are never below this (dp). */
export const TOUCH = 64;

/** Safe-area insets that stay right inside a Modal (live inset can read 0 there). */
export function useSafeInsets() {
  const insets = useSafeAreaInsets();
  return {
    top: Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0),
    bottom: Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0, 8),
  };
}

/**
 * Delegated entry (jury lot 5): the farm a technical agent enters for. Set by
 * `SimpleFlowModal`; every step and result screen then shows the permanent
 * « Vous saisissez pour le compte de … » banner. null = the farmer's own flows.
 */
export const DelegationContext = createContext<{ farmName: string } | null>(null);

export function useDelegation() {
  return useContext(DelegationContext);
}

/** Permanent, unmissable banner of the delegated flows. */
export function OnBehalfBanner({ farmName }: { farmName: string }) {
  return (
    <View style={styles.onBehalf} accessibilityRole="alert">
      <AppText size="bodyM" weight="bold" align="center" color={palette.amber[900]}>
        {onBehalfBanner(farmName)}
      </AppText>
    </View>
  );
}

interface StepScreenProps {
  /** Pictogram of the question. */
  picto: React.ReactNode;
  /** The instruction: shown big AND read aloud. */
  sentence: string;
  onBack: () => void;
  children?: React.ReactNode;
  /** Pinned under the content (the validate button). */
  footer?: React.ReactNode;
  /** Read the sentence when the screen appears (default true). */
  speakOnShow?: boolean;
}

/** One question per screen: back, connection pill, speaker, pictogram, sentence, answer area, validate. */
export function StepScreen({ picto, sentence, onBack, children, footer, speakOnShow = true }: StepScreenProps) {
  const insets = useSafeInsets();
  const { isShort, gutter } = useScreen();
  const delegation = useDelegation();
  useAnnounce(sentence, speakOnShow);
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {delegation ? <OnBehalfBanner farmName={delegation.farmName} /> : null}
      <View style={[styles.topRow, { paddingHorizontal: gutter }]}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={6}
          style={({ pressed }) => [styles.roundBtn, pressed && styles.roundBtnPressed]}>
          <ArrowLeft size={30} color={semantic.text} strokeWidth={2.6} />
        </Pressable>
        <ConnectionPill />
        <SpeakButton text={sentence} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingHorizontal: gutter, gap: isShort ? 10 : 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {picto}
        <AppText size="h1" weight="bold" align="center" style={styles.sentence}>
          {sentence}
        </AppText>
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom, paddingHorizontal: gutter }]}>{footer}</View> : null}
    </View>
  );
}

/** Big green validate button with the check pictogram. */
export function ValidateButton({ onPress, disabled, label = 'Valider' }: { onPress: () => void; disabled?: boolean; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.validate, pressed && styles.validatePressed, disabled && styles.validateDisabled]}>
      <CheckPicto size={44} tone="white" />
      <AppText size="h2" weight="bold" color={semantic.surface}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Key({ label, onPress, accessibilityLabel, children, tone = 'plain' }: {
  label?: string;
  onPress: () => void;
  accessibilityLabel: string;
  children?: React.ReactNode;
  tone?: 'plain' | 'soft';
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.key, tone === 'soft' && styles.keySoft, pressed && styles.keyPressed]}>
      {children ?? (
        <AppText size="h1" weight="bold">
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const KEY_ROWS: KeypadKey[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  ['clear', 0, 'back'],
];

interface BigKeypadProps {
  value: number;
  onChange: (next: number) => void;
  /** Unit shown next to the number (« sacs », « L »…). */
  unit?: string;
  max?: number;
  /** Amount of the − / + buttons (default 1). */
  step?: number;
}

/** Huge number: value between − and +, then a 3 x 4 keypad. */
export function BigKeypad({ value, onChange, unit, max = KEYPAD_MAX, step = 1 }: BigKeypadProps) {
  return (
    <View style={styles.pad}>
      <View style={styles.valueRow}>
        <Pressable
          onPress={() => onChange(stepValue(value, -step, max))}
          accessibilityRole="button"
          accessibilityLabel="Moins"
          style={({ pressed }) => [styles.stepBtn, pressed && styles.keyPressed]}>
          <Minus size={34} color={semantic.text} strokeWidth={3} />
        </Pressable>
        <View style={styles.valueBox} accessibilityRole="text" accessibilityLabel={`${value}${unit ? ` ${unit}` : ''}`}>
          <AppText size="display" weight="bold" align="center" style={styles.valueText} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.5}>
            {value}
          </AppText>
          {unit ? (
            <AppText size="h3" weight="semibold" color="muted" align="center">
              {unit}
            </AppText>
          ) : null}
        </View>
        <Pressable
          onPress={() => onChange(stepValue(value, step, max))}
          accessibilityRole="button"
          accessibilityLabel="Plus"
          style={({ pressed }) => [styles.stepBtn, pressed && styles.keyPressed]}>
          <Plus size={34} color={semantic.text} strokeWidth={3} />
        </Pressable>
      </View>
      {KEY_ROWS.map((row, i) => (
        <View key={i} style={styles.keyRow}>
          {row.map((k) => {
            if (k === 'back') {
              return (
                <Key key={k} tone="soft" onPress={() => onChange(pressKey(value, 'back', max))} accessibilityLabel="Effacer le dernier chiffre">
                  <Delete size={30} color={semantic.text} strokeWidth={2.4} />
                </Key>
              );
            }
            if (k === 'clear') {
              return (
                <Key key={k} tone="soft" onPress={() => onChange(0)} accessibilityLabel="Remettre à zéro" label="C" />
              );
            }
            return <Key key={k} label={String(k)} accessibilityLabel={String(k)} onPress={() => onChange(pressKey(value, k, max))} />;
          })}
        </View>
      ))}
    </View>
  );
}

interface ResultProps {
  kind: 'success' | 'error';
  /** Shown big and read aloud. */
  message: string;
  /** Smaller second line (offline reassurance), also read aloud. */
  detail?: string;
  /** Success: leave (auto after a moment, or on tap). Error: go back and correct. */
  onContinue: () => void;
}

const SUCCESS_MS = 2200;

/** Full-screen green « C'est enregistré » or red problem screen. */
export function ResultScreen({ kind, message, detail, onContinue }: ResultProps) {
  const insets = useSafeInsets();
  const ok = kind === 'success';
  const delegation = useDelegation();
  useAnnounce(detail ? `${message} ${detail}` : message);
  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(onContinue, SUCCESS_MS);
    return () => clearTimeout(t);
  }, [ok, onContinue]);
  return (
    <Pressable
      onPress={onContinue}
      accessibilityRole="button"
      accessibilityLabel={ok ? 'Terminé, revenir à l’accueil' : 'Corriger'}
      style={[styles.result, { backgroundColor: ok ? palette.green[600] : palette.red[600], paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      {delegation ? (
        <AppText size="bodyM" weight="bold" align="center" color={semantic.surface}>
          {onBehalfBanner(delegation.farmName)}
        </AppText>
      ) : null}
      {ok ? <CheckPicto size={170} tone="white" /> : <WarningPicto size={150} />}
      <AppText size="display" weight="bold" align="center" color={semantic.surface} style={styles.resultTitle}>
        {message}
      </AppText>
      {detail ? (
        <AppText size="h3" weight="semibold" align="center" color={semantic.surface}>
          {detail}
        </AppText>
      ) : null}
      {!ok ? (
        <View style={styles.fixBtn}>
          <AppText size="h2" weight="bold" color={palette.red[700]}>
            Corriger
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.bg },
  onBehalf: {
    marginHorizontal: 12,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    backgroundColor: palette.amber[100],
    borderWidth: 2,
    borderColor: palette.amber[500],
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 8 },
  roundBtn: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: TOUCH / 2,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtnPressed: { backgroundColor: semantic.surfaceAlt },
  body: { alignItems: 'center', paddingTop: 8, paddingBottom: 24 },
  sentence: { maxWidth: 520 },
  footer: { paddingTop: 10, backgroundColor: semantic.bg },
  validate: {
    minHeight: 80,
    borderRadius: radii.xl,
    backgroundColor: palette.green[600],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  validatePressed: { backgroundColor: palette.green[700] },
  validateDisabled: { opacity: 0.45 },
  pad: { width: '100%', maxWidth: 420, gap: 10 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 76,
    height: 76,
    borderRadius: radii.xl,
    backgroundColor: semantic.surfaceAlt,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueBox: {
    flex: 1,
    minHeight: 96,
    borderRadius: radii.xl,
    backgroundColor: semantic.surface,
    borderWidth: 2,
    borderColor: palette.brand[300],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  valueText: { fontSize: 64, lineHeight: 72 },
  keyRow: { flexDirection: 'row', gap: 10 },
  key: {
    flex: 1,
    minHeight: TOUCH,
    height: 68,
    borderRadius: radii.lg,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySoft: { backgroundColor: semantic.surfaceAlt },
  keyPressed: { backgroundColor: palette.brand[100] },
  result: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 24 },
  resultTitle: { fontSize: 40, lineHeight: 46 },
  fixBtn: {
    marginTop: 12,
    minHeight: 80,
    minWidth: 240,
    borderRadius: radii.xl,
    backgroundColor: semantic.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
});
