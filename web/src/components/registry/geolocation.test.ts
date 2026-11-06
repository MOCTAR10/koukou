import { describe, expect, it } from 'vitest';
import {
  accuracyLabel,
  fixFromPosition,
  GEO_PERMISSION_DENIED,
  GEO_POSITION_UNAVAILABLE,
  GEO_TIMEOUT,
  GEOLOCATION_OPTIONS,
  geolocationErrorMessage,
  geolocationUnavailableReason,
  gpsSourceOf,
  roundCoordinate,
} from './geolocation';
import { buildGpsBody } from './sheetForm';

describe('geolocation helper', () => {
  it('asks for a fresh, precise fix with a timeout', () => {
    expect(GEOLOCATION_OPTIONS).toEqual({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
  });

  it('rounds coordinates to 6 decimals', () => {
    expect(roundCoordinate(0.390123456789)).toBe(0.390123);
    expect(roundCoordinate(-9.45444449)).toBe(-9.454444);
    expect(roundCoordinate(9.4544445, 2)).toBe(9.45);
  });

  it('turns a browser position into the form fields', () => {
    expect(fixFromPosition({ coords: { latitude: 0.3901234567, longitude: 9.4544449, accuracy: 12.6 } })).toEqual({
      latitude: '0.390123',
      longitude: '9.454445',
      accuracyM: '13',
    });
    expect(fixFromPosition({ coords: { latitude: 1, longitude: 2, accuracy: null } }).accuracyM).toBe('');
  });

  it('maps each error code to French', () => {
    expect(geolocationErrorMessage(GEO_PERMISSION_DENIED)).toMatch(/refusé/);
    expect(geolocationErrorMessage(GEO_POSITION_UNAVAILABLE)).toMatch(/indisponible/);
    expect(geolocationErrorMessage(GEO_TIMEOUT)).toMatch(/à temps/);
    expect(geolocationErrorMessage(99)).toMatch(/saisissez/);
  });

  it('says when the browser cannot locate at all', () => {
    expect(geolocationUnavailableReason({ hasGeolocation: true, secureContext: true })).toBeNull();
    expect(geolocationUnavailableReason({ hasGeolocation: true, secureContext: false })).toMatch(/https/);
    expect(geolocationUnavailableReason({ hasGeolocation: false, secureContext: true })).toMatch(/navigateur/);
  });

  it('labels the accuracy', () => {
    expect(accuracyLabel('8')).toBe('Précision ± 8 m (bonne).');
    expect(accuracyLabel('60')).toMatch(/moyenne/);
    expect(accuracyLabel('300')).toMatch(/faible/);
    expect(accuracyLabel('')).toBeNull();
  });

  it('keeps APPAREIL only while the device fix is untouched', () => {
    const device = { latitude: '0.390123', longitude: '9.454445', accuracyM: '13' };
    expect(gpsSourceOf(device, device)).toBe('APPAREIL');
    expect(gpsSourceOf({ ...device, latitude: '0,390123' }, device)).toBe('APPAREIL');
    expect(gpsSourceOf({ ...device, longitude: '9.5' }, device)).toBe('MANUEL');
    expect(gpsSourceOf(device, null)).toBe('MANUEL');
  });

  it('sends the device source through the GPS body', () => {
    const draft = { latitude: '0.39', longitude: '9.45', accuracyM: '13', capturedAt: '', reason: '', today: '2026-11-06' };
    expect(buildGpsBody({ ...draft, source: 'APPAREIL' })).toEqual({ body: { latitude: 0.39, longitude: 9.45, accuracyM: 13, source: 'APPAREIL' } });
    expect(buildGpsBody(draft)).toEqual({ body: { latitude: 0.39, longitude: 9.45, accuracyM: 13, source: 'MANUEL' } });
  });
});
