import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { BatchWithMetrics } from '@/api/types';
import { breedImageForLot } from '@/constants/breedImages';
import { palette, radii, semantic } from '@/constants/theme';
import { speak } from '@/voice/speak';
import { SENTENCES } from './simple-logic';

export function bandName(b: BatchWithMetrics): string {
  return b.batchName?.trim() || b.breedName?.trim() || 'Ma bande';
}

/** First step when the farm has several open bands: big cards, name + photo of the bird. */
export function BandPicker({ bands, onPick }: { bands: BatchWithMetrics[]; onPick: (id: string) => void }) {
  return (
    <View style={styles.list}>
      <AppText size="h2" weight="bold" align="center">
        {SENTENCES.band}
      </AppText>
      {bands.map((b) => {
        const photo = breedImageForLot(b.breedName, b.species);
        return (
          <Pressable
            key={b.id}
            onPress={() => {
              speak(bandName(b));
              onPick(b.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Bande ${bandName(b)}`}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
            {photo ? <Image source={photo} style={styles.photo} accessibilityLabel="" resizeMode="cover" /> : <View style={styles.photo} />}
            <View style={styles.text}>
              <AppText size="h2" weight="bold" numberOfLines={2}>
                {bandName(b)}
              </AppText>
              <AppText size="h3" weight="semibold" color="muted">
                {b.metrics.liveCount} poules
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small « change band » card shown above the tiles when the farm has several bands. */
export function BandChip({ band, onChange }: { band: BatchWithMetrics; onChange: () => void }) {
  const photo = breedImageForLot(band.breedName, band.species);
  return (
    <Pressable
      onPress={onChange}
      accessibilityRole="button"
      accessibilityLabel={`Bande ${bandName(band)}, changer de bande`}
      style={({ pressed }) => [styles.chip, pressed && styles.cardPressed]}>
      {photo ? <Image source={photo} style={styles.chipPhoto} accessibilityLabel="" resizeMode="cover" /> : null}
      <AppText size="h3" weight="bold" numberOfLines={1} style={styles.chipText}>
        {bandName(band)}
      </AppText>
      <AppText size="bodyM" weight="semibold" color="brand">
        Changer
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, marginTop: 8 },
  card: {
    minHeight: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: radii.xl,
    backgroundColor: semantic.surface,
    borderWidth: 2,
    borderColor: palette.brand[300],
  },
  cardPressed: { backgroundColor: palette.brand[50] },
  photo: { width: 96, height: 96, borderRadius: radii.lg, backgroundColor: semantic.surfaceAlt },
  text: { flex: 1, gap: 4 },
  chip: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: radii.xl,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
  },
  chipPhoto: { width: 48, height: 48, borderRadius: radii.md },
  chipText: { flex: 1 },
});
