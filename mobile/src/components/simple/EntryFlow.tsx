// One-question-per-screen daily entries of the SIMPLE experience: Morts,
// Aliment, Eau, Œufs, Pesée. Each answer is saved alone through the same
// offline path as the daily sheet and merged into the day's entry.
import React, { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/auth/AuthContext';
import type { BatchWithMetrics } from '@/api/types';
import { palette, radii, semantic } from '@/constants/theme';
import { EGGS_PER_ALVEOL } from '@/constants/stock';
import { defaultSampleSize } from '@/poufa/weighing';
import { DeadBirdPicto, FeedSackPicto, ScalePicto, WaterDropPicto } from './pictos/Pictos';
import { BigKeypad, ResultScreen, StepScreen, ValidateButton } from './SimpleParts';
import { joinEggs, resolveFeedChoice, SENTENCES, sacsOfEntry, splitEggs, type SimpleEntryInput, type SimpleEntryKind } from './simple-logic';
import { useBandWeighing, useDayEntry, useFeedStock, useSaveSimpleEntry } from './useSimpleData';

const ALVEOLE_PHOTO = require('@/assets/images/alveole2.jpg');
const EGG_PHOTO = require('@/assets/images/oeuf2.jpg');

interface Props {
  kind: SimpleEntryKind;
  band: BatchWithMetrics;
  /** The band's name, shown when the farm has several (null: single band, nothing to tell apart). */
  bandLabel: string | null;
  onClose: () => void;
}

type Phase = { name: 'ask' } | { name: 'saving' } | { name: 'saved'; queued: boolean } | { name: 'refused'; message: string };

function Photo({ source, label }: { source: number; label: string }) {
  return <Image source={source} style={styles.photo} accessibilityLabel={label} resizeMode="cover" />;
}

export function EntryFlow({ kind, band, bandLabel, onClose }: Props) {
  const { farms, farmId } = useAuth();
  const { entry, today } = useDayEntry(band);
  const stock = useFeedStock();
  const weighing = useBandWeighing(band);
  const save = useSaveSimpleEntry(band, entry, today);
  const [phase, setPhase] = useState<Phase>({ name: 'ask' });
  const [step, setStep] = useState(0);

  const farm = farms.find((f) => f.id === farmId) ?? farms[0];
  const bagSizeKg = entry?.bagSizeKg ?? farm?.defaultSacKg ?? 50;

  // Values start from the day's entry (correct, do not retype); null = untouched.
  const sacsToday = sacsOfEntry(entry, bagSizeKg);
  const eggsToday = splitEggs(entry?.eggsCollected ?? 0);
  const [main, setMain] = useState<number | null>(null);
  const [second, setSecond] = useState<number | null>(null);
  const [half, setHalf] = useState<boolean | null>(null);

  const initialMain =
    kind === 'morts' ? (entry?.deaths ?? 0)
    : kind === 'aliment' ? Math.floor(sacsToday)
    : kind === 'eau' ? Math.round(entry?.waterL ?? 0)
    : kind === 'oeufs' ? eggsToday.alveoles
    : entry?.avgWeightKg != null ? Math.round(entry.avgWeightKg * 1000) : 0;
  const initialSecond =
    kind === 'oeufs' ? eggsToday.loose : entry?.sampleSize ?? defaultSampleSize(weighing?.expectedSampleSize, band.metrics.liveCount);
  const mainValue = main ?? initialMain;
  const secondValue = second ?? initialSecond;
  const halfValue = half ?? sacsToday % 1 !== 0;

  const lastStep = kind === 'oeufs' || kind === 'pesee' ? 1 : 0;

  const finish = useCallback(() => onClose(), [onClose]);
  const backToAsk = useCallback(() => setPhase({ name: 'ask' }), []);

  const submit = async () => {
    if (step < lastStep) {
      setStep(step + 1);
      return;
    }
    let input: SimpleEntryInput;
    switch (kind) {
      case 'morts':
        input = { kind, deaths: mainValue };
        break;
      case 'eau':
        input = { kind, waterL: mainValue };
        break;
      case 'aliment':
        input = { kind, sacs: mainValue + (halfValue ? 0.5 : 0), bagSizeKg, feed: resolveFeedChoice(band, entry, stock.data) };
        break;
      case 'oeufs':
        input = { kind, eggs: joinEggs(mainValue, secondValue) };
        break;
      case 'pesee':
        input = { kind, weightG: mainValue, sampleSize: secondValue };
        break;
    }
    setPhase({ name: 'saving' });
    const out = await save(input);
    setPhase(out.ok ? { name: 'saved', queued: out.queued } : { name: 'refused', message: out.message });
  };

  if (phase.name === 'saved') {
    return (
      <ResultScreen
        kind="success"
        message={SENTENCES.saved}
        detail={phase.queued ? 'Il sera envoyé avec le réseau.' : undefined}
        onContinue={finish}
      />
    );
  }
  if (phase.name === 'refused') {
    return <ResultScreen kind="error" message={phase.message} onContinue={backToAsk} />;
  }

  const saving = phase.name === 'saving';
  const footer = <ValidateButton onPress={() => void submit()} disabled={saving} />;
  const onBack = step > 0 ? () => setStep(step - 1) : onClose;
  const label = bandLabel ? (
    <AppText size="h3" weight="semibold" color="muted" align="center">
      {bandLabel}
    </AppText>
  ) : null;

  if (kind === 'morts') {
    return (
      <StepScreen picto={<DeadBirdPicto size={96} />} sentence={SENTENCES.morts} onBack={onBack} footer={footer}>
        {label}
        <BigKeypad value={mainValue} onChange={setMain} unit="poules" />
      </StepScreen>
    );
  }
  if (kind === 'eau') {
    return (
      <StepScreen picto={<WaterDropPicto size={96} />} sentence={SENTENCES.eau} onBack={onBack} footer={footer}>
        {label}
        <BigKeypad value={mainValue} onChange={setMain} unit="litres" step={10} />
      </StepScreen>
    );
  }
  if (kind === 'aliment') {
    return (
      <StepScreen picto={<FeedSackPicto size={96} />} sentence={SENTENCES.aliment} onBack={onBack} footer={footer}>
        {label}
        <BigKeypad value={mainValue} onChange={setMain} unit={mainValue > 1 ? 'sacs' : 'sac'} max={999} />
        <Pressable
          onPress={() => setHalf(!halfValue)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: halfValue }}
          accessibilityLabel="Un demi-sac en plus"
          style={[styles.halfBtn, halfValue && styles.halfBtnOn]}>
          <FeedSackPicto size={44} />
          <AppText size="h2" weight="bold" color={halfValue ? semantic.surface : 'text'}>
            + ½ sac
          </AppText>
        </Pressable>
      </StepScreen>
    );
  }
  if (kind === 'oeufs') {
    return step === 0 ? (
      <StepScreen
        picto={<Photo source={ALVEOLE_PHOTO} label="Alvéole d’œufs" />}
        sentence={SENTENCES.oeufsAlveoles}
        onBack={onBack}
        footer={<ValidateButton onPress={() => void submit()} label="Suivant" />}>
        {label}
        <BigKeypad value={mainValue} onChange={setMain} unit={mainValue > 1 ? 'alvéoles' : 'alvéole'} max={999} />
      </StepScreen>
    ) : (
      <StepScreen picto={<Photo source={EGG_PHOTO} label="Œufs" />} sentence={SENTENCES.oeufsLoose} onBack={onBack} footer={footer}>
        <BigKeypad value={secondValue} onChange={setSecond} unit={secondValue > 1 ? 'œufs seuls' : 'œuf seul'} max={EGGS_PER_ALVEOL - 1} />
      </StepScreen>
    );
  }
  // Pesée: weight, then how many birds were weighed.
  return step === 0 ? (
    <StepScreen
      picto={<ScalePicto size={96} />}
      sentence={SENTENCES.peseeWeight}
      onBack={onBack}
      footer={<ValidateButton onPress={() => void submit()} label="Suivant" />}>
      {label}
      <BigKeypad value={mainValue} onChange={setMain} unit="grammes" step={50} max={9999} />
    </StepScreen>
  ) : (
    <StepScreen picto={<ScalePicto size={96} />} sentence={SENTENCES.peseeCount} onBack={onBack} footer={footer}>
      <BigKeypad value={secondValue} onChange={setSecond} unit="poules" max={9999} />
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  photo: { width: 120, height: 120, borderRadius: radii.xl, backgroundColor: semantic.surfaceAlt },
  halfBtn: {
    width: '100%',
    maxWidth: 420,
    minHeight: 76,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderColor: palette.amber[400],
    backgroundColor: semantic.warnSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  halfBtnOn: { backgroundColor: palette.amber[600], borderColor: palette.amber[800] },
});
