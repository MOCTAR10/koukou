// POUFA lot A2 dge: completeness and produced volumes of the steering's
// aggregates go through the formula engine (CDC §7.3).
import { describe, expect, it } from 'vitest';
import { isPeriodIndicator } from '../indicators/formula/formula-catalog.js';
import {
  evaluateOfficialIndicators,
  formulasInForce,
  type FormulaVersionSource,
} from '../indicators/official-indicators.js';
import {
  checkFormulaSet,
  parameterDefinition,
} from '../programme/parameter-catalog.js';
import { perimeterOf } from './pilotage-dashboard.service.js';
import { emptyFacts, metricsOf } from './pilotage-metrics.js';
import {
  periodCompletenessPct,
  periodFormulasOf,
  periodProduced,
  pilotageRulesAt,
  tonnesOf,
  type ParameterValueSource,
} from './pilotage-programme.js';

function source(values: Record<string, unknown> = {}): ParameterValueSource {
  const version: FormulaVersionSource['version'] = (key) =>
    key in values
      ? { id: `v-${key}`, value: values[key], validFrom: new Date(0) }
      : null;
  return {
    version,
    value: <T>(key: string) =>
      (key in values
        ? values[key]
        : parameterDefinition(key)!.defaultValue) as T,
  };
}

const defaults = formulasInForce(source(), new Date());

describe('POUFA lot A2 — completeness and volumes by formula', () => {
  it('seeds the three formulas, « Proposé », owned by the DGE', () => {
    for (const [key, expression] of [
      ['FORMULE_COMPLETUDE_PCT', 'jours_saisis / jours_ecoules * 100'],
      ['FORMULE_VOLUME_PRODUIT_TETES', 'sortis_periode_tetes'],
      ['FORMULE_VOLUME_PRODUIT_KG', 'poids_sortis_periode_kg'],
    ]) {
      expect(parameterDefinition(key)).toMatchObject({
        type: 'formula',
        ownerProfile: 'DGE',
        defaultValue: expression,
      });
    }
  });

  it('keeps them out of a band’s own indicators', () => {
    expect(isPeriodIndicator('completude_pct')).toBe(true);
    expect(isPeriodIndicator('volume_produit_tetes')).toBe(true);
    expect(isPeriodIndicator('volume_produit_kg')).toBe(true);
    const band = evaluateOfficialIndicators(defaults, { mis_en_place: 100 });
    expect(band.find((i) => i.key === 'completude_pct')?.value).toBeNull();
  });

  it('accepts a DGE formula on the new variables, refuses an unknown one', () => {
    const set = new Map(
      defaults.map((f) => [f.parameterKey, f.expression] as const),
    );
    set.set('FORMULE_VOLUME_PRODUIT_KG', 'poids_sortis_periode_kg * 0.72');
    expect(checkFormulaSet(set)).toBeNull();
    set.set('FORMULE_COMPLETUDE_PCT', 'jours_inconnus / jours_ecoules');
    expect(checkFormulaSet(set)).toMatch(/jours_inconnus/);
  });

  it('computes completeness and volumes with the defaults', () => {
    expect(periodCompletenessPct(defaults, 27, 30)).toBe(90);
    expect(periodCompletenessPct(defaults, 0, 0)).toBeNull();
    expect(periodProduced(defaults, 120, 264.06)).toEqual({ heads: 120, kg: 264.1 });
    expect(tonnesOf(264.1)).toBe(0.264);
    expect(tonnesOf(null)).toBeNull();
  });

  it('follows a changed formula everywhere metricsOf is used', () => {
    const custom = formulasInForce(
      source({
        FORMULE_COMPLETUDE_PCT: 'jours_saisis / (jours_ecoules + 10) * 100',
        FORMULE_VOLUME_PRODUIT_KG: 'poids_sortis_periode_kg * 0.5',
      }),
      new Date(),
    );
    const f = {
      ...emptyFacts(),
      daysEntered: 10,
      daysElapsed: 10,
      exits: 50,
      exitKg: 110,
    };
    const plain = metricsOf(f);
    expect(plain.completeness.pct).toBe(100);
    expect(plain.produced).toEqual({ heads: 50, kg: 110, tonnes: 0.11 });
    const m = metricsOf(f, periodFormulasOf(custom));
    expect(m.completeness.pct).toBe(50);
    expect(m.produced).toEqual({ heads: 50, kg: 55, tonnes: 0.055 });
  });

  it('serves the formulas in force with the dashboards', () => {
    const p = perimeterOf(pilotageRulesAt(source(), '2026-11-06'));
    expect(p.completenessFormula).toEqual({
      expression: 'jours_saisis / jours_ecoules * 100',
      parameterKey: 'FORMULE_COMPLETUDE_PCT',
    });
    expect(p.producedFormulas.kg?.parameterKey).toBe('FORMULE_VOLUME_PRODUIT_KG');
  });
});
