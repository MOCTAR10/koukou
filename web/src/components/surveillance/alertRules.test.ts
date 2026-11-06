import { describe, expect, it } from 'vitest';
import {
  EMPTY_ALERT_FILTERS,
  alertQuery,
  filtersFromParams,
  filtersToParams,
  mortalityVsThreshold,
  nextStatuses,
  pctFr,
  periodProblem,
  publicationProblem,
  requiresComment,
  transitionBody,
  transitionProblem,
} from './alertRules';

const item = (code: string, family: string, sort = 0, active = true) => ({ code, family, sort, active, label: code });
const STATUSES = [
  item('NOUVELLE', 'NOUVELLE', 1),
  item('EN_ANALYSE', 'EN_ANALYSE', 2),
  item('PRELEVEMENT', 'EN_ANALYSE', 3),
  item('CONFIRMEE', 'CONFIRMEE', 4),
  item('INFIRMEE', 'INFIRMEE', 5),
  item('CLOSE', 'CLOSE', 6),
  item('VIEUX', 'CONFIRMEE', 7, false),
];

describe('nextStatuses', () => {
  it('offers the next family only from NOUVELLE', () => {
    expect(nextStatuses({ statusCode: 'NOUVELLE', statusFamily: 'NOUVELLE' }, STATUSES).map((s) => s.code)).toEqual(['EN_ANALYSE', 'PRELEVEMENT']);
  });

  it('allows another status of the same family and both outcomes, never a deactivated one', () => {
    expect(nextStatuses({ statusCode: 'EN_ANALYSE', statusFamily: 'EN_ANALYSE' }, STATUSES).map((s) => s.code)).toEqual([
      'PRELEVEMENT',
      'CONFIRMEE',
      'INFIRMEE',
    ]);
  });

  it('never goes back nor skips, and CLOSE is final', () => {
    expect(nextStatuses({ statusCode: 'CONFIRMEE', statusFamily: 'CONFIRMEE' }, STATUSES).map((s) => s.code)).toEqual(['CLOSE']);
    expect(nextStatuses({ statusCode: 'CLOSE', statusFamily: 'CLOSE' }, STATUSES)).toEqual([]);
  });
});

describe('transition form', () => {
  it('needs a comment of 3 characters to confirm or rule out', () => {
    expect(requiresComment('CONFIRMEE')).toBe(true);
    expect(requiresComment('INFIRMEE')).toBe(true);
    expect(requiresComment('EN_ANALYSE')).toBe(false);
    expect(transitionProblem({ code: 'CONFIRMEE', family: 'CONFIRMEE' }, ' ok ')).toMatch(/commentaire/);
    expect(transitionProblem({ code: 'CONFIRMEE', family: 'CONFIRMEE' }, 'Newcastle')).toBeNull();
    expect(transitionProblem({ code: 'EN_ANALYSE', family: 'EN_ANALYSE' }, '')).toBeNull();
    expect(transitionProblem(null, 'x')).toMatch(/statut/);
  });

  it('sends a trimmed comment, none when empty', () => {
    expect(transitionBody({ code: 'EN_ANALYSE' }, '  ')).toEqual({ statusCode: 'EN_ANALYSE' });
    expect(transitionBody({ code: 'CONFIRMEE' }, ' Prélèvement positif ')).toEqual({ statusCode: 'CONFIRMEE', comment: 'Prélèvement positif' });
  });
});

describe('publicationProblem', () => {
  it('publishes a confirmed alert once', () => {
    expect(publicationProblem({ published: false, outcome: 'CONFIRMEE' })).toBeNull();
    expect(publicationProblem({ published: true, outcome: 'CONFIRMEE' })).toMatch(/déjà publiée/);
    expect(publicationProblem({ published: false, outcome: 'INFIRMEE' })).toMatch(/confirmée/);
    expect(publicationProblem({ published: false, outcome: null })).toMatch(/confirmée/);
  });
});

describe('percentages', () => {
  it('formats French percentages and the threshold', () => {
    expect(pctFr(3.256)).toBe('3,26 %');
    expect(pctFr(null)).toBe('—');
    expect(mortalityVsThreshold({ mortalityPct: 4.1, thresholdPct: 3 })).toBe('4,1 % (seuil 3 %)');
    expect(mortalityVsThreshold({ mortalityPct: null, thresholdPct: null })).toBeNull();
  });
});

describe('filters', () => {
  it('builds the list query without empty filters', () => {
    expect(alertQuery(EMPTY_ALERT_FILTERS)).toBe('limit=50');
    expect(alertQuery({ ...EMPTY_ALERT_FILTERS, statusFamily: 'NOUVELLE', published: 'false', from: '2026-11-01' }, 50)).toBe(
      'statusFamily=NOUVELLE&published=false&from=2026-11-01&limit=50&offset=50',
    );
  });

  it('round-trips the page URL and keeps the opened alert', () => {
    const filters = { ...EMPTY_ALERT_FILTERS, origin: 'MORTALITE', provinceCode: 'G1' };
    const params = filtersToParams(filters, new URLSearchParams('alerte=abc&x=1'));
    expect(params.toString()).toBe('alerte=abc&origine=MORTALITE&province=G1');
    expect(filtersFromParams(params)).toEqual(filters);
  });

  it('refuses a reversed period', () => {
    expect(periodProblem({ from: '2026-11-05', to: '2026-11-01' })).toMatch(/début/);
    expect(periodProblem({ from: '2026-11-01', to: '' })).toBeNull();
  });
});
