// Play / pause row of one voice note (local draft or a note stored on the
// server), with its duration and a progress bar. The audio source is resolved
// lazily: a stored note is downloaded (Authorization header) on first play.
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { healthAudioSource, type HealthAudioView } from '@/api/poufa';
import { palette, radii, semantic } from '@/constants/theme';
import { formatDuration, playbackProgress } from '@/poufa/voice-note';
import { fetchAudioToCache } from '@/voice/audio-cache';

interface RowProps {
  label: string;
  durationMs: number | null;
  /** Local file URI of the note (downloads it first when it is stored on the server). */
  getUri: () => Promise<string>;
  /** Bigger touch targets for the simple mode. */
  large?: boolean;
  /** Extra controls on the right (delete, re-record…). */
  actions?: React.ReactNode;
}

export function VoiceNotePlayerRow({ label, durationMs, getUri, large, actions }: RowProps) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const loaded = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setError(null);
    if (status.playing) {
      player.pause();
      return;
    }
    try {
      if (!loaded.current) {
        setLoading(true);
        const uri = await getUri();
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
        player.replace({ uri });
        loaded.current = true;
      } else if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05)) {
        await player.seekTo(0);
      }
      player.play();
    } catch (e) {
      setError(
        e instanceof Error && e.message.startsWith('L’écoute')
          ? e.message
          : 'Note vocale indisponible : vérifiez la connexion et réessayez.',
      );
    } finally {
      setLoading(false);
    }
  };

  const totalSec = status.duration > 0 ? status.duration : (durationMs ?? 0) / 1000;
  const progress = playbackProgress(status.currentTime, totalSec);
  const size = large ? 72 : 44;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={() => void toggle()}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? `Mettre en pause : ${label}` : `Écouter : ${label}`}
          style={[styles.playBtn, { width: size, height: size, borderRadius: size / 2 }, loading && styles.dim]}>
          {status.playing ? (
            <Pause size={size * 0.45} color={semantic.surface} strokeWidth={2.6} />
          ) : (
            <Play size={size * 0.45} color={semantic.surface} strokeWidth={2.6} />
          )}
        </Pressable>
        <View style={styles.mid}>
          <AppText size={large ? 'bodyM' : 'small'} weight="semibold" color="text" numberOfLines={1}>
            {label}
          </AppText>
          <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <AppText size="caption" color="muted">
            {loading
              ? 'Chargement…'
              : `${formatDuration(status.currentTime * 1000)} / ${formatDuration(totalSec * 1000)}`}
          </AppText>
        </View>
        {actions}
      </View>
      {error ? (
        <AppText size="small" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

/** A note stored on the server: listed under a declaration, downloaded on first play. */
export function StoredVoiceNote({
  farmId,
  batchId,
  eventId,
  audio,
  index,
}: {
  farmId: string;
  batchId: string;
  eventId: string;
  audio: HealthAudioView;
  index: number;
}) {
  return (
    <VoiceNotePlayerRow
      label={`Note vocale ${index + 1}`}
      durationMs={audio.durationMs}
      getUri={() => fetchAudioToCache(healthAudioSource(farmId, batchId, eventId, audio.id), audio.id)}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn: { backgroundColor: palette.brand[600], alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.6 },
  mid: { flex: 1, gap: 4 },
  track: { height: 6, borderRadius: radii.pill, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: palette.brand[600] },
});
