// « Problème » of the SIMPLE experience: tick what you see (cards of the
// programme's clinical-sign list), say how many birds are dead or sick, leave a
// voice note (optional), add photos, send. It goes through the existing sanitary declaration queue.
import React, { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Check, ImagePlus, Mic, X } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/auth/AuthContext';
import { invalidateFarmQueries } from '@/api/invalidate';
import { todayStr } from '@/api/mutations';
import type { DeclarationPhoto } from '@/api/poufa';
import type { BatchWithMetrics } from '@/api/types';
import { palette, radii, semantic } from '@/constants/theme';
import { createDeclarationQueued } from '@/offline';
import { persistAudio } from '@/offline/audio-files';
import { persistPhoto } from '@/offline/photo-files';
import type { VoiceNoteDraft } from '@/poufa/voice-note';
import { VoiceNoteRecorder } from '@/components/voice/VoiceNoteRecorder';
import { clinicalSignOptions, knownSigns, photoSlotsLeft, toggleSign } from '@/poufa/declaration';
import { pickDeclarationPhotos, useClinicalSigns } from '@/components/sanitary/DeclarationExtras';
import { speak } from '@/voice/speak';
import { SickBirdPicto, WarningPicto } from './pictos/Pictos';
import { BigKeypad, ResultScreen, StepScreen, ValidateButton } from './SimpleParts';
import { buildProblemDeclaration, problemRefusal, SENTENCES } from './simple-logic';

type Step = 'signs' | 'count' | 'voice' | 'photos';
type Phase = { name: 'ask' } | { name: 'saved'; queued: boolean } | { name: 'refused'; message: string };

export function ProblemFlow({ band, onClose }: { band: BatchWithMetrics; onClose: () => void }) {
  const { farmId } = useAuth();
  const queryClient = useQueryClient();
  const list = useClinicalSigns();
  const options = clinicalSignOptions(list.data ?? []);
  const [step, setStep] = useState<Step>('signs');
  const [signs, setSigns] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [photos, setPhotos] = useState<DeclarationPhoto[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNoteDraft[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'ask' });
  const [saving, setSaving] = useState(false);

  const backToAsk = useCallback(() => setPhase({ name: 'ask' }), []);

  const pick = async (source: 'camera' | 'library') => {
    const picked = await pickDeclarationPhotos(source, photos);
    setPhotos(picked.photos);
    setPhotoError(picked.error);
  };

  const send = async () => {
    const refusal = problemRefusal(signs, count, photos.length, voiceNotes.length);
    if (refusal) {
      setPhase({ name: 'refused', message: refusal });
      return;
    }
    setSaving(true);
    try {
      // A sign deactivated since the list was cached would be a 400.
      const known = list.data ? knownSigns(signs, list.data) : signs;
      const declaration = buildProblemDeclaration({ signs: known, count, today: todayStr() });
      const sent = await createDeclarationQueued(
        farmId,
        band.id,
        declaration,
        photos.map(persistPhoto),
        voiceNotes.map(persistAudio),
      );
      if (sent.status === 'sent') invalidateFarmQueries(queryClient, { farmId, batchId: band.id });
      setPhase({ name: 'saved', queued: sent.status === 'queued' });
    } catch {
      setPhase({ name: 'refused', message: 'Impossible d’envoyer. Recommencez.' });
    } finally {
      setSaving(false);
    }
  };

  if (phase.name === 'saved') {
    return (
      <ResultScreen
        kind="success"
        message={SENTENCES.saved}
        detail={phase.queued ? 'Il sera envoyé avec le réseau.' : undefined}
        onContinue={onClose}
      />
    );
  }
  if (phase.name === 'refused') {
    return <ResultScreen kind="error" message={phase.message} onContinue={backToAsk} />;
  }

  if (step === 'signs') {
    return (
      <StepScreen
        picto={<WarningPicto size={96} />}
        sentence={SENTENCES.probleme}
        onBack={onClose}
        footer={<ValidateButton onPress={() => setStep('count')} label="Suivant" />}>
        {options.length === 0 ? (
          <AppText size="h3" weight="semibold" color="muted" align="center">
            {list.isLoading ? 'Un instant…' : 'Pas de liste sur ce téléphone. Touchez Suivant.'}
          </AppText>
        ) : (
          <View style={styles.grid}>
            {options.map((o) => {
              const on = signs.includes(o.code);
              return (
                <Pressable
                  key={o.code}
                  onPress={() => {
                    setSigns(toggleSign(signs, o.code));
                    speak(o.label);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={o.label}
                  style={[styles.signCard, on && styles.signCardOn]}>
                  <SickBirdPicto size={64} />
                  <AppText size="bodyM" weight="bold" align="center" numberOfLines={3}>
                    {o.label}
                  </AppText>
                  {on ? (
                    <View style={styles.tick}>
                      <Check size={20} color={semantic.surface} strokeWidth={3.5} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </StepScreen>
    );
  }

  if (step === 'count') {
    return (
      <StepScreen
        picto={<SickBirdPicto size={96} />}
        sentence={SENTENCES.problemeCount}
        onBack={() => setStep('signs')}
        footer={<ValidateButton onPress={() => setStep('voice')} label="Suivant" />}>
        <BigKeypad value={count} onChange={setCount} unit="poules" />
      </StepScreen>
    );
  }

  if (step === 'voice') {
    return (
      <StepScreen
        picto={<Mic size={72} color={palette.brand[600]} strokeWidth={2.2} />}
        sentence={SENTENCES.problemeVoix}
        onBack={() => setStep('count')}
        footer={<ValidateButton onPress={() => setStep('photos')} label={voiceNotes.length > 0 ? 'Suivant' : 'Passer'} />}>
        <VoiceNoteRecorder notes={voiceNotes} onChange={setVoiceNotes} max={1} variant="large" />
      </StepScreen>
    );
  }

  return (
    <StepScreen
      picto={<Camera size={72} color={palette.brand[600]} strokeWidth={2.2} />}
      sentence={SENTENCES.problemePhotos}
      onBack={() => setStep('voice')}
      footer={<ValidateButton onPress={() => void send()} disabled={saving} label="Envoyer" />}>
      <View style={styles.photoButtons}>
        <Pressable
          onPress={() => void pick('camera')}
          disabled={photoSlotsLeft(photos.length) === 0}
          accessibilityRole="button"
          accessibilityLabel="Prendre une photo"
          style={styles.photoBtn}>
          <Camera size={40} color={semantic.surface} strokeWidth={2.4} />
        </Pressable>
        <Pressable
          onPress={() => void pick('library')}
          disabled={photoSlotsLeft(photos.length) === 0}
          accessibilityRole="button"
          accessibilityLabel="Choisir une photo dans le téléphone"
          style={[styles.photoBtn, styles.photoBtnAlt]}>
          <ImagePlus size={40} color={semantic.surface} strokeWidth={2.4} />
        </Pressable>
      </View>
      {photoError ? (
        <AppText size="bodyM" weight="semibold" color="danger" align="center">
          {photoError}
        </AppText>
      ) : null}
      <View style={styles.thumbs}>
        {photos.map((p, i) => (
          <View key={`${p.uri}-${i}`} style={styles.thumb}>
            <Image source={{ uri: p.uri }} style={styles.thumbImg} accessibilityLabel={`Photo ${i + 1}`} />
            <Pressable
              onPress={() => setPhotos(photos.filter((_, j) => j !== i))}
              accessibilityRole="button"
              accessibilityLabel={`Retirer la photo ${i + 1}`}
              hitSlop={8}
              style={styles.thumbX}>
              <X size={18} color={semantic.surface} strokeWidth={3} />
            </Pressable>
          </View>
        ))}
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', width: '100%', maxWidth: 520 },
  signCard: {
    width: '47.5%',
    minHeight: 150,
    borderRadius: radii.xl,
    backgroundColor: semantic.surface,
    borderWidth: 2,
    borderColor: semantic.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 10,
  },
  signCardOn: { borderColor: palette.red[500], backgroundColor: palette.red[50] },
  tick: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.red[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtons: { flexDirection: 'row', gap: 16 },
  photoBtn: {
    width: 120,
    height: 96,
    borderRadius: radii.xl,
    backgroundColor: palette.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBtnAlt: { backgroundColor: palette.accent[600] },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  thumb: { width: 96, height: 96 },
  thumbImg: { width: 96, height: 96, borderRadius: radii.lg, backgroundColor: semantic.surfaceAlt },
  thumbX: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.red[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
