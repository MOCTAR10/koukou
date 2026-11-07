import { describe, expect, it } from 'vitest';
import { BiosecurityAnswer as A } from '../../common/enums/visit.enum.js';
import {
  biosecurityClass,
  biosecurityScore,
  criterionMetaError,
  criterionWeight,
  visitHistoryLabel,
  visitRefusal,
} from './visit-rules.js';

describe('biosecurityScore', () => {
  it('weights the compliant criteria and leaves NA out', () => {
    expect(
      biosecurityScore([
        { weight: 3, answer: A.CONFORME },
        { weight: 1, answer: A.NON_CONFORME },
        { weight: 5, answer: A.NA },
      ]),
    ).toBe(75);
    expect(biosecurityScore([{ weight: 2, answer: A.CONFORME }])).toBe(100);
  });
  it('is null when nothing is assessed', () => {
    expect(biosecurityScore([])).toBeNull();
    expect(biosecurityScore([{ weight: 2, answer: A.NA }])).toBeNull();
  });
  it('rounds to one decimal', () => {
    expect(
      biosecurityScore([
        { weight: 1, answer: A.CONFORME },
        { weight: 2, answer: A.NON_CONFORME },
      ]),
    ).toBe(33.3);
  });
});

describe('biosecurityClass', () => {
  const t = { a: 80, b: 60 };
  it('classifies on the thresholds, boundaries included', () => {
    expect(biosecurityClass(80, t)).toBe('A');
    expect(biosecurityClass(79.9, t)).toBe('B');
    expect(biosecurityClass(60, t)).toBe('B');
    expect(biosecurityClass(59.9, t)).toBe('C');
    expect(biosecurityClass(null, t)).toBeNull();
  });
});

describe('grid weights', () => {
  it('reads meta.weight, 1 by default', () => {
    expect(criterionWeight({ weight: 3 })).toBe(3);
    expect(criterionWeight({})).toBe(1);
    expect(criterionWeight({ weight: 0 })).toBe(1);
    expect(criterionWeight({ weight: 'x' })).toBe(1);
  });
  it('refuses a weight outside 1-10 when saving a criterion', () => {
    expect(criterionMetaError({ weight: 3 })).toBeNull();
    expect(criterionMetaError({ weight: 0 })).not.toBeNull();
    expect(criterionMetaError({ weight: 2.5 })).not.toBeNull();
    expect(criterionMetaError(undefined)).toBeNull();
  });
});

describe('visitRefusal', () => {
  const base = { visitDate: '2026-11-10', hasBand: true };
  it('accepts a visit without visa', () => {
    expect(visitRefusal({ ...base, hasBand: false })).toBeNull();
  });
  it('checks the next visit date', () => {
    expect(visitRefusal({ ...base, nextVisitDate: '2026-11-01' })).toMatch(
      /prochaine/,
    );
  });
  it('checks the visa period', () => {
    const visa = {
      ...base,
      visaFrom: '2026-11-01',
      visaTo: '2026-11-09',
      bandStart: '2026-10-20',
    };
    expect(visitRefusal(visa)).toBeNull();
    expect(visitRefusal({ ...visa, visaTo: undefined })).toMatch(
      /début et la fin/,
    );
    expect(visitRefusal({ ...visa, hasBand: false })).toMatch(/bande/);
    expect(
      visitRefusal({ ...visa, visaFrom: '2026-11-09', visaTo: '2026-11-01' }),
    ).toMatch(/suit sa fin/);
    expect(visitRefusal({ ...visa, visaTo: '2026-11-11' })).toMatch(
      /postérieures/,
    );
    expect(visitRefusal({ ...visa, visaFrom: '2026-10-01' })).toMatch(
      /avant l’ouverture/,
    );
    expect(visitRefusal({ ...visa, bandEnd: '2026-11-05' })).toMatch(
      /clôture/,
    );
  });
});

describe('visitHistoryLabel', () => {
  it('words a biosecurity control with its class and a visa', () => {
    expect(
      visitHistoryLabel({
        type: 'BIOSECURITE',
        scorePct: 72.5,
        classification: 'B',
        visaFrom: null,
        visaTo: null,
      }),
    ).toBe('Contrôle de biosécurité : score 72,5 %, classe B');
    expect(
      visitHistoryLabel({
        type: 'TECHNIQUE',
        scorePct: null,
        classification: null,
        visaFrom: '2026-11-01',
        visaTo: '2026-11-05',
      }),
    ).toBe('Visite technique : saisies du 2026-11-01 au 2026-11-05 visées');
  });
});
