import { describe, expect, it } from 'vitest';
import type { FarmFinancials } from '../../api/types-financing';
import {
  balanceCheck,
  beforeAfterRows,
  coverageText,
  lowCoverageLine,
  headlineRatios,
  isFinancialStatementsRequirement,
  isLowCoverage,
  periodError,
  periodFor,
  ratioValueText,
  signedText,
} from './financialsLogic';

type Ratio = FarmFinancials['ratios'][number];
const ratio = (code: Ratio['code'], value: number | null): Ratio => ({ code, label: code, value, unit: '%', formula: '', reading: null });

describe('periodFor', () => {
  it('12 derniers mois ends today and starts the day after the same date a year ago', () => {
    expect(periodFor('MONTHS_12', '2026-11-19')).toEqual({ from: '2025-11-20', to: '2026-11-19' });
    expect(periodFor('MONTHS_12', '2028-02-29')).toEqual({ from: '2027-03-01', to: '2028-02-29' });
  });
  it('exercice en cours and précédent follow the calendar year', () => {
    expect(periodFor('YEAR_CURRENT', '2026-11-19')).toEqual({ from: '2026-01-01', to: '2026-11-19' });
    expect(periodFor('YEAR_PREVIOUS', '2026-11-19')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });
});

describe('periodError', () => {
  it('accepts a coherent period and refuses the rest in French', () => {
    expect(periodError({ from: '2026-01-01', to: '2026-06-30' }, '2026-11-19')).toBeNull();
    expect(periodError({ from: '', to: '2026-06-30' }, '2026-11-19')).toMatch(/Indiquez/);
    expect(periodError({ from: '2026-07-01', to: '2026-06-30' }, '2026-11-19')).toMatch(/précéder/);
    expect(periodError({ from: '2026-07-01', to: '2026-12-31' }, '2026-11-19')).toMatch(/futur/);
  });
});

describe('ratioValueText', () => {
  it('formats each unit', () => {
    expect(ratioValueText(18.44, '%')).toBe('18,4 %');
    expect(ratioValueText(4250000, 'FCFA')).toMatch(/^4\s250\s000 FCFA$/);
    expect(ratioValueText(45, 'jours')).toBe('45 jours');
    expect(ratioValueText(1, 'jours')).toBe('1 jour');
    expect(ratioValueText(1.345, 'x')).toBe('1,35 x');
  });
  it('says « Non calculable » for null, never a dash', () => {
    expect(ratioValueText(null, '%')).toBe('Non calculable');
    expect(ratioValueText(Number.NaN, 'FCFA')).toBe('Non calculable');
  });
  it('keeps a real zero', () => {
    expect(ratioValueText(0, '%')).toBe('0 %');
  });
});

describe('headlineRatios', () => {
  it('puts computable ratios first, in the analyst order, and caps the list', () => {
    const list = [ratio('DELAI_CLIENTS', 12), ratio('CAF', null), ratio('SERVICE_DETTE', 40), ratio('MARGE_NETTE', 20), ratio('TRESORERIE_NETTE', 5), ratio('ENDETTEMENT', 1)];
    expect(headlineRatios(list, 4).map((r) => r.code)).toEqual(['MARGE_NETTE', 'SERVICE_DETTE', 'TRESORERIE_NETTE', 'ENDETTEMENT']);
  });
});

describe('coverage', () => {
  const r = (daysWithEntries: number, coveragePct: number) => ({ daysInPeriod: 365, daysWithEntries, coveragePct, coverageMinPct: 60 });
  it('flags a coverage under the programme minimum, the minimum itself is enough', () => {
    expect(isLowCoverage(r(219, 60))).toBe(false);
    expect(isLowCoverage(r(153, 41.9))).toBe(true);
  });

  it('words the figure like the PDF warning', () => {
    expect(coverageText(r(153, 41.9))).toBe('153 jours saisis sur 365 (41,9 %)');
    expect(lowCoverageLine(r(153, 41.9))).toBe('Saisie incomplète : 153 jours saisis sur 365 (41,9 %)');
    expect(lowCoverageLine(r(365, 100))).toBeNull();
  });
});

describe('balanceCheck', () => {
  const sheet = (assets: number[], liabilities: number[], ta: number, tl: number) => ({
    asOf: '2026-11-19',
    assets: assets.map((a, i) => ({ code: `A${i}`, label: 'a', amountFcfa: a })),
    liabilities: liabilities.map((a, i) => ({ code: `P${i}`, label: 'p', amountFcfa: a })),
    totalAssetsFcfa: ta,
    totalLiabilitiesFcfa: tl,
  });
  it('is balanced when actif = passif and the totals add up', () => {
    expect(balanceCheck(sheet([700, 300], [600, 400], 1000, 1000))).toEqual({ balanced: true, gapFcfa: 0, totalsMatchLines: true });
  });
  it('reports the gap and a total that does not match its lines', () => {
    const c = balanceCheck(sheet([700, 300], [600, 350], 1000, 950));
    expect(c.balanced).toBe(false);
    expect(c.gapFcfa).toBe(50);
    expect(c.totalsMatchLines).toBe(true);
    expect(balanceCheck(sheet([700, 300], [600, 400], 1001, 1000)).totalsMatchLines).toBe(false);
  });
});

describe('beforeAfterRows', () => {
  const b = {
    pivotDate: '2026-06-12',
    before: { months: 6, revenueFcfa: 6_000_000, chargesFcfa: 5_400_000, netResultFcfa: 600_000, mortalityPct: 6.2 },
    after: { months: 3, revenueFcfa: 4_500_000, chargesFcfa: 3_300_000, netResultFcfa: 1_200_000, mortalityPct: 4.1 },
  };
  it('compares monthly averages because the two periods differ in length', () => {
    const rows = beforeAfterRows(b);
    const revenue = rows.find((r) => r.key === 'revenue')!;
    expect(revenue.variation).toBe(500_000); // 1,5 M per month against 1 M
    expect(revenue.variationPct).toBe(50);
    expect(rows.find((r) => r.key === 'net')!.variationPct).toBe(300);
  });
  it('gives mortality in points, and no variation without a base', () => {
    const m = beforeAfterRows(b).find((r) => r.key === 'mortality')!;
    expect(m.variation).toBe(-2.1);
    const none = beforeAfterRows({ ...b, before: { ...b.before, months: 0, mortalityPct: null } });
    expect(none.find((r) => r.key === 'revenue')!.variation).toBeNull();
    expect(none.find((r) => r.key === 'mortality')!.variation).toBeNull();
  });
});

describe('signedText', () => {
  it('signs the figure', () => {
    expect(signedText(-2.1, 'points')).toBe('−2,1 points');
    expect(signedText(500000, 'FCFA')).toMatch(/^\+500\s000 FCFA$/);
    expect(signedText(null, 'FCFA')).toBe('Non calculable');
  });
});

describe('isFinancialStatementsRequirement', () => {
  it('matches the code, then the label', () => {
    expect(isFinancialStatementsRequirement({ code: 'ETATS_FINANCIERS', label: 'x' })).toBe(true);
    expect(isFinancialStatementsRequirement({ code: 'REQ_4', label: 'États financiers ou état de trésorerie' })).toBe(true);
    expect(isFinancialStatementsRequirement({ code: 'REQ_4', label: 'Plan d’affaires' })).toBe(false);
  });
});
