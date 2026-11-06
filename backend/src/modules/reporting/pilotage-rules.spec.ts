import { describe, expect, it } from 'vitest';
import { AccessScopeKind } from '../../common/enums/access-scope-kind.enum.js';
import {
  ReportLevel,
  ReportPeriodicity,
  ReportSection,
} from '../../common/enums/report.enum.js';
import {
  DEFAULT_REPORT_TEMPLATES,
  checkTemplate,
  hasFarmRows,
} from './data/default-report-templates.js';
import { emptyFacts, metricsOf, sumFacts } from './pilotage-metrics.js';
import {
  ageWeek,
  alertLevel,
  boundaryCentre,
  completenessLevel,
  lastCompletePeriod,
  mortalityLevel,
  pct,
  periodContaining,
  projectProduction,
  resolvePeriod,
  suppressedKeys,
  weekStart,
} from './pilotage-rules.js';
import { fmt, frDate } from './report-pdf.js';

describe('resolvePeriod', () => {
  it('defaults to the last 30 days, today included', () => {
    expect(resolvePeriod(undefined, undefined, '2026-11-06')).toEqual({
      ok: true,
      period: { from: '2026-10-08', to: '2026-11-06' },
    });
  });

  it('refuses malformed, inverted and too long periods', () => {
    expect(resolvePeriod('2026-13-01', undefined, '2026-11-06').ok).toBe(false);
    expect(resolvePeriod('2026-11-06', '2026-11-01').ok).toBe(false);
    const long = resolvePeriod('2020-01-01', '2026-01-01');
    expect(long).toMatchObject({ ok: false });
    expect(!long.ok && long.error).toContain('trois ans');
  });
});

describe('suppressedKeys (small groups)', () => {
  it('hides a group below k and the smallest neighbour that would give it back', () => {
    const hidden = suppressedKeys(
      [
        { key: 'G1', farms: 20 },
        { key: 'G2', farms: 2 },
        { key: 'G3', farms: 8 },
        { key: 'G4', farms: 6 },
      ],
      5,
    );
    // G2 alone (2 farms) would be total − others: G4 (smallest visible) goes too.
    expect([...hidden].sort()).toEqual(['G2', 'G4']);
  });

  it('stops once the hidden groups hold k farms together', () => {
    const hidden = suppressedKeys(
      [
        { key: 'A', farms: 3 },
        { key: 'B', farms: 4 },
        { key: 'C', farms: 30 },
      ],
      5,
    );
    expect([...hidden].sort()).toEqual(['A', 'B']);
  });

  it('shows everything when every group is large enough, empty groups are not hidden', () => {
    expect(
      suppressedKeys(
        [
          { key: 'A', farms: 5 },
          { key: 'B', farms: 0 },
          { key: 'C', farms: 9 },
        ],
        5,
      ).size,
    ).toBe(0);
  });

  it('hides every group when the total itself is below k', () => {
    const hidden = suppressedKeys(
      [
        { key: 'A', farms: 1 },
        { key: 'B', farms: 2 },
        { key: 'C', farms: 0 },
      ],
      5,
    );
    expect([...hidden].sort()).toEqual(['A', 'B']);
  });

  it('cannot protect a single small group without neighbours', () => {
    expect([...suppressedKeys([{ key: 'A', farms: 2 }], 5)]).toEqual(['A']);
  });
});

describe('colour keys', () => {
  const t = { jaune: 3, rouge: 6 };
  it('mortality: higher is worse', () => {
    expect(mortalityLevel(null, t)).toBeNull();
    expect(mortalityLevel(2.9, t)).toBe('VERT');
    expect(mortalityLevel(3, t)).toBe('JAUNE');
    expect(mortalityLevel(6, t)).toBe('ROUGE');
  });
  it('completeness: lower is worse', () => {
    const c = { jaune: 90, rouge: 70 };
    expect(completenessLevel(95, c)).toBe('VERT');
    expect(completenessLevel(89.9, c)).toBe('JAUNE');
    expect(completenessLevel(69, c)).toBe('ROUGE');
  });
  it('alert: only a published sanitary alert colours a farm', () => {
    expect(alertLevel({ published: 0 })).toBe('VERT');
    expect(alertLevel({ published: 1 })).toBe('ROUGE');
  });
});

describe('age weeks and report periods', () => {
  it('week of age', () => {
    expect(ageWeek(0)).toBe(0);
    expect(ageWeek(6)).toBe(0);
    expect(ageWeek(7)).toBe(1);
    expect(ageWeek(-3)).toBe(0);
  });

  it('ISO weeks start on Monday', () => {
    expect(weekStart('2026-11-06')).toBe('2026-11-02'); // Friday
    expect(weekStart('2026-11-02')).toBe('2026-11-02'); // Monday
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday
    expect(
      periodContaining(ReportPeriodicity.HEBDOMADAIRE, '2026-11-06'),
    ).toEqual({
      from: '2026-11-02',
      to: '2026-11-08',
    });
  });

  it('months, and the last complete period', () => {
    expect(periodContaining(ReportPeriodicity.MENSUEL, '2026-02-14')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    const now = new Date('2026-11-06T10:00:00Z');
    expect(lastCompletePeriod(ReportPeriodicity.MENSUEL, now)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(lastCompletePeriod(ReportPeriodicity.HEBDOMADAIRE, now)).toEqual({
      from: '2026-10-26',
      to: '2026-11-01',
    });
    expect(
      lastCompletePeriod(
        ReportPeriodicity.MENSUEL,
        new Date('2027-01-01T00:30:00Z'),
      ),
    ).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('projectProduction', () => {
  const base = {
    places: 150_000,
    occupationPct: 80,
    bandsPerYear: 6,
    mortalityPct: 5,
    exitWeightKg: 2.2,
    growthPct: 0,
    cumulativeTonnes: 100,
    yearToDateTonnes: 100,
    today: '2026-12-31',
    firstYear: 2027,
    lastYear: 2030,
    objectiveTonnes: 100_000,
  };

  it('potential = places × occupation × bands × viability × weight', () => {
    // 150 000 × 0.8 × 6 × 0.95 × 2.2 / 1000 = 1 504.8 t
    const p = projectProduction(base);
    expect(p.annualPotentialTonnes).toBe(1504.8);
    expect(p.years.map((y) => y.year)).toEqual([2027, 2028, 2029, 2030]);
    expect(p.years[0]).toMatchObject({
      annualTonnes: 1504.8,
      cumulativeTonnes: 1604.8,
      objectiveSharePct: 1.5,
    });
    expect(p.years[3].cumulativeTonnes).toBe(round1(100 + 4 * 1504.8));
  });

  it('applies the yearly growth and the rest of the current year', () => {
    const p = projectProduction({
      ...base,
      today: '2027-07-02',
      yearToDateTonnes: 500,
      cumulativeTonnes: 600,
      growthPct: 10,
    });
    const y2027 = p.years[0];
    // 183 of 365 days elapsed → 182/365 of the potential still to come.
    const rest = (1504.8 * 182) / 365;
    expect(y2027.annualTonnes).toBeCloseTo(500 + rest, 0);
    expect(p.years[1].annualTonnes).toBeCloseTo(1504.8 * 1.1, 0);
    expect(p.years[3].annualTonnes).toBeCloseTo(1504.8 * 1.1 ** 3, 0);
  });

  it('no place, no projection', () => {
    const p = projectProduction({ ...base, places: 0 });
    expect(p.annualPotentialTonnes).toBe(0);
    expect(p.years[0].cumulativeTonnes).toBe(100);
  });
});

const round1 = (n: number) => Math.round(n * 10) / 10;

describe('metrics', () => {
  it('sums facts first, then derives rates (no mean of ratios)', () => {
    const a = {
      ...emptyFacts(),
      farms: 1,
      exposed: 100,
      deaths: 10,
      pieceQty: 10,
      pieceFcfa: 30_000,
    };
    const b = {
      ...emptyFacts(),
      farms: 1,
      exposed: 900,
      deaths: 9,
      pieceQty: 90,
      pieceFcfa: 225_000,
    };
    const m = metricsOf(sumFacts([a, b]));
    expect(m.farms).toBe(2);
    expect(m.mortalityPct).toBe(1.9); // 19 / 1000, not (10 % + 1 %) / 2
    expect(m.sold.avgPricePerHeadFcfa).toBe(2550);
    expect(metricsOf(emptyFacts()).mortalityPct).toBeNull();
  });

  it('pct is null without a base', () => {
    expect(pct(1, 0)).toBeNull();
    expect(pct(1, 3)).toBe(33.3);
  });
});

describe('report templates', () => {
  it('seeds the three CDC models with valid settings', () => {
    expect(DEFAULT_REPORT_TEMPLATES.map((t) => t.code)).toEqual([
      'HEBDOMADAIRE',
      'FIN_DE_BANDE',
      'MENSUEL_NATIONAL',
    ]);
    for (const t of DEFAULT_REPORT_TEMPLATES)
      expect(checkTemplate(t)).toEqual({ ok: true });
  });

  it('the national monthly names no farm, so MAEDR may receive it', () => {
    const monthly = DEFAULT_REPORT_TEMPLATES.find(
      (t) => t.code === 'MENSUEL_NATIONAL',
    )!;
    expect(hasFarmRows(monthly.level, monthly.sections)).toBe(false);
    expect(monthly.audience.scopeKinds).toContain(AccessScopeKind.AGGREGATE);
    expect(
      hasFarmRows(ReportLevel.PROVINCE, [ReportSection.FERMES_A_SUIVRE]),
    ).toBe(true);
    expect(hasFarmRows(ReportLevel.BANDE, [ReportSection.BILAN])).toBe(true);
  });

  it('refuses a section, periodicity or audience out of place', () => {
    const audience = { scopeKinds: [], profileCodes: [], farmOwners: false };
    expect(
      checkTemplate({
        level: ReportLevel.BANDE,
        periodicity: ReportPeriodicity.MENSUEL,
        sections: [ReportSection.BILAN],
        audience,
      }).ok,
    ).toBe(false);
    expect(
      checkTemplate({
        level: ReportLevel.PROVINCE,
        periodicity: ReportPeriodicity.HEBDOMADAIRE,
        sections: [ReportSection.OBJECTIF],
        audience,
      }).ok,
    ).toBe(false);
    expect(
      checkTemplate({
        level: ReportLevel.NATIONAL,
        periodicity: ReportPeriodicity.MENSUEL,
        sections: [],
        audience,
      }).ok,
    ).toBe(false);
    expect(
      checkTemplate({
        level: ReportLevel.NATIONAL,
        periodicity: ReportPeriodicity.MENSUEL,
        sections: [ReportSection.SYNTHESE],
        audience: { ...audience, scopeKinds: [AccessScopeKind.AUDIT] },
      }).ok,
    ).toBe(false);
  });
});

describe('PDF helpers', () => {
  it('formats French numbers and dates with plain spaces', () => {
    expect(fmt(1234567)).toBe('1 234 567');
    expect(fmt(-1504.8, 1)).toBe('-1 504,8');
    expect(fmt(null)).toBe('—');
    expect(frDate('2026-11-02')).toBe('02/11/2026');
  });

  it('centre of a province boundary', () => {
    expect(
      boundaryCentre({
        type: 'Polygon',
        coordinates: [
          [
            [9, 0],
            [10, 0],
            [10, 1],
            [9, 1],
            [9, 0],
          ],
        ],
      }),
    ).toEqual({ latitude: 0.5, longitude: 9.5 });
    expect(boundaryCentre(null)).toBeNull();
  });
});
