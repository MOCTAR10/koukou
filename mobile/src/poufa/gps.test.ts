import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCurrentPosition, LOCATION_AVAILABLE } from '@/location/current-position';
import { PositionError, accuracyGrade, accuracyLabel, buildGpsPayload, formatCoords, positionRefusal, withTimeout } from './gps';

const fix = { latitude: 0.3912345678, longitude: 9.4521234567, accuracyM: 7.84, capturedAt: '2026-11-06T08:00:00.000Z' };

afterEach(() => {
  vi.useRealTimers();
});

describe('précision', () => {
  it('bonne, moyenne, faible, inconnue', () => {
    expect(accuracyGrade(10)).toBe('bonne');
    expect(accuracyGrade(40)).toBe('moyenne');
    expect(accuracyGrade(120)).toBe('faible');
    expect(accuracyGrade(null)).toBe('inconnue');
    expect(accuracyLabel(7.84)).toBe('Précision ± 8 m (bonne)');
    expect(accuracyLabel(null)).toBe('Précision inconnue');
  });

  it('coordonnées à 5 décimales', () => {
    expect(formatCoords(fix)).toBe('0.39123, 9.45212');
  });
});

describe('positionRefusal', () => {
  it('refuse les points impossibles', () => {
    expect(positionRefusal(fix)).toBeNull();
    expect(positionRefusal({ ...fix, latitude: 91 })).toMatch(/Latitude/);
    expect(positionRefusal({ ...fix, longitude: Number.NaN })).toMatch(/Longitude/);
    expect(positionRefusal({ ...fix, latitude: 0, longitude: 0 })).toMatch(/0, 0/);
  });
});

describe('buildGpsPayload', () => {
  it('source appareil, heure du relevé gardée, arrondis', () => {
    expect(buildGpsPayload(fix)).toEqual({
      latitude: 0.391235,
      longitude: 9.452123,
      capturedAt: fix.capturedAt,
      source: 'APPAREIL',
      accuracyM: 7.8,
    });
    expect(buildGpsPayload({ ...fix, accuracyM: null }, '  Nouveau bâtiment ')).toEqual({
      latitude: 0.391235,
      longitude: 9.452123,
      capturedAt: fix.capturedAt,
      source: 'APPAREIL',
      reason: 'Nouveau bâtiment',
    });
  });
});

describe('withTimeout', () => {
  it('rejette en TIMEOUT après le délai', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 1000);
    const assertion = expect(pending).rejects.toMatchObject({ reason: 'TIMEOUT' });
    vi.advanceTimersByTime(1000);
    await assertion;
  });

  it('laisse passer la valeur et l’erreur d’origine', async () => {
    await expect(withTimeout(Promise.resolve(3), 1000)).resolves.toBe(3);
    await expect(withTimeout(Promise.reject(new PositionError('PERMISSION_DENIED')), 1000)).rejects.toMatchObject({
      reason: 'PERMISSION_DENIED',
    });
  });
});

describe('getCurrentPosition (module absent de cette version)', () => {
  it('explique que le relevé arrive avec la prochaine version', async () => {
    expect(LOCATION_AVAILABLE).toBe(false);
    await expect(getCurrentPosition()).rejects.toMatchObject({ reason: 'NOT_INSTALLED' });
  });
});
