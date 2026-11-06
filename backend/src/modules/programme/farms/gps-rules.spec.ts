import { describe, expect, it } from 'vitest';
import { gpsIdempotencyKey, staleGpsMessage } from './gps-rules.js';

describe('staleGpsMessage (A8)', () => {
  const current = new Date('2026-11-05T10:00:00Z');

  it('applies a fix without a current point', () => {
    expect(staleGpsMessage(new Date('2026-01-01T00:00:00Z'), null)).toBeNull();
  });

  it('applies a fix taken at or after the current point', () => {
    expect(staleGpsMessage(current, current)).toBeNull();
    expect(
      staleGpsMessage(new Date('2026-11-06T08:00:00Z'), current),
    ).toBeNull();
  });

  it('ignores an older fix with a French message naming both dates', () => {
    const message = staleGpsMessage(new Date('2026-11-04T09:30:00Z'), current);
    expect(message).toMatch(/^Relevé GPS du 04\/11\/2026 10:30 ignoré/);
    expect(message).toContain('05/11/2026 11:00');
    expect(message).toContain('conservé');
  });
});

describe('gpsIdempotencyKey', () => {
  it('trims and drops empty keys', () => {
    expect(gpsIdempotencyKey('  op-1 ')).toBe('op-1');
    expect(gpsIdempotencyKey('   ')).toBeNull();
    expect(gpsIdempotencyKey(undefined)).toBeNull();
  });
});
