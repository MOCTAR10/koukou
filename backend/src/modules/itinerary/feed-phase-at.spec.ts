import { describe, expect, it } from 'vitest';
import { FeedPhase } from '../../common/enums/feed-phase.enum.js';
import { feedPhaseAt, type FeedPhaseStep } from './feed-phase-at.js';

const broiler: FeedPhaseStep[] = [
  { dayFrom: 0, dayTo: 10, feedPhase: FeedPhase.POUSSIN },
  { dayFrom: 11, dayTo: 24, feedPhase: FeedPhase.DEMARRAGE },
  { dayFrom: 25, dayTo: 35, feedPhase: FeedPhase.CROISSANCE },
  { dayFrom: 36, dayTo: null, feedPhase: FeedPhase.FINITION },
  // A practice step without feed phase never answers.
  { dayFrom: 0, dayTo: null, feedPhase: null },
];

describe('feedPhaseAt', () => {
  it('returns the phase covering the age, bounds included', () => {
    expect(feedPhaseAt(broiler, 0)).toBe(FeedPhase.POUSSIN);
    expect(feedPhaseAt(broiler, 10)).toBe(FeedPhase.POUSSIN);
    expect(feedPhaseAt(broiler, 11)).toBe(FeedPhase.DEMARRAGE);
    expect(feedPhaseAt(broiler, 24)).toBe(FeedPhase.DEMARRAGE);
    expect(feedPhaseAt(broiler, 25)).toBe(FeedPhase.CROISSANCE);
    expect(feedPhaseAt(broiler, 35)).toBe(FeedPhase.CROISSANCE);
    expect(feedPhaseAt(broiler, 36)).toBe(FeedPhase.FINITION);
  });

  it('keeps the last phase open until the end', () => {
    expect(feedPhaseAt(broiler, 400)).toBe(FeedPhase.FINITION);
  });

  it('returns null when nothing covers the age', () => {
    expect(feedPhaseAt([], 5)).toBeNull();
    expect(feedPhaseAt(broiler, -1)).toBeNull();
  });

  it('ignores inactive steps', () => {
    const steps: FeedPhaseStep[] = [
      { dayFrom: 0, dayTo: null, feedPhase: FeedPhase.POUSSIN, active: false },
      { dayFrom: 0, dayTo: null, feedPhase: FeedPhase.DEMARRAGE, active: true },
    ];
    expect(feedPhaseAt(steps, 3)).toBe(FeedPhase.DEMARRAGE);
  });

  it('prefers the step starting last when two overlap', () => {
    const steps: FeedPhaseStep[] = [
      { dayFrom: 0, dayTo: null, feedPhase: FeedPhase.CROISSANCE },
      { dayFrom: 20, dayTo: null, feedPhase: FeedPhase.FINITION },
    ];
    expect(feedPhaseAt(steps, 30)).toBe(FeedPhase.FINITION);
    expect(feedPhaseAt(steps, 10)).toBe(FeedPhase.CROISSANCE);
  });
});
