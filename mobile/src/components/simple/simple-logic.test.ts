import { describe, expect, it } from 'vitest';

import type { BatchWithMetrics, DailyEntryRecord } from '@/api/types';
import {
  buildProblemDeclaration,
  buildSimplePayload,
  careBucket,
  caresToDo,
  joinEggs,
  PROBLEM_TITLE,
  pressKey,
  problemRefusal,
  resolveFeedChoice,
  sacsOfEntry,
  splitEggs,
  stepValue,
  tileState,
  pickBand,
  validateSimple,
  visibleActions,
  type TileContext,
} from './simple-logic';

const entry = (over: Partial<DailyEntryRecord> = {}): DailyEntryRecord => ({
  id: 'e1',
  batchId: 'b1',
  entryDate: '2026-11-18',
  deaths: 0,
  feedQuantity: 0,
  feedUnit: null,
  bagSizeKg: null,
  feedPhase: null,
  customFeedPhaseName: null,
  inputLotId: null,
  skipStockDeduction: false,
  waterL: 0,
  avgWeightKg: null,
  eggsCollected: 0,
  eggsSellable: 0,
  eggsCracked: 0,
  eggsSmall: 0,
  eggsDoubleYolk: 0,
  eggsDirty: 0,
  source: 'MANUELLE',
  createdAt: '2026-11-18T06:00:00Z',
  updatedAt: '2026-11-18T07:00:00Z',
  ...over,
});

const ctx = (over: Partial<TileContext> = {}): TileContext => ({
  entry: null,
  localDone: new Set(),
  caresLate: 0,
  caresDueToday: 0,
  weighingDue: null,
  ...over,
});

describe('tileState', () => {
  it('is to do until the field is entered, then done', () => {
    expect(tileState('eau', ctx())).toBe('todo');
    expect(tileState('eau', ctx({ entry: entry({ waterL: 120 }) }))).toBe('done');
    expect(tileState('morts', ctx({ entry: entry({ deaths: 2 }) }))).toBe('done');
    expect(tileState('oeufs', ctx({ entry: entry({ eggsCollected: 90 }) }))).toBe('done');
  });

  it('counts an entry saved offline from this phone as done', () => {
    expect(tileState('aliment', ctx({ localDone: new Set(['aliment'] as const) }))).toBe('done');
  });

  it('weighing: done today, hidden when not due, otherwise to do', () => {
    expect(tileState('pesee', ctx({ entry: entry({ avgWeightKg: 1.2 }) }))).toBe('done');
    expect(tileState('pesee', ctx({ weighingDue: false }))).toBe('none');
    expect(tileState('pesee', ctx({ weighingDue: true }))).toBe('todo');
    expect(tileState('pesee', ctx())).toBe('todo');
  });

  it('vaccine is red when a care is late, orange when due today', () => {
    expect(tileState('vaccin', ctx({ caresLate: 1, caresDueToday: 2 }))).toBe('late');
    expect(tileState('vaccin', ctx({ caresDueToday: 1 }))).toBe('todo');
    expect(tileState('vaccin', ctx())).toBe('none');
  });

  it('report and sale carry no badge', () => {
    expect(tileState('probleme', ctx())).toBe('none');
    expect(tileState('vendre', ctx())).toBe('none');
  });
});

describe('cares', () => {
  const today = '2026-11-18';
  it('buckets a care against today', () => {
    expect(careBucket({ status: 'PLANIFIE', scheduledDate: '2026-11-17' }, today)).toBe('late');
    expect(careBucket({ status: 'EN_RETARD', scheduledDate: '2026-11-20' }, today)).toBe('late');
    expect(careBucket({ status: 'PLANIFIE', scheduledDate: '2026-11-18T00:00:00Z' }, today)).toBe('today');
    expect(careBucket({ status: 'PLANIFIE', scheduledDate: '2026-11-25' }, today)).toBe('later');
    expect(careBucket({ status: 'FAIT', scheduledDate: '2026-11-10' }, today)).toBe('closed');
  });

  it('keeps late and due-today cares, oldest first', () => {
    const list = [
      { status: 'PLANIFIE' as const, scheduledDate: '2026-11-18' },
      { status: 'PLANIFIE' as const, scheduledDate: '2026-12-01' },
      { status: 'EN_RETARD' as const, scheduledDate: '2026-11-15' },
      { status: 'FAIT' as const, scheduledDate: '2026-11-01' },
    ];
    expect(caresToDo(list, today).map((c) => c.scheduledDate)).toEqual(['2026-11-15', '2026-11-18']);
  });
});

describe('buildSimplePayload (merge into the day entry)', () => {
  it('sends only the touched field, with the existing entry as base', () => {
    const existing = entry({ deaths: 1, feedQuantity: 100, waterL: 80, updatedAt: '2026-11-18T08:00:00Z' });
    const p = buildSimplePayload({ kind: 'morts', deaths: 3 }, '2026-11-18', existing);
    expect(p.deaths).toBe(3);
    expect(p.feedQuantity).toBeUndefined();
    expect(p.waterL).toBeUndefined();
    expect(p.baseUpdatedAt).toBe('2026-11-18T08:00:00Z');
    expect(p.baseValues?.feedQuantity).toBe(100);
    expect(p.baseValues?.waterL).toBe(80);
  });

  it('is a plain new entry (no base) when the day has none, and keeps a zero answer', () => {
    const p = buildSimplePayload({ kind: 'morts', deaths: 0 }, '2026-11-18', null);
    expect(p).toEqual({ entryDate: '2026-11-18', deaths: 0 });
  });

  it('eggs: collected + sellable net of the rejects already entered', () => {
    const existing = entry({ eggsCollected: 60, eggsCracked: 4, eggsDirty: 2 });
    const p = buildSimplePayload({ kind: 'oeufs', eggs: 100 }, '2026-11-18', existing);
    expect(p.eggsCollected).toBe(100);
    expect(p.eggsSellable).toBe(94);
    expect(buildSimplePayload({ kind: 'oeufs', eggs: 100 }, '2026-11-18', null).eggsSellable).toBe(100);
  });

  it('weight: grams to kg, with the sample size', () => {
    const p = buildSimplePayload({ kind: 'pesee', weightG: 1820, sampleSize: 30 }, '2026-11-18', null);
    expect(p.avgWeightKg).toBeCloseTo(1.82);
    expect(p.sampleSize).toBe(30);
  });

  it('feed: whole sacks go as SAC with the phase and lot, a half sack as kg', () => {
    const feed = { feedPhase: 'CROISSANCE' as const, inputLotId: 'lot-1', skipStockDeduction: false };
    const whole = buildSimplePayload({ kind: 'aliment', sacs: 2, bagSizeKg: 25, feed }, '2026-11-18', null);
    expect(whole).toMatchObject({ feedUnit: 'SAC', feedBags: 2, bagSizeKg: 25, feedPhase: 'CROISSANCE', inputLotId: 'lot-1' });
    const half = buildSimplePayload({ kind: 'aliment', sacs: 2.5, bagSizeKg: 25, feed }, '2026-11-18', null);
    expect(half).toMatchObject({ feedUnit: 'KG', feedQuantity: 62.5 });
    expect(half.feedBags).toBeUndefined();
    const external = buildSimplePayload(
      { kind: 'aliment', sacs: 1, bagSizeKg: 25, feed: { ...feed, skipStockDeduction: true, inputLotId: null } },
      '2026-11-18',
      null,
    );
    expect(external.skipStockDeduction).toBe(true);
    expect(external.inputLotId).toBeUndefined();
  });

  it('feed corrected back to zero clears the quantity', () => {
    const feed = { feedPhase: 'DEMARRAGE' as const, inputLotId: null, skipStockDeduction: false };
    const p = buildSimplePayload({ kind: 'aliment', sacs: 0, bagSizeKg: 25, feed }, '2026-11-18', entry({ feedQuantity: 50 }));
    expect(p).toMatchObject({ feedUnit: 'KG', feedQuantity: 0 });
  });
});

describe('resolveFeedChoice / sacsOfEntry', () => {
  const lot = { type: 'CHAIR', metrics: { ageDays: 30 } } as unknown as BatchWithMetrics;
  const stock = { byType: [{ feedPhase: 'CROISSANCE' as const, suggestedLotId: 'fefo' }] };

  it('picks the age phase and the FEFO lot by default', () => {
    expect(resolveFeedChoice(lot, null, stock)).toEqual({ feedPhase: 'CROISSANCE', inputLotId: 'fefo', skipStockDeduction: false });
  });

  it('keeps the phase, lot and external-purchase flag of the day entry', () => {
    expect(resolveFeedChoice(lot, entry({ feedPhase: 'FINITION', inputLotId: 'mine' }), stock)).toEqual({
      feedPhase: 'FINITION',
      inputLotId: 'mine',
      skipStockDeduction: false,
    });
    expect(resolveFeedChoice(lot, entry({ skipStockDeduction: true }), stock).skipStockDeduction).toBe(true);
  });

  it('rounds the sacks of the day entry to the half sack', () => {
    expect(sacsOfEntry(entry({ feedQuantity: 62.5 }), 25)).toBe(2.5);
    expect(sacsOfEntry(entry({ feedQuantity: 0 }), 25)).toBe(0);
    expect(sacsOfEntry(null, 25)).toBe(0);
  });
});

describe('eggs and refusals', () => {
  it('splits and joins alvéoles of 30', () => {
    expect(splitEggs(95)).toEqual({ alveoles: 3, loose: 5 });
    expect(joinEggs(3, 5)).toBe(95);
  });

  it('refuses impossible answers in simple French', () => {
    expect(validateSimple({ kind: 'morts', deaths: 50 }, { live: 50, existing: null })).toMatch(/vivantes/);
    expect(validateSimple({ kind: 'morts', deaths: 0 }, { live: 50, existing: null })).toBeNull();
    expect(validateSimple({ kind: 'eau', waterL: 0 }, { live: 50, existing: null })).toMatch(/litres/);
    expect(validateSimple({ kind: 'eau', waterL: 0 }, { live: 50, existing: entry({ waterL: 40 }) })).toBeNull();
    expect(validateSimple({ kind: 'pesee', weightG: 1500, sampleSize: 0 }, { live: 50, existing: null })).toMatch(/pesé/);
    expect(validateSimple({ kind: 'pesee', weightG: 1500, sampleSize: 60 }, { live: 50, existing: null })).toMatch(/plus de poules/);
    expect(validateSimple({ kind: 'pesee', weightG: 1500, sampleSize: 30 }, { live: 50, existing: null })).toBeNull();
  });
});

describe('keypad', () => {
  it('appends digits, drops the last one, clears', () => {
    expect(pressKey(0, 4)).toBe(4);
    expect(pressKey(4, 2)).toBe(42);
    expect(pressKey(42, 'back')).toBe(4);
    expect(pressKey(42, 'clear')).toBe(0);
  });

  it('refuses a digit that would pass the maximum', () => {
    expect(pressKey(99999, 1)).toBe(99999);
    expect(pressKey(50, 5, 100)).toBe(50);
  });

  it('steps by the given amount within 0 and the maximum', () => {
    expect(stepValue(5, 1)).toBe(6);
    expect(stepValue(0, -1)).toBe(0);
    expect(stepValue(98, 5, 100)).toBe(100);
  });
});

describe('problem report', () => {
  it('builds a yellow symptom declaration with the signs and the count', () => {
    const d = buildProblemDeclaration({ signs: ['TOUX', 'TOUX', 'DIARRHEE'], count: 4, today: '2026-11-18' });
    expect(d).toMatchObject({ kind: 'SYMPTOME', severity: 'JAUNE', occurredAt: '2026-11-18', quantity: 4, clinicalSigns: ['TOUX', 'DIARRHEE'] });
    expect(d.title).toBe(PROBLEM_TITLE);
    expect(d.suspicion).toBeUndefined();
  });

  it('omits an empty count and refuses an empty report', () => {
    expect(buildProblemDeclaration({ signs: ['TOUX'], count: 0, today: '2026-11-18' }).quantity).toBeUndefined();
    expect(problemRefusal([], 0, 0)).toMatch(/Touchez/);
    expect(problemRefusal([], 0, 1)).toBeNull();
    expect(problemRefusal(['TOUX'], 0, 0)).toBeNull();
    expect(problemRefusal([], 3, 0)).toBeNull();
  });
});

describe('home tiles', () => {
  const facts = { isLayer: false, hasCares: false, canEnter: true, canReport: true, canSell: false };

  it('shows the daily entries and the report, eggs only for a layer band', () => {
    expect(visibleActions(facts)).toEqual(['morts', 'aliment', 'eau', 'pesee', 'probleme']);
    expect(visibleActions({ ...facts, isLayer: true })).toEqual(['morts', 'aliment', 'eau', 'oeufs', 'pesee', 'probleme']);
  });

  it('adds the vaccine tile only with cares due, and the sale tile only with the right', () => {
    expect(visibleActions({ ...facts, hasCares: true })).toContain('vaccin');
    expect(visibleActions({ ...facts, canSell: true })).toEqual(['morts', 'aliment', 'eau', 'pesee', 'probleme', 'vendre']);
    expect(visibleActions({ ...facts, canEnter: false, canReport: false })).toEqual([]);
  });

  it('picks the remembered band, else the only one, else asks', () => {
    const bands = [{ id: 'a' }, { id: 'b' }];
    expect(pickBand(bands, 'b')?.id).toBe('b');
    expect(pickBand(bands, null)).toBeNull();
    expect(pickBand(bands, 'gone')).toBeNull();
    expect(pickBand([{ id: 'a' }], null)?.id).toBe('a');
  });
});
