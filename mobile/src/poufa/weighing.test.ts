import { describe, expect, it } from 'vitest';

import type { WeighingStatus } from '@/api/poufa';

import { defaultSampleSize, sampleSizeRefusal, sampleTip, sampleWarning, weighingLine } from './weighing';

const status = (patch: Partial<WeighingStatus> = {}): WeighingStatus => ({
  frequencyDays: 7,
  expectedSampleSize: 30,
  lastWeighingDate: '2026-10-30',
  lastSampleSize: 30,
  lastSampleBelowExpected: false,
  nextDueDate: '2026-11-06',
  daysLate: 0,
  late: false,
  ...patch,
});

describe('échantillon pesé', () => {
  it('pré-rempli par le paramètre du programme, plafonné aux présents', () => {
    expect(defaultSampleSize(30, 500)).toBe(30);
    expect(defaultSampleSize(30, 12)).toBe(12);
    expect(defaultSampleSize(null, 500)).toBe(0);
    expect(defaultSampleSize(25, undefined)).toBe(25);
  });

  it('obligatoire dès qu’un poids est saisi', () => {
    expect(sampleSizeRefusal(0, 0, 500)).toBeNull();
    expect(sampleSizeRefusal(1200, 0, 500)).toMatch(/sujets pesés/);
    expect(sampleSizeRefusal(1200, 2.5, 500)).toMatch(/sujets pesés/);
    expect(sampleSizeRefusal(1200, 600, 500)).toMatch(/600 sujet\(s\) pesé\(s\) pour 500 présent/);
    expect(sampleSizeRefusal(1200, 30, 500)).toBeNull();
  });

  it('le conseil reprend la taille du programme, jamais un 30 écrit en dur', () => {
    expect(sampleTip(25)).toContain('25 sujets');
    expect(sampleTip(null)).not.toMatch(/\d/);
  });
});

describe('échéance de pesée', () => {
  it('prochaine pesée, retard, bande clôturée', () => {
    expect(weighingLine(status(), false)).toMatchObject({ label: 'Prochaine pesée le 06/11/2026', tone: 'ok' });
    expect(weighingLine(status(), false).detail).toContain('30 sujets');
    expect(weighingLine(status({ late: true, daysLate: 3, nextDueDate: '2026-11-03' }), false)).toMatchObject({
      label: 'Pesée en retard de 3 j',
      tone: 'late',
    });
    expect(weighingLine(status({ lastWeighingDate: null, lastSampleSize: null }), false).detail).toContain('Aucune pesée');
    expect(weighingLine(status({ late: true }), true).tone).toBe('closed');
  });

  it('signale un échantillon insuffisant', () => {
    expect(sampleWarning(status())).toBeNull();
    expect(sampleWarning(status({ lastSampleBelowExpected: true, lastSampleSize: 12 }))).toMatch(/12 sujet\(s\) pesé\(s\) pour 30/);
  });
});
