import { describe, expect, it } from 'vitest';
import { effectiveCapture } from '../sync/conflict-rules.js';
import { utcDay } from './delivery-day.js';

describe('delivery day of an order', () => {
  const serverNow = new Date('2026-11-06T10:00:00Z');

  it('keeps the device capture of an offline delivery', () => {
    const c = effectiveCapture({
      capturedAt: new Date('2026-11-03T17:30:00Z'),
      deviceSentAt: new Date('2026-11-06T10:00:05Z'),
      serverNow,
      thresholdMs: 300_000,
    });
    expect(utcDay(c.capturedAt)).toBe('2026-11-03');
  });

  it('corrects a phone clock that is days ahead', () => {
    const c = effectiveCapture({
      capturedAt: new Date('2026-11-08T09:00:00Z'),
      deviceSentAt: new Date('2026-11-09T10:00:00Z'),
      serverNow,
      thresholdMs: 300_000,
    });
    expect(utcDay(c.capturedAt)).toBe('2026-11-05');
    expect(c.corrected).toBe(true);
  });

  it('a live delivery (no capture) is today, read in UTC', () => {
    const c = effectiveCapture({ capturedAt: null, deviceSentAt: null, serverNow, thresholdMs: 300_000 });
    expect(utcDay(c.capturedAt)).toBe('2026-11-06');
    expect(utcDay(new Date('2026-11-03T23:30:00-01:00'))).toBe('2026-11-04');
  });
});
