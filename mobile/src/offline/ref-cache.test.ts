import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api/client';
import { clearSession } from '@/api/token';

import { cachedRead, clearUserCache, isNetworkFailure, readCached, writeCached } from './ref-cache';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { hostUri: '192.168.1.10:8081' } },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

let n = 0;
const key = () => `test.${++n}`;

beforeEach(() => {
  clearSession();
});

describe('ref-cache', () => {
  it('réseau ou 5xx = panne, 4xx = refus', () => {
    expect(isNetworkFailure(new TypeError('Network request failed'))).toBe(true);
    expect(isNetworkFailure(new ApiError(503, 'Indisponible'))).toBe(true);
    expect(isNetworkFailure(new ApiError(403, 'Refusé'))).toBe(false);
  });

  it('garde la dernière réponse et la sert hors ligne', async () => {
    const k = key();
    await expect(cachedRead(k, async () => ['A'])).resolves.toEqual(['A']);
    expect(readCached(k)?.value).toEqual(['A']);
    await expect(
      cachedRead(k, async () => {
        throw new TypeError('Network request failed');
      }),
    ).resolves.toEqual(['A']);
  });

  it('un refus n’est jamais masqué par la copie', async () => {
    const k = key();
    writeCached(k, ['A']);
    await expect(
      cachedRead(k, async () => {
        throw new ApiError(403, 'Accès refusé');
      }),
    ).rejects.toThrow('Accès refusé');
  });

  it('la déconnexion efface les copies du compte', () => {
    const k = key();
    writeCached(k, ['A']);
    expect(readCached(k)).not.toBeNull();
    clearUserCache('anonyme');
    expect(readCached(k)).toBeNull();
  });

  it('hors ligne sans copie : l’erreur réseau remonte', async () => {
    await expect(
      cachedRead(key(), async () => {
        throw new TypeError('Network request failed');
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
