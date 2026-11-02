import type { BreedStandard } from '../../api/types-flock';

export interface FeedRecommendation {
  perBirdG: number | null;
  totalKgPerDay: number | null;
  referenceWeightKg: number | null;
  week: number | null;
  kind: 'fcr' | 'weight' | 'none';
}

export function ageWeek(ageDays: number): number {
  return Math.max(1, Math.floor(ageDays / 7) + 1);
}

function closestStandard(standards: BreedStandard[], week: number): BreedStandard | null {
  if (standards.length === 0) return null;
  const exact = standards.find((s) => s.week === week);
  if (exact) return exact;
  const prior = [...standards].reverse().find((s) => s.week <= week);
  if (prior) return prior;
  return standards.reduce((a, b) => (Math.abs(a.week - week) < Math.abs(b.week - week) ? a : b));
}

/**
 * Daily feed for the lot, same rule as the mobile app: the breed curve
 * (weight x FCR, week over week) when it exists, otherwise a share of live
 * weight (5 % for layers, 4 % for broilers).
 */
export function estimateDailyFeed(opts: {
  ageDays: number;
  isLayer: boolean;
  liveCount: number;
  weighedWeightKg: number | null;
  standards: BreedStandard[];
}): FeedRecommendation {
  const week = ageWeek(opts.ageDays);
  const current = closestStandard(opts.standards, week);
  const prev = current && current.week > 1 ? closestStandard(opts.standards, current.week - 1) : null;
  const targetWeightKg = current?.targetAvgWeightKg ?? null;

  let perBirdG: number | null = null;
  let referenceWeightKg: number | null = null;
  let kind: FeedRecommendation['kind'] = 'none';

  if (current && current.targetFcr != null && current.targetFcr > 0 && targetWeightKg != null) {
    const cumCur = targetWeightKg * current.targetFcr;
    const cumPrev =
      prev && prev.targetFcr != null && prev.targetFcr > 0 && prev.targetAvgWeightKg != null
        ? prev.targetAvgWeightKg * prev.targetFcr
        : null;
    const weeklyKg = cumPrev == null ? cumCur : cumCur - cumPrev;
    if (weeklyKg > 0) {
      perBirdG = (weeklyKg * 1000) / 7;
      kind = 'fcr';
      referenceWeightKg = targetWeightKg;
    }
  }
  if (perBirdG == null) {
    referenceWeightKg = opts.weighedWeightKg ?? targetWeightKg;
    if (referenceWeightKg != null && referenceWeightKg > 0) {
      perBirdG = referenceWeightKg * 1000 * (opts.isLayer ? 0.05 : 0.04);
      kind = 'weight';
    }
  }
  if (perBirdG != null) perBirdG = Math.round(Math.max(5, Math.min(400, perBirdG)));
  const totalKgPerDay =
    perBirdG != null && opts.liveCount > 0 ? Math.round((perBirdG * opts.liveCount) / 1000) : null;
  if (kind === 'none') referenceWeightKg = null;
  return { perBirdG, totalKgPerDay, referenceWeightKg, week, kind };
}
