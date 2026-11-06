import { describe, expect, it } from 'vitest';

import { endOfLayStandard, ipeStatus } from './flock';

describe('endOfLayStandard', () => {
  const week = (w: number, rate: number | null) => ({ week: w, targetLayRatePercent: rate });

  it('ignores the weeks before laying starts', () => {
    const standards = [week(1, null), week(10, 0), week(18, 20), week(28, 95), week(60, 70), week(76, 58)];
    expect(endOfLayStandard(standards, 28)?.week).toBe(76);
  });

  it('finds nothing when the curve never drops', () => {
    expect(endOfLayStandard([week(1, 0), week(28, 95), week(72, 75)], 28)).toBeUndefined();
  });

  it('does not depend on the order of the standards', () => {
    expect(endOfLayStandard([week(76, 58), week(1, 0), week(70, 55), week(28, 95)], 28)?.week).toBe(70);
  });
});

describe('ipeStatus', () => {
  it('rates a high IPE as good, never as a cost', () => {
    expect(ipeStatus(400, 350)).toEqual({ label: 'Conforme', tone: 'green' });
  });

  it('flags a lot more than 10 % behind its target', () => {
    expect(ipeStatus(300, 350)).toEqual({ label: 'En retrait', tone: 'amber' });
    expect(ipeStatus(315, 350)).toEqual({ label: 'Conforme', tone: 'green' });
  });

  it('does not judge without a target or a value', () => {
    expect(ipeStatus(300, null)?.tone).toBe('default');
    expect(ipeStatus(300, 0)?.tone).toBe('default');
    expect(ipeStatus(null, 350)).toBeNull();
  });
});
