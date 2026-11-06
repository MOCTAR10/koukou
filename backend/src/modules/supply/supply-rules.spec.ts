import { describe, expect, it } from 'vitest';
import { FeedPhase } from '../../common/enums/feed-phase.enum.js';
import { InputDeliveryStatus } from '../../common/enums/input-delivery.enum.js';
import {
  cancelRefusal,
  computeDeclarativeStock,
  confirmRefusal,
  declarativeKey,
  deliveryCode,
  deliveryCounterScope,
  isBagUnit,
  isDiscrepancy,
  kgPerUnit,
  subsidySplit,
  type DeclarativeLine,
  type LotUsage,
} from './supply-rules.js';

describe('supply-rules: codes', () => {
  it('builds the delivery code from the farm code and rank', () => {
    expect(deliveryCode('G1-0012', 3)).toBe('G1-0012-L03');
    expect(deliveryCode('G1-0012', 123)).toBe('G1-0012-L123');
    expect(deliveryCounterScope('G1-0012')).toBe('LIVRAISON:G1-0012');
    expect(() => deliveryCode('G1-0012', 0)).toThrow(RangeError);
  });
});

describe('supply-rules: units', () => {
  it('reads the seeded mass units without meta', () => {
    expect(kgPerUnit({ code: 'KG' })).toBe(1);
    expect(kgPerUnit({ code: 'TONNE' })).toBe(1000);
    expect(kgPerUnit({ code: 'TETE' })).toBeNull();
    expect(kgPerUnit({ code: 'DOSE' })).toBeNull();
  });

  it('weighs a bag from the line, then the farm, then 50 kg', () => {
    expect(isBagUnit({ code: 'SAC' })).toBe(true);
    expect(kgPerUnit({ code: 'SAC' }, 25, 40)).toBe(25);
    expect(kgPerUnit({ code: 'SAC' }, null, 40)).toBe(40);
    expect(kgPerUnit({ code: 'SAC' })).toBe(50);
  });

  it('lets a configured unit declare its mass', () => {
    expect(kgPerUnit({ code: 'SAC_25', meta: { kgPerUnit: 25 } }, 50)).toBe(25);
    expect(isBagUnit({ code: 'SAC', meta: { kgPerUnit: 25 } })).toBe(false);
    expect(kgPerUnit({ code: 'BIGBAG', meta: { bag: true } }, 600)).toBe(600);
    expect(kgPerUnit({ code: 'X', meta: { kgPerUnit: -1 } })).toBeNull();
  });
});

describe('supply-rules: subsidy split', () => {
  it('keeps the subsidy apart from what the farm pays', () => {
    expect(subsidySplit(10, 15_000, true, 70)).toEqual({
      grossFcfa: 150_000,
      farmerCostFcfa: 45_000,
      subsidyFcfa: 105_000,
    });
  });

  it('always adds up to the gross value in integer FCFA', () => {
    const s = subsidySplit(3, 333, true, 33.3)!;
    expect(s.farmerCostFcfa + s.subsidyFcfa).toBe(s.grossFcfa);
    expect(Number.isInteger(s.farmerCostFcfa)).toBe(true);
  });

  it('charges the full value without subsidy, nothing at 100 %', () => {
    expect(subsidySplit(2, 1000, false, null)?.farmerCostFcfa).toBe(2000);
    expect(subsidySplit(2, 1000, true, 100)?.farmerCostFcfa).toBe(0);
    expect(subsidySplit(2, null, true, 50)).toBeNull();
  });
});

describe('supply-rules: status', () => {
  it('confirms or cancels only an EXPEDIEE delivery', () => {
    expect(confirmRefusal(InputDeliveryStatus.EXPEDIEE)).toBeNull();
    expect(confirmRefusal(InputDeliveryStatus.CONFIRMEE)).toMatch(/déjà/);
    expect(confirmRefusal(InputDeliveryStatus.ANNULEE)).toMatch(/annulée/);
    expect(cancelRefusal(InputDeliveryStatus.EXPEDIEE)).toBeNull();
    expect(cancelRefusal(InputDeliveryStatus.CONFIRMEE)).toMatch(/confirmée/);
    expect(cancelRefusal(InputDeliveryStatus.ANNULEE)).toMatch(/déjà/);
  });

  it('detects a discrepancy beyond rounding noise', () => {
    expect(isDiscrepancy(10, 10)).toBe(false);
    expect(isDiscrepancy(0.3, 0.1 + 0.2)).toBe(false);
    expect(isDiscrepancy(10, 9.5)).toBe(true);
  });
});

describe('supply-rules: declarative stock', () => {
  const feed = (over: Partial<DeclarativeLine> = {}): DeclarativeLine => ({
    intrantCode: 'ALIMENT_DEMARRAGE',
    intrantFamily: 'ALIMENT',
    unitCode: 'SAC',
    feedPhase: FeedPhase.DEMARRAGE,
    received: 500,
    shippedAt: '2026-11-01',
    inputLotId: 'lot-1',
    ...over,
  });
  const usage = (entries: Array<[string, Partial<LotUsage>]>) =>
    new Map(
      entries.map(([id, u]) => [
        id,
        { consumed: 0, lost: 0, sold: 0, physical: 0, ...u },
      ]),
    );
  const none = { feed: [], chicks: [] };

  it('keys feed and chicks by intrant, other inputs by intrant and unit', () => {
    expect(declarativeKey(feed())).toBe('ALIMENT_DEMARRAGE');
    expect(
      declarativeKey({
        intrantCode: 'VACCIN',
        intrantFamily: 'VACCIN',
        unitCode: 'DOSE',
      }),
    ).toBe('VACCIN|DOSE');
  });

  it('subtracts what was recorded on the delivery lots', () => {
    const [row] = computeDeclarativeStock(
      [feed()],
      usage([['lot-1', { consumed: 120, lost: 5, sold: 25, physical: 350 }]]),
      none,
    );
    expect(row).toMatchObject({
      unitCode: 'KG',
      received: 500,
      consumed: 120,
      lost: 5,
      sold: 25,
      used: 150,
      stock: 350,
      physicalStock: 350,
      negative: false,
    });
  });

  it('counts feed typed with no lot of its phase, from the first shipping day', () => {
    const [row] = computeDeclarativeStock(
      [feed()],
      usage([['lot-1', { consumed: 500, physical: 0 }]]),
      {
        feed: [
          { phase: FeedPhase.DEMARRAGE, date: '2026-10-30', kg: 40 },
          { phase: FeedPhase.DEMARRAGE, date: '2026-11-03', kg: 60 },
          { phase: FeedPhase.CROISSANCE, date: '2026-11-03', kg: 70 },
        ],
        chicks: [],
      },
    );
    expect(row.consumed).toBe(560);
    expect(row.stock).toBe(-60);
    expect(row.negative).toBe(true);
    // The physical FEFO stock never goes negative.
    expect(row.physicalStock).toBe(0);
  });

  it('gives unlinked feed to the intrant of that phase shipped last', () => {
    const rows = computeDeclarativeStock(
      [
        feed({
          intrantCode: 'A_OLD',
          shippedAt: '2026-10-01',
          inputLotId: null,
        }),
        feed({
          intrantCode: 'B_NEW',
          shippedAt: '2026-11-01',
          inputLotId: null,
        }),
      ],
      new Map(),
      {
        feed: [{ phase: FeedPhase.DEMARRAGE, date: '2026-10-15', kg: 30 }],
        chicks: [],
      },
    );
    expect(rows.find((r) => r.intrantCode === 'A_OLD')?.consumed).toBe(0);
    expect(rows.find((r) => r.intrantCode === 'B_NEW')?.consumed).toBe(30);
  });

  it('counts chicks placed in the bands opened since the first chick delivery', () => {
    const [row] = computeDeclarativeStock(
      [
        {
          intrantCode: 'POUSSINS',
          intrantFamily: 'POUSSIN',
          unitCode: 'TETE',
          feedPhase: null,
          received: 1000,
          shippedAt: '2026-11-01',
          inputLotId: 'chicks',
        },
      ],
      usage([['chicks', {}]]),
      {
        feed: [],
        chicks: [
          { date: '2026-09-01', heads: 800 },
          { date: '2026-11-02', heads: 1100 },
        ],
      },
    );
    expect(row).toMatchObject({
      unitCode: 'TETE',
      consumed: 1100,
      stock: -100,
      physicalStock: null,
      negative: true,
    });
  });

  it('tracks other inputs in their unit, from the lot', () => {
    const rows = computeDeclarativeStock(
      [
        {
          intrantCode: 'VACCIN',
          intrantFamily: 'VACCIN',
          unitCode: 'DOSE',
          feedPhase: null,
          received: 1000,
          shippedAt: '2026-11-01',
          inputLotId: 'vac',
        },
        {
          intrantCode: 'VACCIN',
          intrantFamily: 'VACCIN',
          unitCode: 'FLACON',
          feedPhase: null,
          received: 2,
          shippedAt: '2026-11-01',
          inputLotId: null,
        },
      ],
      usage([['vac', { consumed: 300, physical: 700 }]]),
      none,
    );
    expect(rows.map((r) => [r.key, r.stock, r.physicalStock])).toEqual([
      ['VACCIN|DOSE', 700, 700],
      ['VACCIN|FLACON', 2, 0],
    ]);
  });
});
