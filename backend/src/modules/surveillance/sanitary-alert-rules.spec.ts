import {
  ALERT_FAMILY,
  exceededDays,
  outcomeAfter,
  planMortalityAlert,
  publicationCheck,
  sanitaryAlertCode,
  transitionError,
} from './sanitary-alert-rules.js';

const s = (code: string, family = code) => ({ code, family });
const t = (code: string, family = code, active = true) => ({
  code,
  family,
  active,
});

describe('sanitary alert circuit', () => {
  it('follows NOUVELLE → EN_ANALYSE → CONFIRMEE | INFIRMEE → CLOSE', () => {
    expect(transitionError(s('NOUVELLE'), t('EN_ANALYSE'), null)).toBeNull();
    expect(transitionError(s('EN_ANALYSE'), t('CONFIRMEE'), 'Prélèvement positif')).toBeNull();
    expect(transitionError(s('EN_ANALYSE'), t('INFIRMEE'), 'Coccidiose banale')).toBeNull();
    expect(transitionError(s('CONFIRMEE'), t('CLOSE'), null)).toBeNull();
    expect(transitionError(s('INFIRMEE'), t('CLOSE'), null)).toBeNull();
  });

  it('refuses skipping a step, going back, or leaving CLOSE', () => {
    expect(transitionError(s('NOUVELLE'), t('CONFIRMEE'), 'x x x')).toMatch(
      /impossible \(suivant possible : EN_ANALYSE\)/,
    );
    expect(transitionError(s('CONFIRMEE'), t('EN_ANALYSE'), null)).toMatch(
      /impossible/,
    );
    expect(transitionError(s('CLOSE'), t('NOUVELLE'), null)).toMatch(/close/);
  });

  it('allows another status of the same family, never the same one', () => {
    expect(
      transitionError(s('EN_ANALYSE'), t('ANALYSE_LABO', 'EN_ANALYSE'), null),
    ).toBeNull();
    expect(transitionError(s('EN_ANALYSE'), t('EN_ANALYSE'), null)).toMatch(
      /déjà/,
    );
    expect(
      transitionError(s('EN_ANALYSE'), t('X', 'EN_ANALYSE', false), null),
    ).toMatch(/désactivé/);
  });

  it('needs a comment to confirm or to rule out', () => {
    expect(transitionError(s('EN_ANALYSE'), t('CONFIRMEE'), '  ')).toMatch(
      /commentaire/,
    );
    expect(transitionError(s('EN_ANALYSE'), t('INFIRMEE'), undefined)).toMatch(
      /commentaire/,
    );
  });

  it('keeps the outcome once qualified', () => {
    expect(outcomeAfter(null, ALERT_FAMILY.EN_ANALYSE)).toBeNull();
    expect(outcomeAfter(null, ALERT_FAMILY.CONFIRMEE)).toBe('CONFIRMEE');
    expect(outcomeAfter('CONFIRMEE', ALERT_FAMILY.CLOSE)).toBe('CONFIRMEE');
  });

  it('publishes a confirmed alert once', () => {
    expect(publicationCheck({ publishedAt: null, outcome: 'CONFIRMEE' })).toEqual({
      ok: true,
    });
    expect(publicationCheck({ publishedAt: null, outcome: 'INFIRMEE' })).toMatchObject({
      ok: false,
      conflict: false,
    });
    expect(publicationCheck({ publishedAt: null, outcome: null })).toMatchObject({
      ok: false,
    });
    expect(
      publicationCheck({ publishedAt: new Date(), outcome: 'CONFIRMEE' }),
    ).toMatchObject({ ok: false, conflict: true });
  });
});

describe('mortality threshold', () => {
  const day = (d: string, pct: number | null) => ({
    day: d,
    mortalityDayPct: pct,
    deaths: 5,
    presentStart: 100,
  });

  it('keeps days strictly above the threshold in force that day', () => {
    const out = exceededDays(
      [day('2026-11-01', 1), day('2026-11-02', 1.5), day('2026-11-03', null), day('2026-11-04', 3)],
      (d) => (d < '2026-11-04' ? 1 : 5),
    );
    expect(out.map((d) => d.day)).toEqual(['2026-11-02']);
    expect(out[0].thresholdPct).toBe(1);
  });

  const ex = (d: string, pct: number) => ({
    ...day(d, pct),
    mortalityDayPct: pct,
    thresholdPct: 1,
  });

  it('opens one alert per episode from its first day', () => {
    const plan = planMortalityAlert({
      exceeded: [ex('2026-11-03', 4), ex('2026-11-02', 2)],
      coveredUntil: null,
      open: null,
    });
    expect(plan).toMatchObject({
      action: 'create',
      first: { day: '2026-11-02' },
      lastFactDay: '2026-11-03',
      mortalityPct: 4,
    });
  });

  it('extends the alert being handled, never re-raises covered days', () => {
    expect(
      planMortalityAlert({
        exceeded: [ex('2026-11-02', 2), ex('2026-11-05', 6)],
        coveredUntil: '2026-11-02',
        open: { lastFactDay: '2026-11-02', mortalityPct: 2 },
      }),
    ).toEqual({ action: 'extend', lastFactDay: '2026-11-05', mortalityPct: 6 });
    expect(
      planMortalityAlert({
        exceeded: [ex('2026-11-02', 2)],
        coveredUntil: '2026-11-02',
        open: null,
      }),
    ).toEqual({ action: 'none' });
    // Closed episode, new day: a new alert.
    expect(
      planMortalityAlert({
        exceeded: [ex('2026-11-02', 2), ex('2026-11-09', 3)],
        coveredUntil: '2026-11-02',
        open: null,
      }),
    ).toMatchObject({ action: 'create', first: { day: '2026-11-09' } });
  });

  it('numbers alerts per year', () => {
    expect(sanitaryAlertCode(2026, 7)).toBe('AS-2026-0007');
    expect(sanitaryAlertCode(2027, 12345)).toBe('AS-2027-12345');
  });
});
