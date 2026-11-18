import { describe, expect, it } from 'vitest';
import { deriveDailyFeedG } from './derive-daily-feed.js';

describe('deriveDailyFeedG', () => {
  it('derives grams per bird per day from weight x cumulative FCR', () => {
    const out = deriveDailyFeedG([
      { week: 1, targetAvgWeightKg: 0.18, targetFcr: 0.85 },
      { week: 2, targetAvgWeightKg: 0.45, targetFcr: 1.19 },
    ]);
    // week 1: 0.153 kg / 7 d = 21.857 g; week 2: (0.5355 - 0.153) / 7 = 54.64 g
    expect(out[0]).toBeCloseTo(21.9, 1);
    expect(out[1]).toBeCloseTo(54.6, 1);
  });

  it('is null without weight or FCR, and for the week after a gap', () => {
    const out = deriveDailyFeedG([
      { week: 1, targetAvgWeightKg: null, targetFcr: null },
      { week: 2, targetAvgWeightKg: 0.45, targetFcr: 1.19 },
      { week: 3, targetAvgWeightKg: 0.8, targetFcr: 1.42 },
    ]);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).not.toBeNull();
  });

  it('is null when the cumulative feed does not grow', () => {
    const out = deriveDailyFeedG([
      { week: 1, targetAvgWeightKg: 1, targetFcr: 2 },
      { week: 2, targetAvgWeightKg: 1, targetFcr: 1.5 },
    ]);
    expect(out[0]).not.toBeNull();
    expect(out[1]).toBeNull();
  });

  it('keeps the input order whatever the week order', () => {
    const out = deriveDailyFeedG([
      { week: 2, targetAvgWeightKg: 0.45, targetFcr: 1.19 },
      { week: 1, targetAvgWeightKg: 0.18, targetFcr: 0.85 },
    ]);
    expect(out[0]).toBeCloseTo(54.6, 1);
    expect(out[1]).toBeCloseTo(21.9, 1);
  });
});
