import { describe, expect, it } from 'vitest';
import {
  evaluateOfficialIndicators,
  formulasInForce,
  indicatorValue,
} from '../indicators/official-indicators.js';
import { bandeVariables, type BandeVariablesInput } from './bande-variables.js';

const entry = (
  entryDate: string,
  deaths: number,
  feedQuantity: number,
  avgWeightKg: number | null = null,
) => ({ entryDate, deaths, feedQuantity, waterL: 0, avgWeightKg });

const input = (over: Partial<BandeVariablesInput> = {}): BandeVariablesInput => ({
  integrationDate: '2026-10-01',
  initialAgeDays: 0,
  initialAvgWeightG: 40,
  day1WeightKg: 0.045,
  quantityAtStart: 1000,
  capacityPlaces: 2000,
  asOf: '2026-10-21',
  entries: [
    entry('2026-10-05', 20, 300),
    entry('2026-10-21', 10, 1700, 1),
  ],
  removalsByDate: new Map(),
  deathEventsByDate: new Map(),
  weighedSorties: [],
  revenueFcfa: null,
  chargesFcfa: null,
  ...over,
});

/** No stored version: the catalog « Proposé » formulas apply. */
const defaults = { version: () => null };

describe('bandeVariables', () => {
  it('derives the CDC variables of a band', () => {
    const v = bandeVariables(input());
    expect(v).toMatchObject({
      mis_en_place: 1000,
      morts_cumules: 30,
      morts_jour: 10,
      presents: 970,
      presents_veille: 980,
      sortis_tetes: 0,
      poids_sortis_kg: 0,
      poids_presents_kg: 970,
      poids_poussins_kg: 40,
      poids_moyen_g: 1000,
      poids_initial_g: 40,
      jours_elevage: 20,
      aliment_kg: 2000,
      capacite_places: 2000,
    });
  });

  it('feeds the default formulas (mortality, viability, GMQ, IC)', () => {
    const ind = evaluateOfficialIndicators(
      formulasInForce(defaults, new Date()),
      bandeVariables(input({ revenueFcfa: 0, chargesFcfa: 500_000 })),
    );
    expect(indicatorValue(ind, 'taux_mortalite')).toBeCloseTo(3);
    expect(indicatorValue(ind, 'viabilite')).toBeCloseTo(97);
    expect(indicatorValue(ind, 'gmq_g_j')).toBeCloseTo(48);
    expect(indicatorValue(ind, 'poids_vif_produit_kg')).toBeCloseTo(930);
    expect(indicatorValue(ind, 'ic')).toBeCloseTo(2000 / 930);
    expect(indicatorValue(ind, 'taux_occupation')).toBeCloseTo(50);
    // Division by zero → empty, never wrong.
    expect(indicatorValue(ind, 'taux_marge')).toBeNull();
    expect(ind.every((i) => i.parameterVersionId === null)).toBe(true);
  });

  it('weighs exits with the measured sortie weight, else the band weight', () => {
    const v = bandeVariables(
      input({
        asOf: '2026-10-21',
        removalsByDate: new Map([
          ['2026-10-21', 300],
          ['2026-10-11', 50],
        ]),
        deathEventsByDate: new Map([['2026-10-11', 50]]),
        weighedSorties: [{ date: '2026-10-21', count: 200, weightKg: 250 }],
      }),
    );
    // 50 on 10-11 are MORTALITE events (deaths); 300 left on 10-21 at 1 kg,
    // 200 of them weighed at 250 kg in all.
    expect(v.morts_cumules).toBe(80);
    expect(v.sortis_tetes).toBe(300);
    expect(v.poids_sortis_kg).toBeCloseTo(350);
    expect(v.presents).toBe(620);
  });

  it('counts days from hatching when no weight was measured at opening', () => {
    const v = bandeVariables(input({ initialAvgWeightG: null, initialAgeDays: 10 }));
    expect(v.poids_initial_g).toBe(45);
    expect(v.jours_elevage).toBe(30);
  });

  it('leaves weights empty before the first weighing', () => {
    const v = bandeVariables(input({ asOf: '2026-10-10' }));
    expect(v.poids_moyen_g).toBeNull();
    expect(v.poids_presents_kg).toBeNull();
    expect(v.jours_elevage).toBe(9);
  });
});
