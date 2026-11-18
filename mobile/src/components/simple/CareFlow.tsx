// « Vaccin » of the SIMPLE experience: the cares due today or late as big
// cards, « Fait » asks how many birds were treated (live count prefilled) and
// completes the care through the existing offline kind.
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/auth/AuthContext';
import { invalidateFarmQueries } from '@/api/invalidate';
import { todayStr } from '@/api/mutations';
import type { BatchWithMetrics, ProphylaxisEvent } from '@/api/types';
import { palette, radii, semantic } from '@/constants/theme';
import { completeProphylaxisQueued } from '@/offline';
import { careNeedsTreatmentDetails, careTreatmentBody, completionBody } from '@/poufa/sanitary-records';
import { CompleteCareSheet } from '@/components/sanitary/SanitaryRecordSheets';
import { speak } from '@/voice/speak';
import { SyringePicto } from './pictos/Pictos';
import { BigKeypad, ResultScreen, StepScreen, ValidateButton } from './SimpleParts';
import { careBucket, SENTENCES } from './simple-logic';
import { markCareDone } from './simpleSession';
import { useBandCares } from './useSimpleData';

type Phase =
  | { name: 'list' }
  | { name: 'count'; event: ProphylaxisEvent }
  | { name: 'saved'; queued: boolean }
  | { name: 'refused'; event: ProphylaxisEvent; message: string };

export function CareFlow({ band, onClose }: { band: BatchWithMetrics; onClose: () => void }) {
  const { farmId } = useAuth();
  const queryClient = useQueryClient();
  const { todo } = useBandCares(band);
  const today = todayStr();
  const live = band.metrics.liveCount;
  const [phase, setPhase] = useState<Phase>({ name: 'list' });
  const [count, setCount] = useState<number | null>(null);
  // A care with a withdrawal period and no programme step needs the vets' product list: the existing sheet.
  const [detailed, setDetailed] = useState<ProphylaxisEvent | null>(null);
  const [saving, setSaving] = useState(false);

  const backToList = useCallback(() => setPhase({ name: 'list' }), []);

  const pickDone = (event: ProphylaxisEvent) => {
    if (careNeedsTreatmentDetails(event)) {
      setDetailed(event);
      return;
    }
    setCount(null);
    setPhase({ name: 'count', event });
  };

  const complete = async (event: ProphylaxisEvent, animalCount: number) => {
    const base = completionBody({ completedAt: today, animalCount: String(animalCount), route: '', notes: '' }, event.route);
    if (!base.ok) {
      setPhase({ name: 'refused', event, message: 'Dites combien de poules vous avez soignées.' });
      return;
    }
    const extra = careTreatmentBody(
      { ...event, productCode: event.productCode ?? null },
      { productCode: '', endDate: '', reason: '' },
      today,
      null,
    );
    if (!extra.ok) {
      setDetailed(event);
      setPhase({ name: 'list' });
      return;
    }
    setSaving(true);
    try {
      const sent = await completeProphylaxisQueued(farmId, band.id, event.id, { ...base.body, ...extra.body });
      if (sent.status === 'sent') {
        invalidateFarmQueries(queryClient, { farmId, batchId: band.id });
        void queryClient.invalidateQueries({ queryKey: ['prophylaxis', farmId, band.id] });
      }
      markCareDone(event.id);
      setPhase({ name: 'saved', queued: sent.status === 'queued' });
    } catch {
      setPhase({ name: 'refused', event, message: 'Impossible d’enregistrer. Recommencez.' });
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
        onContinue={backToList}
      />
    );
  }
  if (phase.name === 'refused') {
    const event = phase.event;
    return <ResultScreen kind="error" message={phase.message} onContinue={() => setPhase({ name: 'count', event })} />;
  }
  if (phase.name === 'count') {
    const event = phase.event;
    const value = count ?? live;
    return (
      <StepScreen
        picto={<SyringePicto size={96} />}
        sentence={SENTENCES.vaccinCount}
        onBack={backToList}
        footer={<ValidateButton onPress={() => void complete(event, value)} disabled={saving} />}>
        <AppText size="h3" weight="semibold" color="muted" align="center" numberOfLines={2}>
          {event.name}
        </AppText>
        <BigKeypad value={value} onChange={setCount} unit="poules" max={99999} />
      </StepScreen>
    );
  }

  const sentence = todo.length > 0 ? SENTENCES.vaccin : SENTENCES.vaccinNone;
  return (
    <>
      <StepScreen picto={<SyringePicto size={96} />} sentence={sentence} onBack={onClose}>
        {todo.length === 0 ? (
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Retour à l’accueil" style={styles.okBtn}>
            <AppText size="h2" weight="bold" color={semantic.surface}>
              OK
            </AppText>
          </Pressable>
        ) : (
          todo.map((event) => {
            const late = careBucket(event, today) === 'late';
            return (
              <View key={event.id} style={[styles.card, late && styles.cardLate]}>
                <Pressable
                  onPress={() => speak(event.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Écouter : ${event.name}`}
                  style={styles.cardTop}>
                  <SyringePicto size={64} />
                  <View style={styles.cardText}>
                    <AppText size="h3" weight="bold" numberOfLines={3}>
                      {event.name}
                    </AppText>
                    <AppText size="bodyM" weight="bold" color={late ? palette.red[600] : palette.amber[700]}>
                      {late ? 'En retard' : 'Aujourd’hui'}
                    </AppText>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => pickDone(event)}
                  accessibilityRole="button"
                  accessibilityLabel={`Fait : ${event.name}`}
                  style={({ pressed }) => [styles.doneBtn, pressed && styles.doneBtnPressed]}>
                  <AppText size="h2" weight="bold" color={semantic.surface}>
                    Fait
                  </AppText>
                </Pressable>
              </View>
            );
          })
        )}
      </StepScreen>
      {detailed ? (
        <CompleteCareSheet
          visible
          farmId={farmId}
          event={detailed}
          defaultCount={live}
          onClose={() => {
            setDetailed(null);
            void queryClient.invalidateQueries({ queryKey: ['prophylaxis', farmId, band.id] });
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: radii.xl,
    backgroundColor: semantic.surface,
    borderWidth: 2,
    borderColor: palette.amber[300],
    padding: 12,
    gap: 12,
  },
  cardLate: { borderColor: palette.red[500], backgroundColor: palette.red[50] },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 },
  cardText: { flex: 1, gap: 4 },
  doneBtn: {
    minHeight: 72,
    borderRadius: radii.lg,
    backgroundColor: palette.green[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnPressed: { backgroundColor: palette.green[700] },
  okBtn: {
    minHeight: 76,
    minWidth: 200,
    borderRadius: radii.xl,
    backgroundColor: palette.green[600],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
});
