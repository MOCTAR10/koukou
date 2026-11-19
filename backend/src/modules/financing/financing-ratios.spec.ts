import {
  computeRatios,
  monthsCovered,
  readCoverage,
  readLeverage,
  selfFinancingCapacity,
  type RatioInputs,
} from './financing-ratios.js';

const base: RatioInputs = {
  netResultFcfa: 600_000,
  depreciationFcfa: 200_000,
  revenueFcfa: 6_000_000,
  due12mFcfa: 500_000,
  netCashFcfa: 150_000,
  receivablesFcfa: 500_000,
  financialDebtFcfa: 1_000_000,
  equityFcfa: 2_000_000,
  stableResourcesFcfa: 3_000_000,
  fixedAssetsFcfa: 2_200_000,
  daysInPeriod: 365,
};
const T = { coverageMin: 1.2, leverageMax: 2 };
const by = (r: ReturnType<typeof computeRatios>, code: string) =>
  r.find((x) => x.code === code)!;

describe('financing ratios', () => {
  it('computes the seven ratios with their units', () => {
    const r = computeRatios(base, T);
    expect(r.map((x) => x.code)).toEqual([
      'CAF', 'MARGE_NETTE', 'SERVICE_DETTE', 'TRESORERIE_NETTE', 'DELAI_CLIENTS', 'ENDETTEMENT', 'FONDS_ROULEMENT',
    ]);
    expect(by(r, 'CAF').value).toBe(800_000);
    expect(by(r, 'MARGE_NETTE').value).toBe(10);
    expect(by(r, 'SERVICE_DETTE').value).toBe(1.6);
    expect(by(r, 'SERVICE_DETTE').unit).toBe('x');
    expect(by(r, 'TRESORERIE_NETTE').value).toBe(150_000);
    expect(by(r, 'DELAI_CLIENTS').value).toBe(30);
    expect(by(r, 'ENDETTEMENT').value).toBe(0.5);
    expect(by(r, 'FONDS_ROULEMENT').value).toBe(800_000);
  });

  it('gives a reading only where a threshold applies', () => {
    const r = computeRatios(base, T);
    expect(by(r, 'SERVICE_DETTE').reading).toBe('BON');
    expect(by(r, 'ENDETTEMENT').reading).toBe('BON');
    for (const code of ['CAF', 'MARGE_NETTE', 'TRESORERIE_NETTE', 'DELAI_CLIENTS', 'FONDS_ROULEMENT']) {
      expect(by(r, code).reading).toBeNull();
    }
  });

  it('returns null, never a guess, when an input is missing or a denominator is not positive', () => {
    const none = computeRatios(
      {
        ...base,
        netResultFcfa: null,
        revenueFcfa: 0,
        due12mFcfa: 0,
        equityFcfa: -10,
        receivablesFcfa: null,
        stableResourcesFcfa: null,
      },
      T,
    );
    expect(by(none, 'CAF').value).toBeNull();
    expect(by(none, 'MARGE_NETTE').value).toBeNull();
    expect(by(none, 'SERVICE_DETTE').value).toBeNull();
    expect(by(none, 'SERVICE_DETTE').reading).toBeNull();
    expect(by(none, 'DELAI_CLIENTS').value).toBeNull();
    expect(by(none, 'ENDETTEMENT').value).toBeNull();
    expect(by(none, 'FONDS_ROULEMENT').value).toBeNull();
    // A negative net result is a real figure, not a missing one.
    const loss = computeRatios({ ...base, netResultFcfa: -300_000 }, T);
    expect(by(loss, 'MARGE_NETTE').value).toBe(-5);
    expect(by(loss, 'CAF').value).toBe(-100_000);
    expect(by(loss, 'SERVICE_DETTE').value).toBe(-0.2);
    expect(by(loss, 'SERVICE_DETTE').reading).toBe('FAIBLE');
  });

  it('reads coverage and leverage against the parameters', () => {
    expect(readCoverage(1.2, 1.2)).toBe('BON');
    expect(readCoverage(1.1, 1.2)).toBe('A_SURVEILLER');
    expect(readCoverage(0.9, 1.2)).toBe('FAIBLE');
    expect(readLeverage(2, 2)).toBe('BON');
    expect(readLeverage(2.5, 2)).toBe('A_SURVEILLER');
    expect(readLeverage(3.1, 2)).toBe('FAIBLE');
    expect(readCoverage(null, 1.2)).toBeNull();
  });

  it('computes the CAF and counts months', () => {
    expect(selfFinancingCapacity(base)).toBe(800_000);
    expect(selfFinancingCapacity({ ...base, depreciationFcfa: null })).toBeNull();
    expect(monthsCovered('2026-01-01', '2026-06-30')).toBe(6);
    expect(monthsCovered('2026-03-01', '2026-02-01')).toBe(0);
  });
});
