import { describe, expect, it } from 'vitest';
import { initialSampleSize, sampleBelowExpected, sampleSizeError } from './weighing';

describe('weighing sample size', () => {
  it('opens with the saved sample, else the programme sample', () => {
    expect(initialSampleSize({ sampleSize: 25 }, 30)).toBe('25');
    expect(initialSampleSize(null, 30)).toBe('30');
    expect(initialSampleSize({ sampleSize: null }, null)).toBe('');
  });

  it('requires a whole number of at least 1 with a weight', () => {
    expect(sampleSizeError(0, '', 100)).toBeNull();
    expect(sampleSizeError(450, '', 100)).toBe('Indiquez le nombre de sujets pesés avec le poids moyen.');
    expect(sampleSizeError(450, '0', 100)).toBe('Le nombre de sujets pesés est un nombre entier d’au moins 1.');
    expect(sampleSizeError(450, '2.5', 100)).toBe('Le nombre de sujets pesés est un nombre entier d’au moins 1.');
    expect(sampleSizeError(450, '30', 100)).toBeNull();
  });

  it('refuses more birds weighed than present', () => {
    expect(sampleSizeError(450, '120', 100)).toBe('Échantillon impossible : 120 sujet(s) pesé(s) pour 100 présent(s).');
    expect(sampleSizeError(450, '120', null)).toBeNull();
  });

  it('flags a sample below the programme one', () => {
    expect(sampleBelowExpected('20', 30)).toBe(true);
    expect(sampleBelowExpected('30', 30)).toBe(false);
    expect(sampleBelowExpected('20', null)).toBe(false);
  });
});
