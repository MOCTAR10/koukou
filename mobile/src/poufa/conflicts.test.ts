import { describe, expect, it } from 'vitest';

import type { SyncConflictView } from '@/api/poufa';

import { conflictExplanation, conflictValue, gabonTime } from './conflicts';

const conflict = (patch: Partial<SyncConflictView> = {}): SyncConflictView => ({
  id: 'c-1',
  batchId: 'b-1',
  entityType: 'DAILY_ENTRY',
  entityLabel: 'Saisie du 2026-11-05',
  field: 'deaths',
  winner: 'SERVEUR',
  serverValue: 7,
  incomingValue: 2,
  serverCapturedAt: '2026-11-05T09:40:00.000Z',
  serverDeviceId: 'mob-a',
  incomingCapturedAt: '2026-11-05T09:20:00.000Z',
  incomingCapturedAtRaw: '2026-11-05T09:20:00.000Z',
  incomingDeviceId: 'mob-b',
  clockCorrected: false,
  createdAt: '2026-11-05T12:00:00.000Z',
  ...patch,
});

describe('conflits hors ligne', () => {
  it('heure du Gabon (UTC+1)', () => {
    expect(gabonTime('2026-11-05T09:40:00.000Z')).toBe('05/11 à 10:40');
    expect(gabonTime('2026-11-05T23:30:00.000Z')).toBe('06/11 à 00:30');
    expect(gabonTime(null)).toBeNull();
  });

  it('valeurs lisibles : poids en g, aliment en kg, eau en L', () => {
    expect(conflictValue('avgWeightKg', 1.82)).toBe('1820 g');
    expect(conflictValue('feedQuantity', 12.5)).toBe('12,5 kg');
    expect(conflictValue('waterL', 30)).toBe('30 L');
    expect(conflictValue('deaths', null)).toBe('vide');
  });

  it('serveur retenu : la valeur envoyée n’est pas plus récente', () => {
    const e = conflictExplanation(conflict());
    expect(e.title).toBe('Saisie du 2026-11-05 · Morts');
    expect(e.kept).toBe('7');
    expect(e.text).toContain('La valeur 7 déjà enregistrée (saisie le 05/11 à 10:40) a été conservée');
    expect(e.text).toContain('la valeur 2 envoyée hors ligne (saisie le 05/11 à 10:20)');
    expect(e.text).toContain('journal des conflits');
    expect(e.text).not.toContain('décalée');
  });

  it('appareil retenu : la saisie la plus récente gagne ; horloge corrigée signalée', () => {
    const e = conflictExplanation(conflict({ winner: 'APPAREIL', serverValue: 4, incomingValue: 7, clockCorrected: true }));
    expect(e.kept).toBe('7');
    expect(e.text).toMatch(/^La valeur 7 envoyée hors ligne .* a été retenue : elle est plus récente que la valeur 4/);
    expect(e.text).toContain('heure du téléphone était décalée');
  });
});
