import { afterEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver, onlineManager, QueryClient } from '@tanstack/react-query';

import { QUERY_DEFAULT_OPTIONS, retryOnce } from './query-defaults';

vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: '192.168.1.10:8081' } } }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}));

afterEach(() => onlineManager.setOnline(true));

describe('retryOnce', () => {
  it('un seul nouvel essai, et seulement si le signal dit « en ligne »', () => {
    onlineManager.setOnline(true);
    expect(retryOnce(0)).toBe(true);
    expect(retryOnce(1)).toBe(false);
    onlineManager.setOnline(false);
    expect(retryOnce(0)).toBe(false);
  });
});

describe('options par défaut du QueryClient', () => {
  it('lectures : première tentative toujours émise, copie gardée 7 jours', () => {
    expect(QUERY_DEFAULT_OPTIONS.queries?.networkMode).toBe('offlineFirst');
    expect(QUERY_DEFAULT_OPTIONS.queries?.gcTime).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('lecture hors ligne : lancée, échoue sans retry, la donnée déjà en cache reste', async () => {
    onlineManager.setOnline(false);
    const client = new QueryClient({ defaultOptions: QUERY_DEFAULT_OPTIONS });
    client.setQueryData(['k'], { old: true });
    const fn = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    await client.fetchQuery({ queryKey: ['k'], queryFn: fn, staleTime: 0 }).catch(() => undefined);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['k'])).toEqual({ old: true });
  });

  it('écriture hors ligne : jamais mise en pause (échoue tout de suite, ne repart pas seule)', async () => {
    onlineManager.setOnline(false);
    const client = new QueryClient({ defaultOptions: QUERY_DEFAULT_OPTIONS });
    const fn = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    const observer = new MutationObserver(client, { mutationFn: fn });
    await expect(observer.mutate(undefined)).rejects.toThrow('Network request failed');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().status).toBe('error');
    onlineManager.setOnline(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('sans l’option : une écriture est bien mise en pause (c’est ce que le réglage évite)', async () => {
    onlineManager.setOnline(false);
    const client = new QueryClient();
    const fn = vi.fn().mockResolvedValue('ok');
    const observer = new MutationObserver(client, { mutationFn: fn });
    void observer.mutate(undefined).catch(() => undefined);
    await Promise.resolve();
    expect(fn).not.toHaveBeenCalled();
    expect(observer.getCurrentResult().isPaused).toBe(true);
  });
});
