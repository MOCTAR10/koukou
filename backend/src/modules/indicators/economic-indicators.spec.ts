import { describe, expect, it } from 'vitest';
import {
  economicIndicatorKeys,
  economicView,
  withoutEconomicIndicators,
} from './economic-indicators.js';
import { POUFA_DEFAULT_FORMULAS } from './formula/formula-catalog.js';

const indicators = POUFA_DEFAULT_FORMULAS.map((f) => ({
  key: f.key,
  label: f.label,
  unit: f.unit,
  expression: f.expression,
  value: 1,
}));

describe('economicIndicatorKeys', () => {
  it('finds the money indicators of the default set', () => {
    expect([...economicIndicatorKeys(indicators)].sort()).toEqual([
      'cout_production_kg',
      'cout_production_tete',
      'marge_fcfa',
      'marge_kg',
      'taux_marge',
    ]);
  });

  it('follows a configured formula through the indicators it reads', () => {
    const keys = economicIndicatorKeys([
      { key: 'a', unit: '%', expression: 'taux_mortalite * 2' },
      { key: 'taux_mortalite', unit: '%', expression: 'morts_cumules / mis_en_place * 100' },
      { key: 'b', unit: '', expression: 'c + 1' },
      { key: 'c', unit: '', expression: 'charges_fcfa / presents' },
    ]);
    expect([...keys].sort()).toEqual(['b', 'c']);
  });

  it('counts an unparsable formula by its unit only', () => {
    const keys = economicIndicatorKeys([
      { key: 'x', unit: 'FCFA/kg', expression: '((' },
      { key: 'y', unit: '%', expression: '((' },
    ]);
    expect([...keys]).toEqual(['x']);
  });
});

describe('economicView', () => {
  const live = {
    batchId: 'b1',
    variables: { ca_fcfa: 120000, charges_fcfa: 80000, presents: 90 },
    indicators,
  };

  it('keeps everything for an economic reader', () => {
    const view = economicView(live, true);
    expect(view.economicMasked).toBe(false);
    expect(view.variables.ca_fcfa).toBe(120000);
    expect(view.indicators).toHaveLength(indicators.length);
  });

  it('removes the money part for another reader', () => {
    const view = economicView(live, false);
    expect(view.economicMasked).toBe(true);
    expect(view.variables).toEqual({ ca_fcfa: null, charges_fcfa: null, presents: 90 });
    const keys = view.indicators.map((i) => i.key);
    expect(keys).toContain('taux_mortalite');
    expect(keys).toContain('ic');
    expect(keys).not.toContain('marge_fcfa');
    expect(keys).not.toContain('cout_production_kg');
    expect(keys).not.toContain('taux_marge');
    // The input is not changed.
    expect(live.variables.ca_fcfa).toBe(120000);
  });

  it('nulls the money totals of a bilan or a summary', () => {
    const view = economicView(
      { version: 1, revenueFcfa: 5, chargesFcfa: 3, marginFcfa: 2, indicators: [] },
      false,
    );
    expect(view).toMatchObject({
      version: 1,
      revenueFcfa: null,
      chargesFcfa: null,
      marginFcfa: null,
      economicMasked: true,
    });
  });
});

describe('withoutEconomicIndicators', () => {
  it('keeps the technical indicators only', () => {
    const keys = withoutEconomicIndicators(indicators).map((i) => i.key);
    expect(keys).toEqual(
      POUFA_DEFAULT_FORMULAS.map((f) => f.key).filter(
        (k) => !['cout_production_kg', 'cout_production_tete', 'marge_fcfa', 'marge_kg', 'taux_marge'].includes(k),
      ),
    );
  });
});
