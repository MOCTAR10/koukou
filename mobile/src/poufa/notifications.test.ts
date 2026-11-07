import { describe, expect, it } from 'vitest';

import type { InboxItem } from '@/api/poufa';
import { badgeLabel, markReadLocally, mobileRouteOf, relativeTime, unreadOf } from './notifications';

const F = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const N = '33333333-3333-4333-8333-333333333333';

describe('badgeLabel', () => {
  it('rien à 0, 99+ au-delà', () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(undefined)).toBeNull();
    expect(badgeLabel(7)).toBe('7');
    expect(badgeLabel(120)).toBe('99+');
  });
});

describe('mobileRouteOf', () => {
  it('routes du serveur vers les écrans mobiles', () => {
    expect(mobileRouteOf('/alerts')).toBe('/alerts');
    expect(mobileRouteOf('/(tabs)/alerts')).toBe('/alerts');
    expect(mobileRouteOf('/tasks')).toBe('/tasks');
    expect(mobileRouteOf('/sync')).toBe('/menu');
    expect(mobileRouteOf(`/notifications/${N}`)).toBe(`/notifications/${N}`);
    expect(mobileRouteOf(`/sanitary-alerts/${N}`)).toBe('/sanitary?tab=alertes');
    expect(mobileRouteOf(`/farms/${F}/batches/${B}/health-events`)).toBe(`/sanitary?lot=${B}&tab=maladies`);
    expect(mobileRouteOf(`/farms/${F}/visits`)).toBe('/visites');
    expect(mobileRouteOf(`/batches/${B}`)).toBe(`/lot/${B}`);
  });

  it('routes des rappels locaux gardées', () => {
    expect(mobileRouteOf('/(tabs)')).toBe('/');
    expect(mobileRouteOf('/sanitary')).toBe('/sanitary');
    expect(mobileRouteOf(`/lot/${B}`)).toBe(`/lot/${B}`);
    expect(mobileRouteOf('/(tabs)/lots')).toBe('/lots');
  });

  it('route inconnue ou douteuse : la boîte de réception', () => {
    expect(mobileRouteOf('')).toBe('/notifications');
    expect(mobileRouteOf(null)).toBe('/notifications');
    expect(mobileRouteOf('https://exemple.org')).toBe('/notifications');
    expect(mobileRouteOf('//exemple.org')).toBe('/notifications');
    expect(mobileRouteOf('/admin/users')).toBe('/notifications');
  });
});

describe('lecture locale', () => {
  const item = (id: string, readAt: string | null): InboxItem => ({
    id,
    event: 'ALERTE',
    severity: 'ROUGE',
    title: 't',
    body: 'b',
    farmId: null,
    subjectId: null,
    route: '/alerts',
    status: 'ENVOYEE',
    createdAt: '2026-11-06T08:00:00.000Z',
    readAt,
  });

  it('marque une seule notification et compte les non lues', () => {
    const items = [item('a', null), item('b', null), item('c', '2026-11-05T00:00:00.000Z')];
    const next = markReadLocally(items, 'a', '2026-11-06T09:00:00.000Z');
    expect(next[0].readAt).toBe('2026-11-06T09:00:00.000Z');
    expect(next[2].readAt).toBe('2026-11-05T00:00:00.000Z');
    expect(unreadOf(next)).toBe(1);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-11-06T12:00:00.000Z');
  it('libellés courts', () => {
    expect(relativeTime('2026-11-06T11:59:40.000Z', now)).toBe('à l’instant');
    expect(relativeTime('2026-11-06T11:55:00.000Z', now)).toBe('il y a 5 min');
    expect(relativeTime('2026-11-06T09:00:00.000Z', now)).toBe('il y a 3 h');
    expect(relativeTime('2026-11-05T11:00:00.000Z', now)).toBe('hier');
    expect(relativeTime('2026-11-02T11:00:00.000Z', now)).toBe('il y a 4 j');
    expect(relativeTime('pas une date', now)).toBe('');
  });
});
