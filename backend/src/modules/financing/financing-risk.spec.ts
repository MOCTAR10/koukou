import { ageingOf, concentrationOf, provisionsOf, riskOf, sharePct, type ProvisionRates, type RiskFile } from './financing-risk.js';

const RATES: ProvisionRates = { generale: 2, impaye: 0, douteux: 50, irrecouvrable: 100 };

const file = (over: Partial<RiskFile>): RiskFile => ({
  farmId: 'f1',
  farmName: 'Ferme 1',
  provinceKey: 'EST',
  provinceName: 'Estuaire',
  claimClass: 'SAIN',
  daysLate: 0,
  overdueFcfa: 0,
  outstandingFcfa: 0,
  ...over,
});

describe('financing-risk', () => {
  it('buckets the overdue amounts by days late, edges included', () => {
    const a = ageingOf([
      file({ daysLate: 1, overdueFcfa: 100 }),
      file({ daysLate: 30, overdueFcfa: 200 }),
      file({ daysLate: 31, overdueFcfa: 400 }),
      file({ daysLate: 61, overdueFcfa: 800 }),
      file({ daysLate: 90, overdueFcfa: 1600 }),
      file({ daysLate: 91, overdueFcfa: 3200 }),
      file({ daysLate: 0, overdueFcfa: 0 }),
    ]);
    expect(a.map((b) => [b.files, b.overdueFcfa])).toEqual([
      [2, 300],
      [1, 400],
      [2, 2400],
      [1, 3200],
    ]);
  });

  it('ranks the five largest borrowers with their share, files of a farm added up', () => {
    const files = [
      file({ farmId: 'a', farmName: 'A', outstandingFcfa: 400 }),
      file({ farmId: 'a', farmName: 'A', outstandingFcfa: 100 }),
      ...['b', 'c', 'd', 'e', 'f'].map((id, i) => file({ farmId: id, farmName: id.toUpperCase(), outstandingFcfa: 100 - i * 10 })),
      file({ farmId: 'z', farmName: 'Z', outstandingFcfa: 0 }),
    ];
    const c = concentrationOf(files);
    expect(c.top.map((t) => t.farmId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(c.top[0]).toMatchObject({ files: 2, outstandingFcfa: 500, sharePct: 55.6 });
    // total = 500 + 100 + 90 + 80 + 70 + 60 = 900; top 5 = 840
    expect(c.topSharePct).toBe(93.3);
    expect(c.byProvince).toEqual([{ key: 'EST', label: 'Estuaire', files: 7, outstandingFcfa: 900, sharePct: 100 }]);
  });

  it('provisions each class at its rate, none for paid-off files', () => {
    const p = provisionsOf(
      [
        file({ claimClass: 'SAIN', outstandingFcfa: 1_000_000 }),
        file({ claimClass: 'SENSIBLE', outstandingFcfa: 500_000 }),
        file({ claimClass: 'IMPAYE', outstandingFcfa: 300_000 }),
        file({ claimClass: 'DOUTEUX', outstandingFcfa: 200_001 }),
        file({ claimClass: 'IRRECOUVRABLE', outstandingFcfa: 100_000 }),
        file({ claimClass: 'SOLDE', outstandingFcfa: 0 }),
      ],
      RATES,
    );
    expect(p.rows.map((r) => r.provisionFcfa)).toEqual([20_000, 10_000, 0, 0, 100_001, 100_000]);
    expect(p.totalFcfa).toBe(230_001);
    expect(p.coveragePct).toBe(11);
  });

  it('has no share when nothing is outstanding', () => {
    expect(sharePct(5, 0)).toBeNull();
    const r = riskOf([], RATES);
    expect(r.concentration.topSharePct).toBeNull();
    expect(r.provisions.coveragePct).toBeNull();
    expect(r.ageing.every((b) => b.files === 0)).toBe(true);
  });
});
