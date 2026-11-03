import { describe, expect, it } from 'vitest';
import { BatchStatus, BatchType } from '../../common/enums/batch-type.enum.js';
import {
  MarketHiddenReason,
  MarketListingKind,
  MarketListingStatus,
} from '../../common/enums/market.enum.js';
import {
  blockedBySanitaryHold,
  hiddenReason,
  suggestReadyDate,
} from './listing-rules.js';

const NO_HOLDS = { withdrawalEndDate: null, prophylaxisOverdue: false };
const TODAY = '2026-11-03';

describe('blockedBySanitaryHold', () => {
  const pre = { kind: MarketListingKind.PRE, readyDate: '2026-11-20' };
  const now = { kind: MarketListingKind.NOW, readyDate: null };

  it('blocks a sale today during any hold', () => {
    expect(blockedBySanitaryHold(now, NO_HOLDS)).toBe(false);
    expect(
      blockedBySanitaryHold(now, { ...NO_HOLDS, withdrawalEndDate: '2026-11-05' }),
    ).toBe(true);
    expect(
      blockedBySanitaryHold(now, { ...NO_HOLDS, prophylaxisOverdue: true }),
    ).toBe(true);
  });

  it('blocks a pre-order only if the withdrawal reaches the ready date', () => {
    expect(
      blockedBySanitaryHold(pre, { ...NO_HOLDS, withdrawalEndDate: '2026-11-19' }),
    ).toBe(false);
    expect(
      blockedBySanitaryHold(pre, { ...NO_HOLDS, withdrawalEndDate: '2026-11-20' }),
    ).toBe(true);
  });

  it('lets a pre-order through with overdue care', () => {
    expect(
      blockedBySanitaryHold(pre, { ...NO_HOLDS, prophylaxisOverdue: true }),
    ).toBe(false);
  });
});

describe('hiddenReason', () => {
  const visible = {
    listing: {
      kind: MarketListingKind.PRE,
      status: MarketListingStatus.PUBLISHED,
      readyDate: '2026-11-20',
    },
    farm: { active: true, isVerified: true },
    batchStatus: BatchStatus.ACTIF,
    holds: NO_HOLDS,
    availableQuantity: 10,
    today: TODAY,
  };

  it('shows a published listing with stock', () => {
    expect(hiddenReason(visible)).toBeNull();
  });

  it('keeps a pre-order on its ready date, not after', () => {
    expect(hiddenReason({ ...visible, today: '2026-11-20' })).toBeNull();
    expect(hiddenReason({ ...visible, today: '2026-11-21' })).toBe(
      MarketHiddenReason.DATE_PASSED,
    );
  });

  it.each([
    [
      { listing: { ...visible.listing, status: MarketListingStatus.PAUSED } },
      MarketHiddenReason.NOT_PUBLISHED,
    ],
    [
      { farm: { active: false, isVerified: true } },
      MarketHiddenReason.FARM_SUSPENDED,
    ],
    [
      { farm: { active: true, isVerified: false } },
      MarketHiddenReason.FARM_NOT_VERIFIED,
    ],
    [{ batchStatus: BatchStatus.FINI }, MarketHiddenReason.LOT_ENDED],
    [{ batchStatus: BatchStatus.CLOTURE }, MarketHiddenReason.LOT_ENDED],
    [
      { holds: { ...NO_HOLDS, withdrawalEndDate: '2026-12-01' } },
      MarketHiddenReason.SANITARY,
    ],
    [{ availableQuantity: 0 }, MarketHiddenReason.OUT_OF_STOCK],
  ])('hides it: %j', (over, reason) => {
    expect(hiddenReason({ ...visible, ...over })).toBe(reason);
  });
});

describe('suggestReadyDate', () => {
  const base = {
    batchType: BatchType.CHAIR,
    integrationDate: '2026-11-01',
    minAgeDays: 35,
    standards: [
      { week: 5, targetAvgWeightKg: 1.8 },
      { week: 6, targetAvgWeightKg: 2.3 },
      { week: 4, targetAvgWeightKg: 1.2 },
    ],
    withdrawalEndDate: null,
    today: TODAY,
  };

  it('uses the minimum sale age by default', () => {
    expect(suggestReadyDate(base)).toEqual({
      readyDate: '2026-12-06',
      source: 'MIN_AGE',
    });
  });

  it('reads the curve for a target weight, whatever the row order', () => {
    expect(suggestReadyDate({ ...base, targetWeightKg: 2 })).toEqual({
      readyDate: '2026-12-13',
      source: 'BREED_CURVE',
    });
  });

  it('gives no date when the curve cannot answer', () => {
    expect(suggestReadyDate({ ...base, targetWeightKg: 3 })).toBeNull();
    expect(
      suggestReadyDate({ ...base, standards: [], targetWeightKg: 2 }),
    ).toBeNull();
  });

  it('suggests nothing for layers', () => {
    expect(
      suggestReadyDate({ ...base, batchType: BatchType.PONDEUSE }),
    ).toBeNull();
  });

  it('waits for the end of a withdrawal period', () => {
    expect(
      suggestReadyDate({ ...base, withdrawalEndDate: '2026-12-20' })?.readyDate,
    ).toBe('2026-12-21');
  });

  it('never suggests today or the past', () => {
    expect(
      suggestReadyDate({ ...base, integrationDate: '2026-08-01' })?.readyDate,
    ).toBe('2026-11-04');
  });
});
