import { describe, expect, it } from 'vitest';
import { weightedMean } from './weightedMean';

describe('weightedMean', () => {
  it('pondère par les vivants', () => {
    expect(weightedMean([{ value: 80, weight: 100 }, { value: 60, weight: 300 }])).toBe(65);
  });
  it('ignore les lots sans valeur au lieu de les compter à zéro', () => {
    expect(weightedMean([{ value: 80, weight: 100 }, { value: null, weight: 900 }])).toBe(80);
  });
  it('renvoie null sans donnée', () => {
    expect(weightedMean([])).toBeNull();
    expect(weightedMean([{ value: null, weight: 5 }])).toBeNull();
  });
});
