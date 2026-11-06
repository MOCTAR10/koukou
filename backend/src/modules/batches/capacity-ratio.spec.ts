import { describe, expect, it } from 'vitest';
import { moduleRatioVsCapacity, referenceCapacity } from './capacity-ratio.js';

describe('referenceCapacity', () => {
  it('prefers the building, then the per-building capacity, then the registry', () => {
    expect(
      referenceCapacity({
        buildingCapacity: 800,
        capacityPerBuilding: 1500,
        capacityPlaces: 5000,
      }),
    ).toBe(800);
    expect(
      referenceCapacity({ capacityPerBuilding: 1500, capacityPlaces: 5000 }),
    ).toBe(1500);
    expect(
      referenceCapacity({
        buildingCapacity: null,
        capacityPerBuilding: null,
        capacityPlaces: 5000,
      }),
    ).toBe(5000);
  });

  it('skips zero or missing values', () => {
    expect(
      referenceCapacity({ buildingCapacity: 0, capacityPlaces: 2000 }),
    ).toBe(2000);
    expect(referenceCapacity({})).toBeNull();
    expect(referenceCapacity({ capacityPlaces: 0 })).toBeNull();
  });
});

describe('moduleRatioVsCapacity', () => {
  it('divides the start headcount by the capacity', () => {
    expect(moduleRatioVsCapacity(2400, 1500)).toBeCloseTo(1.6, 3);
    expect(moduleRatioVsCapacity(2400, null)).toBeNull();
  });
});
