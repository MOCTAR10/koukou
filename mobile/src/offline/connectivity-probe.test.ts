import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}));

import { connectivity, reportApiFailure, reportApiReachable, startConnectivity } from './connectivity';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  connectivity.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sonde de connexion (connectivity.ts)', () => {
  it('une erreur 5xx du serveur prouve qu’il répond : jamais « hors ligne »', async () => {
    fetchMock.mockResolvedValue({ status: 503 });
    startConnectivity('https://api.test/api');
    await vi.advanceTimersByTimeAsync(0);
    await connectivity.check();
    expect(connectivity.isOnline()).toBe(true);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('échec réseau : hors ligne, signal transmis à TanStack Query ; retour : en ligne et reconnexion annoncée', async () => {
    startConnectivity('https://api.test/api');
    const onReconnect = vi.fn();
    const off = connectivity.onReconnect(onReconnect);
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await connectivity.check();
    expect(connectivity.isOnline()).toBe(false);
    expect(onlineManager.isOnline()).toBe(false);
    fetchMock.mockResolvedValue({ status: 401 });
    await connectivity.check();
    expect(connectivity.isOnline()).toBe(true);
    expect(onlineManager.isOnline()).toBe(true);
    expect(onReconnect).toHaveBeenCalledTimes(1);
    off();
  });

  it('une réponse d’API suffit à repasser en ligne, sans attendre la sonde', async () => {
    startConnectivity('https://api.test/api');
    fetchMock.mockRejectedValue(new TypeError('x'));
    await connectivity.check();
    expect(connectivity.isOnline()).toBe(false);
    reportApiReachable();
    expect(connectivity.isOnline()).toBe(true);
  });

  it('rafale d’échecs d’API : une seule sonde en vol', async () => {
    startConnectivity('https://api.test/api');
    await vi.advanceTimersByTimeAsync(0);
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ status: 200 }), 100)));
    for (let i = 0; i < 20; i++) reportApiFailure();
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pas de martèlement : ~4 sondes par minute en ligne, ~8 hors ligne, plus aucune à l’arrêt', async () => {
    fetchMock.mockResolvedValue({ status: 200 });
    startConnectivity('https://api.test/api');
    connectivity.start(); // la boucle a pu être arrêtée par un test précédent
    await vi.advanceTimersByTimeAsync(0);
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(5);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);

    fetchMock.mockRejectedValue(new TypeError('x'));
    await vi.advanceTimersByTimeAsync(16_000);
    expect(connectivity.isOnline()).toBe(false);
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(8);

    connectivity.stop();
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
