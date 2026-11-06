import { describe, expect, it } from 'vitest';

import type { DailyEntryRecord } from '@/api/types';

import { DAILY_ENTRY_SYNC_FIELDS, entryBase, withCapture, withEntryBase, withSendTime } from './entry-sync';

const record = (patch: Partial<DailyEntryRecord> = {}): DailyEntryRecord => ({
  id: 'e-1',
  batchId: 'b-1',
  entryDate: '2026-11-05',
  deaths: 4,
  feedQuantity: 100,
  feedUnit: 'SAC',
  bagSizeKg: 50,
  feedPhase: 'CROISSANCE',
  customFeedPhaseName: null,
  inputLotId: null,
  skipStockDeduction: false,
  waterL: 30,
  avgWeightKg: 1.2,
  sampleSize: 30,
  eggsCollected: 0,
  eggsSellable: 0,
  eggsCracked: 0,
  eggsSmall: 0,
  eggsDoubleYolk: 0,
  eggsDirty: 0,
  source: 'MANUELLE',
  createdAt: '2026-11-05T08:00:00.000Z',
  updatedAt: '2026-11-05T09:00:00.000Z',
  ...patch,
});

describe('entryBase', () => {
  it('reprend la fiche connue : updatedAt et chaque champ comparé (aliment en kg)', () => {
    const base = entryBase(record());
    expect(base?.baseUpdatedAt).toBe('2026-11-05T09:00:00.000Z');
    expect(Object.keys(base!.baseValues).sort()).toEqual([...DAILY_ENTRY_SYNC_FIELDS].sort());
    expect(base!.baseValues).toMatchObject({ deaths: 4, feedQuantity: 100, waterL: 30, avgWeightKg: 1.2, sampleSize: 30 });
  });

  it('valeur absente = null ; aucune base sans fiche', () => {
    expect(entryBase(record({ avgWeightKg: null, sampleSize: undefined }))!.baseValues).toMatchObject({
      avgWeightKg: null,
      sampleSize: null,
    });
    expect(entryBase(null)).toBeNull();
    expect(withEntryBase({ entryDate: '2026-11-05', deaths: 1 }, null)).toEqual({ entryDate: '2026-11-05', deaths: 1 });
  });

  it('modification : la base accompagne les zéros renvoyés', () => {
    const p = withEntryBase({ entryDate: '2026-11-05', deaths: 0, waterL: 45 }, record());
    expect(p).toMatchObject({ deaths: 0, waterL: 45, baseUpdatedAt: '2026-11-05T09:00:00.000Z' });
    expect(p.baseValues).toMatchObject({ deaths: 4, waterL: 30 });
  });
});

describe('withCapture / withSendTime', () => {
  it('heure de saisie et appareil fixés une fois, jamais réécrits au rejeu', () => {
    const first = withCapture({ entryDate: '2026-11-05' }, '2026-11-05T10:00:00.000Z', 'mob-a');
    expect(first).toMatchObject({ capturedAt: '2026-11-05T10:00:00.000Z', deviceId: 'mob-a' });
    expect(withCapture(first, '2026-11-05T12:00:00.000Z', 'mob-b')).toMatchObject({
      capturedAt: '2026-11-05T10:00:00.000Z',
      deviceId: 'mob-a',
    });
  });

  it('heure d’envoi renouvelée à chaque tentative', () => {
    const p = withSendTime({ entryDate: '2026-11-05', deviceSentAt: '2026-11-05T10:00:00.000Z' }, '2026-11-05T14:00:00.000Z');
    expect(p.deviceSentAt).toBe('2026-11-05T14:00:00.000Z');
  });
});
