import { describe, expect, it } from 'vitest';
import { deliveryBand, openOn, type BandWindow } from './delivery-attribution.js';

const A: BandWindow = { id: 'A', integrationDate: '2026-10-01', closedDay: '2026-10-20' };
const B: BandWindow = { id: 'B', integrationDate: '2026-10-10', closedDay: null };
const C: BandWindow = { id: 'C', integrationDate: '2026-10-12', closedDay: null };

describe('delivery attribution (T2)', () => {
  it('a band is open from its placement to its closure, both included', () => {
    expect(openOn(A, '2026-10-01')).toBe(true);
    expect(openOn(A, '2026-10-20')).toBe(true);
    expect(openOn(A, '2026-10-21')).toBe(false);
    expect(openOn(B, '2026-10-09')).toBe(false);
    expect(openOn(B, '2030-01-01')).toBe(true);
  });

  it('a linked delivery goes to its band, whatever the dates', () => {
    expect(deliveryBand({ bandId: 'A', receivedDate: '2026-11-30', consumerBandIds: ['B'] }, [A, B, C])).toBe('A');
  });

  it('the only band open on the reception day takes it', () => {
    expect(deliveryBand({ bandId: null, receivedDate: '2026-10-05', consumerBandIds: [] }, [A, B, C])).toBe('A');
    expect(deliveryBand({ bandId: null, receivedDate: '2026-10-25', consumerBandIds: [] }, [A, B])).toBe('B');
  });

  it('several open bands: the one that ate from its lots', () => {
    expect(deliveryBand({ bandId: null, receivedDate: '2026-10-15', consumerBandIds: ['C', 'C'] }, [A, B, C])).toBe('C');
    // A consumer not open that day does not count.
    expect(deliveryBand({ bandId: null, receivedDate: '2026-10-25', consumerBandIds: ['A', 'B'] }, [A, B, C])).toBe('B');
  });

  it('still ambiguous, or no band open: farm list only', () => {
    expect(deliveryBand({ bandId: null, receivedDate: '2026-10-15', consumerBandIds: [] }, [A, B, C])).toBeNull();
    expect(deliveryBand({ bandId: null, receivedDate: '2026-10-15', consumerBandIds: ['B', 'C'] }, [A, B, C])).toBeNull();
    expect(deliveryBand({ bandId: null, receivedDate: '2026-09-01', consumerBandIds: [] }, [A, B, C])).toBeNull();
  });
});
