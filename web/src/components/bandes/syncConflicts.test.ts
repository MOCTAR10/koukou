import { describe, expect, it } from 'vitest';
import { conflictExplanation, syncFieldLabel, syncValueLabel, type SyncConflictRow } from './syncConflicts';

const row = (over: Partial<SyncConflictRow>): SyncConflictRow => ({
  id: 'c1',
  batchId: 'b1',
  entityType: 'DAILY_ENTRY',
  entityLabel: 'Saisie du 2026-11-05',
  field: 'deaths',
  winner: 'APPAREIL',
  serverValue: 2,
  incomingValue: 5,
  serverCapturedAt: '2026-11-05T08:00:00.000Z',
  serverDeviceId: 'web-a',
  incomingCapturedAt: '2026-11-05T09:00:00.000Z',
  incomingCapturedAtRaw: null,
  incomingDeviceId: 'android-b',
  clockSkewMs: null,
  clockCorrected: false,
  createdAt: '2026-11-05T10:00:00.000Z',
  ...over,
});

describe('sync conflicts', () => {
  it('labels fields and values as typed', () => {
    expect(syncFieldLabel('deaths')).toBe('Morts du jour');
    expect(syncFieldLabel('inconnu')).toBe('inconnu');
    expect(syncValueLabel('avgWeightKg', 0.45)).toBe('450 g');
    expect(syncValueLabel('feedQuantity', 12.5)).toBe('12,5');
    expect(syncValueLabel('deaths', null)).toBe('vide');
  });

  it('explains a later offline capture that wins', () => {
    const e = conflictExplanation(row({}));
    expect(e.title).toBe('Saisie du 2026-11-05 · Morts du jour');
    expect(e.kept).toMatch(/^Valeur retenue : 5 \(saisie le .+ arrivée hors ligne\)\.$/);
    expect(e.lost).toMatch(/^Valeur remplacée : 2 /);
    expect(e.reason).toContain('la saisie la plus récente l’emporte');
    expect(e.clockNote).toBeNull();
  });

  it('explains the server value kept, on a tie and when captured later', () => {
    const tie = conflictExplanation(row({ winner: 'SERVEUR', incomingCapturedAt: '2026-11-05T08:00:00.000Z' }));
    expect(tie.kept).toMatch(/^Valeur retenue : 2 \(déjà enregistrée/);
    expect(tie.lost).toMatch(/^Valeur non retenue : 5 /);
    expect(tie.reason).toContain('même heure');
    const later = conflictExplanation(row({ winner: 'SERVEUR', incomingCapturedAt: '2026-11-05T07:00:00.000Z' }));
    expect(later.reason).toContain('saisie plus tard');
  });

  it('mentions a corrected phone clock', () => {
    expect(conflictExplanation(row({ clockCorrected: true, clockSkewMs: 3_600_000 })).clockNote).toContain('horloge du téléphone');
  });
});
