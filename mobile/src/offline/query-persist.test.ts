import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import { clearSession } from '@/api/token';

import {
  QUERY_CACHE_MAX_AGE_MS,
  QUERY_CACHE_VERSION,
  clearQueryCache,
  restoreQueryCache,
  saveQueryCache,
} from './query-persist';
import { storage } from './storage';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { hostUri: '192.168.1.10:8081' } },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}));

const KEY = (userId: string) => `koukou.qcache.${userId}`;

function clientWith(data: Record<string, unknown>): QueryClient {
  const client = new QueryClient();
  for (const [k, v] of Object.entries(data)) client.setQueryData(['t', k], v);
  return client;
}

beforeEach(() => {
  clearSession();
  storage.removeItem(KEY('u-1'));
  storage.removeItem(KEY('u-2'));
});

describe('query-persist', () => {
  it('sauvegarde puis restaure pour le même compte', () => {
    saveQueryCache(clientWith({ dashboard: { birds: 120 } }), 'u-1');
    const fresh = new QueryClient();
    expect(restoreQueryCache(fresh, 'u-1')).toBe(true);
    expect(fresh.getQueryData(['t', 'dashboard'])).toEqual({ birds: 120 });
  });

  it('ne restaure pas la copie d’un autre compte', () => {
    saveQueryCache(clientWith({ dashboard: { birds: 120 } }), 'u-1');
    const fresh = new QueryClient();
    expect(restoreQueryCache(fresh, 'u-2')).toBe(false);
    expect(fresh.getQueryData(['t', 'dashboard'])).toBeUndefined();
    // Même une copie recopiée sous la clé d’un autre compte est refusée.
    storage.setItem(KEY('u-2'), storage.getItem(KEY('u-1')) ?? '');
    expect(restoreQueryCache(fresh, 'u-2')).toBe(false);
    expect(storage.getItem(KEY('u-2'))).toBeNull();
  });

  it('ignore et supprime une copie expirée', () => {
    const savedAt = new Date('2026-11-01T08:00:00Z');
    saveQueryCache(clientWith({ a: 1 }), 'u-1', savedAt);
    const fresh = new QueryClient();
    const late = new Date(savedAt.getTime() + QUERY_CACHE_MAX_AGE_MS + 1000);
    expect(restoreQueryCache(fresh, 'u-1', late)).toBe(false);
    expect(storage.getItem(KEY('u-1'))).toBeNull();
  });

  it('restaure une copie encore dans la limite des 7 jours', () => {
    const savedAt = new Date('2026-11-01T08:00:00Z');
    saveQueryCache(clientWith({ a: 1 }), 'u-1', savedAt);
    const fresh = new QueryClient();
    const soon = new Date(savedAt.getTime() + QUERY_CACHE_MAX_AGE_MS - 1000);
    expect(restoreQueryCache(fresh, 'u-1', soon)).toBe(true);
  });

  it('ignore et supprime une copie corrompue', () => {
    storage.setItem(KEY('u-1'), '{pas du json');
    const fresh = new QueryClient();
    expect(restoreQueryCache(fresh, 'u-1')).toBe(false);
    expect(storage.getItem(KEY('u-1'))).toBeNull();
  });

  it('ignore une copie d’une autre version', () => {
    saveQueryCache(clientWith({ a: 1 }), 'u-1');
    const parsed = JSON.parse(storage.getItem(KEY('u-1')) ?? '{}') as { v: number };
    storage.setItem(KEY('u-1'), JSON.stringify({ ...parsed, v: QUERY_CACHE_VERSION + 1 }));
    expect(restoreQueryCache(new QueryClient(), 'u-1')).toBe(false);
    expect(storage.getItem(KEY('u-1'))).toBeNull();
  });

  it('la déconnexion supprime la copie', () => {
    saveQueryCache(clientWith({ a: 1 }), 'u-1');
    expect(storage.getItem(KEY('u-1'))).not.toBeNull();
    clearQueryCache('u-1');
    expect(storage.getItem(KEY('u-1'))).toBeNull();
    expect(restoreQueryCache(new QueryClient(), 'u-1')).toBe(false);
  });

  it('un cache vide n’efface pas une bonne copie', () => {
    saveQueryCache(clientWith({ a: 1 }), 'u-1');
    saveQueryCache(new QueryClient(), 'u-1');
    expect(restoreQueryCache(new QueryClient(), 'u-1')).toBe(true);
  });

  it('écarte les plus anciennes réponses au-delà de 4 Mo', () => {
    const client = new QueryClient();
    const big = 'x'.repeat(1_500_000);
    client.setQueryData(['t', 'old'], big, { updatedAt: 1_000 });
    client.setQueryData(['t', 'mid'], big, { updatedAt: 2_000 });
    client.setQueryData(['t', 'new'], big, { updatedAt: 3_000 });
    saveQueryCache(client, 'u-1');
    const fresh = new QueryClient();
    expect(restoreQueryCache(fresh, 'u-1')).toBe(true);
    expect(fresh.getQueryData(['t', 'new'])).toBe(big);
    expect(fresh.getQueryData(['t', 'mid'])).toBe(big);
    expect(fresh.getQueryData(['t', 'old'])).toBeUndefined();
  });
});
