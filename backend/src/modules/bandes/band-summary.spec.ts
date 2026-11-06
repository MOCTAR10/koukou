import { describe, expect, it } from 'vitest';
import {
  parseBandStatusFilter,
  summaryFromLive,
  summaryFromSnapshot,
} from './band-summary.js';

const ind = (key: string, value: number | null, unit = '%') => ({
  key,
  label: key,
  unit,
  value,
  expression: `${key}_expr`,
  parameterKey: `FORMULE_${key.toUpperCase()}`,
  parameterVersionId: null,
  validFrom: null,
});

describe('parseBandStatusFilter', () => {
  it('reads the two filters, case-insensitively', () => {
    expect(parseBandStatusFilter('CLOTURE')).toBe('CLOTURE');
    expect(parseBandStatusFilter('en_cours')).toBe('EN_COURS');
  });

  it('means every band without a value, and refuses an unknown one', () => {
    expect(parseBandStatusFilter(undefined)).toBeUndefined();
    expect(parseBandStatusFilter('')).toBeUndefined();
    expect(parseBandStatusFilter('ACTIF')).toBeNull();
  });
});

describe('summaryFromSnapshot', () => {
  it('keeps the frozen bilan as is, without formula version ids', () => {
    const s = summaryFromSnapshot({
      version: 2,
      asOf: '2026-10-20',
      ageDays: 45,
      durationDays: 45,
      indicators: [ind('taux_mortalite', 3.2), ind('ic', 1.7, 'kg aliment/kg vif')],
      revenueFcfa: 900_000,
      chargesFcfa: 700_000,
      marginFcfa: 200_000,
      completenessPct: 98,
    });
    expect(s.source).toBe('BILAN');
    expect(s.snapshotVersion).toBe(2);
    expect(s.indicators).toEqual([
      {
        key: 'taux_mortalite',
        label: 'taux_mortalite',
        unit: '%',
        value: 3.2,
        expression: 'taux_mortalite_expr',
      },
      {
        key: 'ic',
        label: 'ic',
        unit: 'kg aliment/kg vif',
        value: 1.7,
        expression: 'ic_expr',
      },
    ]);
    expect(s.marginFcfa).toBe(200_000);
  });
});

describe('summaryFromLive', () => {
  it('takes money from the variables and the margin from the formula in force', () => {
    const s = summaryFromLive(
      {
        asOf: '2026-11-06',
        ageDays: 20,
        indicators: [ind('marge_fcfa', 1234.4, 'FCFA')],
        variables: { ca_fcfa: 5000.4, charges_fcfa: 3766 },
        completenessPct: 100,
      },
      20,
    );
    expect(s.source).toBe('EN_COURS');
    expect(s.snapshotVersion).toBeNull();
    expect(s.revenueFcfa).toBe(5000);
    expect(s.chargesFcfa).toBe(3766);
    expect(s.marginFcfa).toBe(1234);
    expect(s.durationDays).toBe(20);
  });

  it('falls back on revenue − charges when the margin formula gives nothing', () => {
    const s = summaryFromLive(
      {
        asOf: '2026-11-06',
        ageDays: 3,
        indicators: [ind('marge_fcfa', null, 'FCFA')],
        variables: { ca_fcfa: 0, charges_fcfa: 1000 },
        completenessPct: null,
      },
      3,
    );
    expect(s.marginFcfa).toBe(-1000);
  });
});
