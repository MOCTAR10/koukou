import { describe, expect, it } from 'vitest';
import { dashboardCacheKey, TtlCache } from './pilotage-cache.js';
import type { PilotageView } from './pilotage-scope.service.js';

const view = (over: Record<string, unknown> = {}, aggregateOnly = false) =>
  ({
    programId: 'p',
    kind: 'PROVINCES',
    aggregateOnly,
    access: {
      membershipId: 'm1',
      userId: 'u1',
      programId: 'p',
      profileId: 'prof',
      profileCode: 'X',
      profileLabel: 'X',
      scopeKind: 'PROVINCES',
      matrix: {},
      provinceIds: ['a'],
      farmIds: [],
      operatorId: null,
      ...over,
    },
  }) as unknown as PilotageView;

describe('dashboardCacheKey', () => {
  it('differs when the perimeter differs', () => {
    const q = { from: '2026-01-01' };
    const k1 = dashboardCacheKey(view(), q, '2026-11-08');
    expect(dashboardCacheKey(view({ provinceIds: ['b'] }), q, '2026-11-08')).not.toBe(k1);
    expect(dashboardCacheKey(view({ userId: 'u2' }), q, '2026-11-08')).not.toBe(k1);
    expect(dashboardCacheKey(view({}, true), q, '2026-11-08')).not.toBe(k1);
    expect(dashboardCacheKey(view(), { ...q, cohort: 'C1' }, '2026-11-08')).not.toBe(k1);
    expect(dashboardCacheKey(view(), q, '2026-11-08')).toBe(k1);
  });

  it('does not depend on the order of the scope ids', () => {
    const a = dashboardCacheKey(view({ provinceIds: ['a', 'b'] }), {}, 'd');
    const b = dashboardCacheKey(view({ provinceIds: ['b', 'a'] }), {}, 'd');
    expect(a).toBe(b);
  });
});

describe('TtlCache', () => {
  it('expires entries after the TTL', () => {
    let t = 0;
    const c = new TtlCache<number>(60_000, 10, () => t);
    c.set('k', 1);
    t = 59_999;
    expect(c.get('k')).toBe(1);
    t = 60_000;
    expect(c.get('k')).toBeUndefined();
  });

  it('evicts the oldest entries beyond the bound', () => {
    const c = new TtlCache<number>(60_000, 2, () => 0);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.size).toBe(2);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('c')).toBe(3);
  });
});
