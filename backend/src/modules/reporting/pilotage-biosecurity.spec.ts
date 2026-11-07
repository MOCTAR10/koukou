import {
  biosecurityBlock,
  biosecurityFigures,
  daysBetween,
  isStale,
  latestControls,
  NEVER_CONTROLLED,
  type ControlRow,
} from './pilotage-biosecurity.js';

const TODAY = '2026-11-07';

const row = (over: Partial<ControlRow> & { farmId: string }): ControlRow => ({
  visitDate: '2026-10-01',
  classification: 'B',
  scorePct: 70,
  ...over,
});

describe('latestControls', () => {
  it('keeps the most recent control of each farm, not the best one', () => {
    const m = latestControls(
      ['f1', 'f2'],
      [
        row({ farmId: 'f1', visitDate: '2026-01-10', classification: 'A', scorePct: 90 }),
        row({ farmId: 'f1', visitDate: '2026-09-10', classification: 'C', scorePct: 40 }),
        row({ farmId: 'f2', visitDate: '2026-08-01', classification: 'B', scorePct: 65 }),
      ],
      TODAY,
      365,
    );
    expect(m.get('f1')).toMatchObject({
      classification: 'C',
      scorePct: 40,
      visitDate: '2026-09-10',
      stale: false,
    });
    expect(m.get('f2')?.classification).toBe('B');
  });

  it('breaks a same-day tie with the most recently recorded visit', () => {
    const m = latestControls(
      ['f1'],
      [
        row({ farmId: 'f1', classification: 'A', scorePct: 85, createdAt: '2026-10-01T08:00:00Z' }),
        row({ farmId: 'f1', classification: 'B', scorePct: 65, createdAt: '2026-10-01T15:00:00Z' }),
      ],
      TODAY,
      365,
    );
    expect(m.get('f1')?.classification).toBe('B');
  });

  it('counts a farm without any classified visit as never controlled', () => {
    const m = latestControls(
      ['f1', 'f2'],
      [row({ farmId: 'f1' }), row({ farmId: 'f2', classification: null, scorePct: null })],
      TODAY,
      365,
    );
    expect(m.get('f2')).toEqual(NEVER_CONTROLLED);
  });

  it('flags a control older than the threshold, never when the threshold is 0', () => {
    expect(daysBetween('2026-11-06', TODAY)).toBe(1);
    expect(isStale('2025-11-07', TODAY, 365)).toBe(false);
    expect(isStale('2025-11-06', TODAY, 365)).toBe(true);
    expect(isStale('2020-01-01', TODAY, 0)).toBe(false);
    const m = latestControls(['f1'], [row({ farmId: 'f1', visitDate: '2025-01-01' })], TODAY, 365);
    expect(m.get('f1')?.stale).toBe(true);
  });
});

describe('biosecurityFigures', () => {
  it('distributes A/B/C/never, averages the latest scores', () => {
    const m = latestControls(
      ['a', 'b', 'c', 'd'],
      [
        row({ farmId: 'a', classification: 'A', scorePct: 90 }),
        row({ farmId: 'b', classification: 'C', scorePct: 40, visitDate: '2024-01-01' }),
        row({ farmId: 'c', classification: 'B', scorePct: 65 }),
      ],
      TODAY,
      365,
    );
    expect(biosecurityFigures([...m.values()])).toEqual({
      farms: 4,
      controlled: 3,
      neverControlled: 1,
      classA: 1,
      classB: 1,
      classC: 1,
      stale: 1,
      averageScorePct: 65,
      controlledPct: 75,
    });
  });

  it('gives null rates for an empty group or without controlled farm', () => {
    expect(biosecurityFigures([]).controlledPct).toBeNull();
    const none = biosecurityFigures([NEVER_CONTROLLED]);
    expect(none.averageScorePct).toBeNull();
    expect(none.controlledPct).toBe(0);
  });
});

describe('biosecurityBlock (k-anonymity)', () => {
  const provinces = [
    { id: 'p1', code: 'G1', name: 'Estuaire', sort: 1 },
    { id: 'p2', code: 'G2', name: 'Haut-Ogooué', sort: 2 },
  ];
  const farms = (n: number, provinceId: string, from = 0) =>
    Array.from({ length: n }, (_, i) => ({ id: `${provinceId}-${from + i}`, provinceId }));
  const none = new Map();

  it('shows everything to a non-aggregate view', () => {
    const b = biosecurityBlock([...farms(2, 'p1'), ...farms(1, 'p2')], none, provinces, {
      aggregateOnly: false,
      k: 5,
      staleAfterDays: 365,
    });
    expect(b.suppressed).toBe(false);
    expect(b.total?.neverControlled).toBe(3);
    expect(b.provinces.map((g) => g.suppressed)).toEqual([false, false]);
  });

  it('hides a province under k farms and its smallest neighbour (no difference attack)', () => {
    const b = biosecurityBlock(
      [...farms(8, 'p1'), ...farms(2, 'p2')],
      none,
      provinces,
      { aggregateOnly: true, k: 5, staleAfterDays: 365 },
    );
    expect(b.total?.farms).toBe(10);
    const g1 = b.provinces.find((g) => g.code === 'G1')!;
    const g2 = b.provinces.find((g) => g.code === 'G2')!;
    expect(g2.suppressed).toBe(true);
    expect(g2.figures).toBeNull();
    // Hidden farms (2) < k: the visible one is hidden too, else total - G1 = G2.
    expect(g1.suppressed).toBe(true);
  });

  it('hides the total and every group when the scope holds under k farms', () => {
    const b = biosecurityBlock(farms(3, 'p1'), none, provinces, {
      aggregateOnly: true,
      k: 5,
      staleAfterDays: 365,
    });
    expect(b.suppressed).toBe(true);
    expect(b.total).toBeNull();
    expect(b.provinces[0].figures).toBeNull();
  });

  it('shows groups of k farms or more', () => {
    const b = biosecurityBlock([...farms(5, 'p1'), ...farms(6, 'p2')], none, provinces, {
      aggregateOnly: true,
      k: 5,
      staleAfterDays: 365,
    });
    expect(b.provinces.every((g) => !g.suppressed)).toBe(true);
    expect(b.provinces[0].figures?.farms).toBe(5);
  });
});
