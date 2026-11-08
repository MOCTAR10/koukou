import type { PilotageView } from './pilotage-scope.service.js';

/** Small in-memory TTL cache with a bounded size (oldest entry evicted first). */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    // Re-inserting moves the key to the end of the insertion order.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Cache key of a dashboard: the view (programme, kind, aggregate-only flag and
 * the user's whole institutional perimeter: membership, profile, scope kind,
 * provinces, farms, operator), the filters, the period and the day. Two
 * viewers with a different perimeter never share an entry.
 */
export function dashboardCacheKey(
  view: PilotageView,
  query: {
    from?: string;
    to?: string;
    province?: string;
    cohort?: string;
    status?: string;
  },
  today: string,
): string {
  const a = view.access;
  return JSON.stringify([
    view.programId,
    view.kind,
    view.aggregateOnly,
    a
      ? [
          a.membershipId,
          a.userId,
          a.profileId,
          a.scopeKind,
          [...a.provinceIds].sort(),
          [...a.farmIds].sort(),
          a.operatorId,
        ]
      : null,
    [
      query.from ?? null,
      query.to ?? null,
      query.province ?? null,
      query.cohort ?? null,
      query.status ?? null,
    ],
    today,
  ]);
}
