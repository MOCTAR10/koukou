import { describe, expect, it } from 'vitest';
import {
  effectiveCapture,
  resolveFields,
  type FieldWriteMeta,
  type IncomingWrite,
  type ServerField,
} from './conflict-rules.js';

const now = new Date('2026-11-05T12:00:00Z');
const min = (n: number) => new Date(now.getTime() + n * 60_000);

describe('effectiveCapture', () => {
  it('keeps the phone time within the threshold', () => {
    const c = effectiveCapture({
      capturedAt: min(-30),
      deviceSentAt: min(2),
      serverNow: now,
      thresholdMs: 5 * 60_000,
    });
    expect(c).toMatchObject({ skewMs: 120_000, corrected: false });
    expect(c.capturedAt).toEqual(min(-30));
  });

  it('shifts the capture by the skew beyond the threshold', () => {
    const c = effectiveCapture({
      capturedAt: min(60),
      deviceSentAt: min(90),
      serverNow: now,
      thresholdMs: 5 * 60_000,
    });
    expect(c.corrected).toBe(true);
    expect(c.capturedAt).toEqual(min(-30));
    expect(c.raw).toEqual(min(60));
  });

  it('never dates a capture in the future', () => {
    const c = effectiveCapture({
      capturedAt: min(120),
      deviceSentAt: null,
      serverNow: now,
      thresholdMs: 5 * 60_000,
    });
    expect(c.capturedAt).toEqual(now);
    expect(c.corrected).toBe(true);
  });

  it('uses the server time for a live write', () => {
    const c = effectiveCapture({
      capturedAt: null,
      deviceSentAt: null,
      serverNow: now,
      thresholdMs: 0,
    });
    expect(c).toMatchObject({ capturedAt: now, raw: null, skewMs: null });
  });
});

describe('resolveFields', () => {
  const meta = (over: Partial<FieldWriteMeta> = {}): FieldWriteMeta => ({
    capturedAt: min(-60).toISOString(),
    updatedAt: min(-10).toISOString(),
    userId: 'agent',
    deviceId: 'tablet',
    ...over,
  });
  const server: Record<string, ServerField> = {
    deaths: { value: 5, meta: meta() },
    waterL: { value: 100, meta: meta({ updatedAt: min(-300).toISOString() }) },
  };
  const write = (over: Partial<IncomingWrite> = {}): IncomingWrite => ({
    values: { deaths: 0, waterL: 120 },
    baseUpdatedAt: min(-120),
    capturedAt: min(-30),
    userId: 'farmer',
    deviceId: 'phone',
    ...over,
  });
  const by = (decisions: ReturnType<typeof resolveFields>) =>
    Object.fromEntries(decisions.map((d) => [d.field, d]));

  it('applies everything when the record is new', () => {
    const d = by(resolveFields(null, write()));
    expect(d.deaths.action).toBe('apply');
    expect(d.waterL.action).toBe('apply');
  });

  it('lets the later capture win a field changed on both sides', () => {
    const d = by(resolveFields(server, write()));
    // deaths: changed on the server after the phone's base, phone captured later.
    expect(d.deaths).toMatchObject({ action: 'apply', conflict: true, serverValue: 5 });
    // waterL: unchanged on the server since the base.
    expect(d.waterL).toMatchObject({ action: 'apply', conflict: false });
  });

  it('keeps the server value when its capture is later', () => {
    const d = by(resolveFields(server, write({ capturedAt: min(-90) })));
    expect(d.deaths).toMatchObject({ action: 'keep-server', conflict: true });
  });

  it('does not write a field the phone left as it was (resent zeros)', () => {
    const d = by(
      resolveFields(server, write({ baseValues: { deaths: 0, waterL: 100 } })),
    );
    expect(d.deaths).toMatchObject({ action: 'unchanged', conflict: false });
    expect(d.waterL.action).toBe('apply');
  });

  it('is no conflict when both sides wrote the same value or the same device wrote', () => {
    const same = by(resolveFields(server, write({ values: { deaths: 5 } })));
    expect(same.deaths).toMatchObject({ action: 'apply', conflict: false });
    const own = by(resolveFields(server, write({ deviceId: 'tablet' })));
    expect(own.deaths).toMatchObject({ action: 'apply', conflict: false });
  });

  it('treats an offline creation meeting an existing record as concurrent', () => {
    const d = by(resolveFields(server, write({ baseUpdatedAt: null, capturedAt: min(-120) })));
    expect(d.deaths).toMatchObject({ action: 'keep-server', conflict: true });
    expect(d.waterL).toMatchObject({ action: 'keep-server', conflict: true });
  });
});
