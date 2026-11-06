import { describe, expect, it } from 'vitest';
import { dailyEntryBase, withCaptureMeta, withSendTime } from './syncMeta';

describe('dailyEntryBase', () => {
  it('sends nothing for a new entry', () => {
    expect(dailyEntryBase(null)).toEqual({});
    expect(dailyEntryBase(undefined)).toEqual({});
  });

  it('sends the record the form was opened on, every field, null when empty', () => {
    const base = dailyEntryBase({ updatedAt: '2026-11-05T07:00:00.000Z', deaths: 2, feedQuantity: 50, avgWeightKg: 0.45, sampleSize: 30 });
    expect(base.baseUpdatedAt).toBe('2026-11-05T07:00:00.000Z');
    expect(base.baseValues).toMatchObject({ deaths: 2, feedQuantity: 50, avgWeightKg: 0.45, sampleSize: 30, waterL: null, eggsCollected: null });
    expect(Object.keys(base.baseValues ?? {})).toHaveLength(11);
  });

  it('omits baseUpdatedAt when the server gave none', () => {
    expect(dailyEntryBase({ deaths: 1 })).not.toHaveProperty('baseUpdatedAt');
  });
});

describe('capture and send times', () => {
  it('adds the capture time and the device, the body winning', () => {
    expect(withCaptureMeta({ deaths: 1 }, '2026-11-05T08:00:00.000Z', 'web-a')).toEqual({
      capturedAt: '2026-11-05T08:00:00.000Z',
      deviceId: 'web-a',
      deaths: 1,
    });
    expect(withCaptureMeta({ capturedAt: 'x' }, 'y', 'web-a')).toMatchObject({ capturedAt: 'x' });
  });

  it('stamps the device clock at each sending', () => {
    const now = new Date('2026-11-05T09:30:00.000Z');
    expect(withSendTime({ deaths: 1 }, now)).toEqual({ deaths: 1, deviceSentAt: '2026-11-05T09:30:00.000Z' });
  });
});
