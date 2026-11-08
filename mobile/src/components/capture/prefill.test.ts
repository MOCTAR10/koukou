import { describe, expect, it } from 'vitest';

import { hasUserInput, shouldApplyPrefill } from './prefill';

const baseline = { deaths: 0, feedKg: 0, feedPhase: null as string | null, skip: false };

describe('hasUserInput', () => {
  it('is false for the untouched baseline', () => {
    expect(hasUserInput({ ...baseline }, baseline)).toBe(false);
  });
  it('is true as soon as a field differs', () => {
    expect(hasUserInput({ ...baseline, deaths: 3 }, baseline)).toBe(true);
    expect(hasUserInput({ ...baseline, feedPhase: 'GROWER' }, baseline)).toBe(true);
    expect(hasUserInput({ ...baseline, skip: true }, baseline)).toBe(true);
  });
});

describe('shouldApplyPrefill', () => {
  it('fills a fresh, empty form', () => {
    expect(shouldApplyPrefill({ alreadyPrefilledStamp: null, stamp: 'l1|d1', dirty: false })).toBe(true);
  });
  it('does not overwrite what the user typed before the data arrived', () => {
    expect(shouldApplyPrefill({ alreadyPrefilledStamp: null, stamp: 'l1|d1', dirty: true })).toBe(false);
  });
  it('does not re-apply the same lot+date', () => {
    expect(shouldApplyPrefill({ alreadyPrefilledStamp: 'l1|d1', stamp: 'l1|d1', dirty: false })).toBe(false);
  });
  it('reloads when the user switches date or lot', () => {
    expect(shouldApplyPrefill({ alreadyPrefilledStamp: 'l1|d1', stamp: 'l1|d2', dirty: true })).toBe(true);
  });
});
