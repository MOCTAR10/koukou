import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, breedTone, fcrTileTone, thresholdsOf, waterDropLevel } from './thresholds';

describe('seuils d’indicateurs (valeurs du serveur)', () => {
  it('reprend les valeurs paramétrées et complète avec les défauts', () => {
    expect(thresholdsOf(null)).toEqual(DEFAULT_THRESHOLDS);
    expect(thresholdsOf({ ...DEFAULT_THRESHOLDS, fcrAbsoluteWarn: 2.6 }).fcrAbsoluteWarn).toBe(2.6);
  });

  it('IC : l’écart à la souche décide, sinon l’IC absolu', () => {
    expect(fcrTileTone(2.4, null, DEFAULT_THRESHOLDS)).toBe('red');
    expect(fcrTileTone(2.4, null, { ...DEFAULT_THRESHOLDS, fcrAbsoluteWarn: 2.6 })).toBe('default');
    expect(fcrTileTone(1.9, 11, DEFAULT_THRESHOLDS)).toBe('red');
    expect(fcrTileTone(1.9, 11, { ...DEFAULT_THRESHOLDS, fcrDeviationWarnPct: 12 })).toBe('default');
    expect(fcrTileTone(1.9, -6, DEFAULT_THRESHOLDS)).toBe('green');
    expect(fcrTileTone(null, 20, DEFAULT_THRESHOLDS)).toBe('default');
  });

  it('Breed Intel : écart d’IC puis écart de ponte', () => {
    expect(breedTone(12, null, DEFAULT_THRESHOLDS)).toBe('red');
    expect(breedTone(-6, null, DEFAULT_THRESHOLDS)).toBe('green');
    expect(breedTone(2, null, DEFAULT_THRESHOLDS)).toBe('amber');
    expect(breedTone(null, -11, DEFAULT_THRESHOLDS)).toBe('amber');
    expect(breedTone(null, -11, { ...DEFAULT_THRESHOLDS, layRateDeviationWarnPct: 15 })).toBe('green');
    expect(breedTone(null, null, DEFAULT_THRESHOLDS)).toBe('default');
  });

  it('eau : chute critique, en baisse, hausse, stable', () => {
    expect(waterDropLevel(30, DEFAULT_THRESHOLDS)).toBe('critical');
    expect(waterDropLevel(15, DEFAULT_THRESHOLDS)).toBe('warn');
    expect(waterDropLevel(15, { ...DEFAULT_THRESHOLDS, waterDropWarnPct: 20 })).toBe('stable');
    expect(waterDropLevel(-8, DEFAULT_THRESHOLDS)).toBe('rising');
    expect(waterDropLevel(null, DEFAULT_THRESHOLDS)).toBe('unknown');
  });
});
