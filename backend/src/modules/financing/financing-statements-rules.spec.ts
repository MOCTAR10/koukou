import { coveragePctOf, incompleteEntriesWarning, netResultWithStock } from './financing-statements-rules.js';

describe('financing-statements-rules', () => {
  it('computes the coverage to one decimal', () => {
    expect(coveragePctOf(153, 365)).toBe(41.9);
    expect(coveragePctOf(365, 365)).toBe(100);
    expect(coveragePctOf(0, 0)).toBe(0);
  });

  it('warns only under the minimum, with the figures in French', () => {
    const base = { daysWithEntries: 153, daysInPeriod: 365, coveragePct: 41.9, coverageMinPct: 60 };
    expect(incompleteEntriesWarning(base)).toBe('Saisie incomplète : 153 jours saisis sur 365 (41,9 %)');
    expect(incompleteEntriesWarning({ ...base, coveragePct: 60 })).toBeNull();
  });

  it('adds the estimated stock to the ledger result', () => {
    expect(netResultWithStock(-50_000, 120_000)).toBe(70_000);
    expect(netResultWithStock(10, 0)).toBe(10);
  });
});
