import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted and vi.mock run before the imports below.
import { getCurrentPosition, LOCATION_AVAILABLE } from './current-position';

const loc = vi.hoisted(() => ({
  getForegroundPermissionsAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
  hasServicesEnabledAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
}));

vi.mock('expo-location', () => ({ ...loc, Accuracy: { High: 4 } }));

const granted = { status: 'granted', canAskAgain: true };
const fix = { coords: { latitude: 0.391, longitude: 9.452, accuracy: 6.5 }, timestamp: Date.UTC(2026, 10, 6, 8) };

beforeEach(() => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(granted);
  loc.requestForegroundPermissionsAsync.mockResolvedValue(granted);
  loc.hasServicesEnabledAsync.mockResolvedValue(true);
  loc.getCurrentPositionAsync.mockResolvedValue(fix);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getCurrentPosition (expo-location)', () => {
  it('le module est livré dans cette version', () => {
    expect(LOCATION_AVAILABLE).toBe(true);
  });

  it('rend le point, la précision et l’heure du relevé', async () => {
    await expect(getCurrentPosition()).resolves.toEqual({
      latitude: 0.391,
      longitude: 9.452,
      accuracyM: 6.5,
      capturedAt: '2026-11-06T08:00:00.000Z',
    });
    expect(loc.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 4 });
    expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('demande la permission si elle n’est pas encore donnée', async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    await expect(getCurrentPosition()).resolves.toMatchObject({ latitude: 0.391 });
    expect(loc.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('refuse sans redemander quand la permission est bloquée', async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
    await expect(getCurrentPosition()).rejects.toMatchObject({ reason: 'PERMISSION_DENIED' });
    expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('refuse quand l’utilisateur décline la demande', async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    await expect(getCurrentPosition()).rejects.toMatchObject({ reason: 'PERMISSION_DENIED' });
  });

  it('signale une localisation désactivée', async () => {
    loc.hasServicesEnabledAsync.mockResolvedValue(false);
    await expect(getCurrentPosition()).rejects.toMatchObject({ reason: 'SERVICES_OFF' });
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('abandonne après le délai, sans compter la demande de permission', async () => {
    vi.useFakeTimers();
    loc.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
    const assertion = expect(getCurrentPosition({ timeoutMs: 1000 })).rejects.toMatchObject({ reason: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('rend une erreur inattendue du module comme « indisponible »', async () => {
    loc.getCurrentPositionAsync.mockRejectedValue(new Error('native boom'));
    await expect(getCurrentPosition()).rejects.toMatchObject({ reason: 'UNAVAILABLE' });
  });

  it('accepte une précision inconnue', async () => {
    loc.getCurrentPositionAsync.mockResolvedValue({ ...fix, coords: { ...fix.coords, accuracy: null } });
    await expect(getCurrentPosition()).resolves.toMatchObject({ accuracyM: null });
  });
});
