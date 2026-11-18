import type { FeedPhase } from '../../common/enums/feed-phase.enum.js';

/** What `feedPhaseAt` reads from an itinerary step. */
export interface FeedPhaseStep {
  dayFrom: number;
  dayTo: number | null;
  feedPhase: FeedPhase | null;
  active?: boolean;
}

/**
 * Feed phase of the itinerary at an age (in days): the phase of the active
 * step carrying a `feedPhase` that covers the age (`dayFrom` and `dayTo`
 * inclusive, `dayTo` null = until the end). When several steps cover the age,
 * the one starting last wins (the most specific). Null when none covers it.
 */
export function feedPhaseAt(
  steps: readonly FeedPhaseStep[],
  ageDays: number,
): FeedPhase | null {
  let best: FeedPhaseStep | null = null;
  for (const s of steps) {
    if (s.feedPhase == null || s.active === false) continue;
    if (ageDays < s.dayFrom) continue;
    if (s.dayTo != null && ageDays > s.dayTo) continue;
    if (best == null || s.dayFrom > best.dayFrom) best = s;
  }
  return best?.feedPhase ?? null;
}
