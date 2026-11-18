// Voice note recorder of the sanitary declaration. Many farmers cannot read or
// write: they press the microphone, talk, press again; the veterinary
// services listen to the note. Mono 16 kHz AAC 32 kbit/s in `.m4a`: 120 s
// weigh about 480 KB (limit 3 MiB). The note stays a local draft until the
// declaration is queued (offline/audio-files copies it then).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { Mic, RotateCcw, Square, Trash2 } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { audioFileSize } from '@/offline/audio-files';
import { palette, radii, semantic } from '@/constants/theme';
import {
  MAX_VOICE_NOTES,
  MAX_VOICE_NOTE_MS,
  VOICE_NOTE_BITRATE,
  VOICE_NOTE_SAMPLE_RATE,
  formatDuration,
  voiceNoteRefusal,
  voiceNoteSlotsLeft,
  type VoiceNoteDraft,
} from '@/poufa/voice-note';
import { stopSpeaking } from '@/voice/speak';
import { VoiceNotePlayerRow } from './VoiceNotePlayer';

const MIN_NOTE_MS = 600;

/** Speech profile: mono, 16 kHz, 32 kbit/s AAC in MPEG-4 (`.m4a`). */
const RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: VOICE_NOTE_SAMPLE_RATE,
  numberOfChannels: 1,
  bitRate: VOICE_NOTE_BITRATE,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: VOICE_NOTE_BITRATE },
};

interface Props {
  notes: VoiceNoteDraft[];
  onChange: (notes: VoiceNoteDraft[]) => void;
  /** Notes allowed (1 in the simple flow, 2 in the full form). */
  max?: number;
  /** Huge button for the simple mode, small row for the form. */
  variant?: 'large' | 'compact';
  disabled?: boolean;
}

type Phase = 'idle' | 'starting' | 'recording';

export function VoiceNoteRecorder({ notes, onChange, max = MAX_VOICE_NOTES, variant = 'large', disabled }: Props) {
  const large = variant === 'large';
  const recorderRef = useRef<AudioRecorder | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const notesRef = useRef(notes);
  const onChangeRef = useRef(onChange);
  notesRef.current = notes;
  onChangeRef.current = onChange;
  const [phase, setPhaseState] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  // Declared before the recorder hook so that, on unmount, the recording is
  // stopped before the hook releases the native recorder.
  const stopRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    return () => {
      if (phaseRef.current === 'recording') void stopRef.current();
    };
  }, []);

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  recorderRef.current = recorder;
  const state = useAudioRecorderState(recorder, 250);

  const stop = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || phaseRef.current !== 'recording') return;
    setPhase('idle');
    let durationMs = 0;
    try {
      durationMs = Math.round(rec.getStatus().durationMillis);
    } catch {
      // Status unavailable: the duration stays unknown (0).
    }
    try {
      await rec.stop();
    } catch {
      // Already stopped by the system: what was recorded is still read below.
    }
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      // Playback mode is set again before each play.
    }
    const uri = rec.uri;
    if (!uri) {
      setMessage('L’enregistrement a échoué. Recommencez.');
      return;
    }
    if (durationMs > 0 && durationMs < MIN_NOTE_MS) {
      setMessage('C’est trop court. Appuyez sur le micro et parlez.');
      return;
    }
    const sizeBytes = audioFileSize(uri);
    if (sizeBytes === 0) {
      setMessage('L’enregistrement a échoué. Recommencez.');
      return;
    }
    const draft: VoiceNoteDraft = { uri, durationMs: Math.min(durationMs, MAX_VOICE_NOTE_MS), ...(sizeBytes != null ? { sizeBytes } : {}) };
    const refusal = voiceNoteRefusal(draft, notesRef.current.length);
    if (refusal) {
      setMessage(refusal);
      return;
    }
    setMessage(null);
    onChangeRef.current([...notesRef.current, draft]);
  }, [setPhase]);
  stopRef.current = stop;

  const start = async (replacing = false) => {
    if (phaseRef.current !== 'idle' || disabled) return;
    // `replacing`: the note being redone was just removed (props not updated yet).
    if (!replacing && voiceNoteSlotsLeft(notesRef.current.length, max) === 0) return;
    setMessage(null);
    setPhase('starting');
    // The phone must not record its own spoken instruction.
    stopSpeaking();
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setDenied(true);
        setPhase('idle');
        return;
      }
      setDenied(false);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch {
      setPhase('idle');
      setMessage('Le micro ne répond pas. Recommencez.');
    }
  };

  // Hard stop at 120 s.
  useEffect(() => {
    if (phase === 'recording' && state.durationMillis >= MAX_VOICE_NOTE_MS) void stop();
  }, [phase, state.durationMillis, stop]);

  // Interruption (app sent to the background, call…): stop and keep the note.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && phaseRef.current === 'recording') void stopRef.current();
    });
    return () => sub.remove();
  }, []);

  // Red pulse while recording.
  const pulse = useRef(new Animated.Value(1)).current;
  const recordingNow = phase === 'recording';
  useEffect(() => {
    if (!recordingNow) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [recordingNow, pulse]);

  if (Platform.OS === 'web') {
    return (
      <AppText size="small" color="muted">
        Les notes vocales s’enregistrent depuis l’application Android ou iOS.
      </AppText>
    );
  }

  const recording = phase === 'recording';
  const canRecord = voiceNoteSlotsLeft(notes.length, max) > 0;
  const seconds = formatDuration(state.durationMillis);
  const remove = (i: number) => onChange(notes.filter((_, j) => j !== i));
  const redo = (i: number) => {
    remove(i);
    void start(true);
  };

  return (
    <View style={[styles.wrap, large && styles.wrapLarge]}>
      {notes.map((n, i) => (
        <View key={`${n.uri}-${i}`} style={[styles.card, large && styles.cardLarge]}>
          <VoiceNotePlayerRow
            label={notes.length > 1 ? `Note vocale ${i + 1}` : 'Votre message'}
            durationMs={n.durationMs}
            getUri={() => Promise.resolve(n.uri)}
            large={large}
            actions={
              <View style={styles.cardActions}>
                {large && max === 1 ? (
                  <Pressable
                    onPress={() => redo(i)}
                    disabled={disabled || recording}
                    accessibilityRole="button"
                    accessibilityLabel="Refaire le message"
                    style={[styles.smallBtn, styles.smallBtnLarge]}>
                    <RotateCcw size={28} color={palette.brand[700]} strokeWidth={2.4} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => remove(i)}
                  disabled={disabled || recording}
                  accessibilityRole="button"
                  accessibilityLabel="Supprimer le message"
                  style={[styles.smallBtn, large && styles.smallBtnLarge, styles.smallBtnDanger]}>
                  <Trash2 size={large ? 28 : 18} color={palette.red[600]} strokeWidth={2.4} />
                </Pressable>
              </View>
            }
          />
        </View>
      ))}

      {recording || canRecord ? (
        <View style={styles.micWrap}>
          <Animated.View style={{ transform: [{ scale: pulse }], alignSelf: large ? 'center' : 'flex-start' }}>
          <Pressable
            onPress={() => void (recording ? stop() : start())}
            disabled={disabled || phase === 'starting'}
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Arrêter l’enregistrement' : 'Enregistrer un message vocal'}
            style={({ pressed }) => [
              large ? styles.micLarge : styles.micCompact,
              recording && styles.micRecording,
              pressed && styles.micPressed,
              (disabled || phase === 'starting') && styles.micDisabled,
            ]}>
            {recording ? (
              <Square size={large ? 56 : 22} color={semantic.surface} fill={semantic.surface} strokeWidth={2} />
            ) : (
              <Mic size={large ? 84 : 22} color={semantic.surface} strokeWidth={2.2} />
            )}
            {!large ? (
              <AppText size="label" weight="semibold" color={semantic.surface}>
                {recording ? `Arrêter · ${seconds}` : notes.length > 0 ? 'Ajouter une note' : 'Note vocale'}
              </AppText>
            ) : null}
          </Pressable>
          </Animated.View>
          {recording && large ? (
            <View style={styles.recLabel}>
              <View style={styles.recDot} />
              <AppText size="h2" weight="bold" color={palette.red[600]}>
                {seconds}
              </AppText>
            </View>
          ) : null}
          {recording && large ? (
            <AppText size="bodyM" weight="semibold" color="muted" align="center">
              Parlez. Touchez le carré pour finir.
            </AppText>
          ) : null}
        </View>
      ) : null}

      {denied ? (
        <View style={styles.notice}>
          <AppText size={large ? 'bodyM' : 'small'} weight="semibold" color="danger" align={large ? 'center' : 'left'}>
            Le micro est refusé. Pour enregistrer un message, autorisez le micro dans les réglages du téléphone.
          </AppText>
          <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button" accessibilityLabel="Ouvrir les réglages du téléphone" style={styles.settingsBtn}>
            <AppText size="label" weight="bold" color={semantic.surface}>
              Ouvrir les réglages
            </AppText>
          </Pressable>
        </View>
      ) : null}
      {message ? (
        <AppText size={large ? 'bodyM' : 'small'} weight="semibold" color="danger" align={large ? 'center' : 'left'}>
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  wrapLarge: { alignItems: 'center', gap: 16, width: '100%' },
  card: {
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  cardLarge: { padding: 16, borderRadius: radii.xl, borderWidth: 2, borderColor: semantic.borderStrong, width: '100%', maxWidth: 520 },
  cardActions: { flexDirection: 'row', gap: 8 },
  smallBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.surfaceAlt },
  smallBtnLarge: { width: 64, height: 64, borderRadius: 32 },
  smallBtnDanger: { backgroundColor: palette.red[50] },
  micWrap: { alignItems: 'center', gap: 10 },
  micLarge: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: palette.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  micCompact: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: palette.brand[600],
  },
  micRecording: { backgroundColor: palette.red[500] },
  micPressed: { opacity: 0.85 },
  micDisabled: { opacity: 0.6 },
  recLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: palette.red[500] },
  notice: { gap: 8, alignItems: 'center' },
  settingsBtn: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: radii.pill,
    backgroundColor: palette.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
