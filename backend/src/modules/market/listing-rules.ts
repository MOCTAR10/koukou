import { BatchStatus, BatchType } from '../../common/enums/batch-type.enum.js';
import {
  MarketHiddenReason,
  MarketListingKind,
  MarketListingStatus,
  MarketProduct,
} from '../../common/enums/market.enum.js';

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Whether a lot's sanitary state stops it being sold on the Market. A
 * pre-order is delivered on its ready date, so only a withdrawal period still
 * running then matters: overdue care can be caught up before that. Carcasses
 * were already slaughtered, and slaughter itself refuses a lot on hold: what
 * happens to the live birds afterwards can't reach them.
 */
export function blockedBySanitaryHold(
  listing: {
    kind: MarketListingKind;
    product: MarketProduct;
    readyDate: string | null;
  },
  holds: { withdrawalEndDate: string | null; prophylaxisOverdue: boolean },
): boolean {
  if (listing.product === MarketProduct.CARCASS) return false;
  if (listing.kind === MarketListingKind.PRE) {
    return (
      holds.withdrawalEndDate != null &&
      listing.readyDate != null &&
      holds.withdrawalEndDate >= listing.readyDate
    );
  }
  return holds.withdrawalEndDate != null || holds.prophylaxisOverdue;
}

/** Why a listing can't be seen in the catalogue, or null when it can. */
export function hiddenReason(input: {
  listing: {
    kind: MarketListingKind;
    product: MarketProduct;
    status: MarketListingStatus;
    readyDate: string | null;
  };
  /** `operational`: programme status of the OPERATIONNELLE family (POUFA). */
  farm: { active: boolean; isVerified: boolean; operational: boolean };
  batchStatus: BatchStatus;
  holds: { withdrawalEndDate: string | null; prophylaxisOverdue: boolean };
  availableQuantity: number;
  today: string;
}): MarketHiddenReason | null {
  const { listing, farm, batchStatus, holds, availableQuantity, today } = input;
  if (listing.status !== MarketListingStatus.PUBLISHED) {
    return MarketHiddenReason.NOT_PUBLISHED;
  }
  if (!farm.active) return MarketHiddenReason.FARM_SUSPENDED;
  if (!farm.isVerified) return MarketHiddenReason.FARM_NOT_VERIFIED;
  if (!farm.operational) return MarketHiddenReason.FARM_NOT_OPERATIONAL;
  // A lot often ends by being slaughtered: its carcasses remain for sale.
  if (
    listing.product !== MarketProduct.CARCASS &&
    (batchStatus === BatchStatus.CLOTURE || batchStatus === BatchStatus.FINI)
  ) {
    return MarketHiddenReason.LOT_ENDED;
  }
  if (
    listing.kind === MarketListingKind.PRE &&
    listing.readyDate != null &&
    listing.readyDate < today
  ) {
    return MarketHiddenReason.DATE_PASSED;
  }
  if (blockedBySanitaryHold(listing, holds)) return MarketHiddenReason.SANITARY;
  if (availableQuantity <= 0) return MarketHiddenReason.OUT_OF_STOCK;
  return null;
}

export type ReadyDateSource = 'BREED_CURVE' | 'MIN_AGE';

/**
 * Suggests when a meat lot will be ready. It is only a suggestion: the farm
 * picks the date. With a target weight it reads the breed's curve, and a curve
 * that never reaches the weight (or a custom breed with no curve) gives no
 * answer rather than a made-up one. Week N of a curve ends at day 7 x N.
 */
export function suggestReadyDate(input: {
  batchType: BatchType;
  integrationDate: string;
  /** Age of the birds at integration (POUFA J+x opening); 0 by default. */
  initialAgeDays?: number | null;
  minAgeDays: number;
  standards: { week: number; targetAvgWeightKg: number | null }[];
  targetWeightKg?: number;
  withdrawalEndDate: string | null;
  today: string;
}): { readyDate: string; source: ReadyDateSource } | null {
  if (input.batchType !== BatchType.CHAIR) return null;

  let ageDays = input.minAgeDays;
  let source: ReadyDateSource = 'MIN_AGE';
  if (input.targetWeightKg != null) {
    const reached = [...input.standards]
      .sort((a, b) => a.week - b.week)
      .find(
        (s) =>
          s.targetAvgWeightKg != null &&
          s.targetAvgWeightKg >= input.targetWeightKg!,
      );
    if (!reached) return null;
    ageDays = reached.week * 7;
    source = 'BREED_CURVE';
  }

  // An age N is reached N days after J0 (integration minus the J+x offset).
  let readyDate = addDays(
    input.integrationDate,
    ageDays - (input.initialAgeDays ?? 0),
  );
  if (input.withdrawalEndDate != null) {
    const afterWithdrawal = addDays(input.withdrawalEndDate, 1);
    if (afterWithdrawal > readyDate) readyDate = afterWithdrawal;
  }
  const tomorrow = addDays(input.today, 1);
  if (readyDate < tomorrow) readyDate = tomorrow;
  return { readyDate, source };
}
