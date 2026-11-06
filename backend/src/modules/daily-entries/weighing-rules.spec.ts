import { describe, expect, it } from 'vitest';
import {
  WEIGHING_SAMPLE_REQUIRED_MESSAGE,
  weighingSampleRefusal,
} from './weighing-rules.js';

describe('weighingSampleRefusal (n° 8)', () => {
  it('refuses a new weight without sample', () => {
    expect(weighingSampleRefusal({ avgWeightKg: 1.2 }, null)).toBe(
      WEIGHING_SAMPLE_REQUIRED_MESSAGE,
    );
    expect(weighingSampleRefusal({ avgWeightKg: 1.2, sampleSize: null }, null)).not.toBeNull();
  });
  it('accepts a weight with a sample, or none sent', () => {
    expect(weighingSampleRefusal({ avgWeightKg: 1.2, sampleSize: 30 }, null)).toBeNull();
    expect(weighingSampleRefusal({ deaths: 2 } as never, null)).toBeNull();
    expect(weighingSampleRefusal({ avgWeightKg: null }, null)).toBeNull();
  });
  it('keeps the stored sample on a weight correction, leaves an unchanged legacy weight', () => {
    expect(
      weighingSampleRefusal({ avgWeightKg: 1.3 }, { avgWeightKg: 1.2, sampleSize: 20 }),
    ).toBeNull();
    expect(
      weighingSampleRefusal({ avgWeightKg: 1.2 }, { avgWeightKg: 1.2, sampleSize: null }),
    ).toBeNull();
    expect(
      weighingSampleRefusal({ avgWeightKg: 1.3 }, { avgWeightKg: 1.2, sampleSize: null }),
    ).not.toBeNull();
  });
});
