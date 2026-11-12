import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import { clearSession } from '@/api/token';

import { QUERY_CACHE_MAX_BYTES, restoreQueryCache, saveQueryCache } from './query-persist';
import { storage } from './storage';

vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: '192.168.1.10:8081' } } }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}));

const KEY = 'koukou.qcache.u-1';

beforeEach(() => {
  clearSession();
  storage.removeItem(KEY);
});

describe('query-persist : cas limites', () => {
  it('la restauration n’écrase pas une donnée plus récente déjà en mémoire', () => {
    const old = new QueryClient();
    old.setQueryData(['dash'], { birds: 100 }, { updatedAt: Date.now() - 3_600_000 });
    saveQueryCache(old, 'u-1');

    const fresh = new QueryClient();
    fresh.setQueryData(['dash'], { birds: 250 });
    expect(restoreQueryCache(fresh, 'u-1')).toBe(true);
    expect(fresh.getQueryData(['dash'])).toEqual({ birds: 250 });
  });

  it('une requête en erreur n’est jamais sauvegardée, les réussies oui', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['ok'], 1);
    await client.fetchQuery({ queryKey: ['ko'], queryFn: () => Promise.reject(new Error('boom')) }).catch(() => undefined);
    saveQueryCache(client, 'u-1');
    const saved = JSON.parse(storage.getItem(KEY) ?? '{}');
    expect(saved.state.queries.map((q: { queryKey: unknown[] }) => q.queryKey[0])).toEqual(['ok']);
  });

  it('la copie ne contient que userId, date et requêtes : ni jeton ni session', () => {
    const client = new QueryClient();
    client.setQueryData(['me'], { name: 'Test' });
    saveQueryCache(client, 'u-1');
    const saved = JSON.parse(storage.getItem(KEY) ?? '{}');
    expect(Object.keys(saved).sort()).toEqual(['savedAt', 'state', 'userId', 'v']);
    expect(Object.keys(saved.state).sort()).toEqual(['mutations', 'queries']);
    expect(saved.state.mutations).toEqual([]);
  });

  it('une très grosse réponse ne fait pas dépasser le budget et n’empêche pas les autres', () => {
    const client = new QueryClient();
    client.setQueryData(['small'], { a: 1 });
    client.setQueryData(['huge'], { blob: 'x'.repeat(QUERY_CACHE_MAX_BYTES + 10) });
    saveQueryCache(client, 'u-1');
    const raw = storage.getItem(KEY) ?? '';
    expect(raw.length).toBeLessThan(QUERY_CACHE_MAX_BYTES);
    expect(raw).toContain('small');
  });
});
