import { describe, expect, it } from 'vitest';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { POUFA_DEFAULT_FORMULAS } from '../indicators/formula/formula-catalog.js';
import {
  checkFormulaSet,
  checkParameterValue,
  formulaParameterKey,
  indicatorKeyOf,
  PARAMETER_CATALOG,
  parameterDefinition,
  seedReason,
  SEED_REASON,
} from './parameter-catalog.js';
import { DEFAULT_REF_LISTS } from './data/default-ref-lists.js';
import { familyError } from './ref-list-families.js';

const def = (key: string) => {
  const d = parameterDefinition(key);
  if (!d) throw new Error(`missing ${key}`);
  return d;
};

const defaultFormulas = () =>
  new Map(
    PARAMETER_CATALOG.filter((d) => d.type === 'formula').map((d) => [
      d.key,
      String(d.defaultValue),
    ]),
  );

describe('parameter catalog', () => {
  it('holds the spec defaults with their owners', () => {
    expect(def('BANDE_DUREE_REFERENCE_J')).toMatchObject({
      defaultValue: 45,
      ownerProfile: 'DGE',
      type: 'integer',
    });
    expect(def('PESEE_FREQUENCE_J').defaultValue).toBe(7);
    expect(def('PESEE_ECHANTILLON_TETES').defaultValue).toBe(30);
    expect(def('SEUIL_ALERTE_MORTALITE_JOUR_PCT')).toMatchObject({
      defaultValue: 1,
      ownerProfile: 'VETERINAIRE',
    });
    expect(seedReason(def('SEUIL_ALERTE_MORTALITE_JOUR_PCT'))).toContain(
      'à fixer par les services vétérinaires',
    );
    expect(seedReason(def('PESEE_FREQUENCE_J'))).toBe(SEED_REASON);
    expect(def('SEUIL_ECART_INTRANTS_PCT').defaultValue).toBe(10);
    expect(def('SEUIL_ECART_RECEPTION_ABATTOIR_PCT').defaultValue).toBe(2);
    expect(def('SEUIL_TRACABILITE_QR_PCT').defaultValue).toBe(95);
  });

  it('has one FORMULE_* key per default indicator, keys unique', () => {
    const formulas = PARAMETER_CATALOG.filter((d) => d.type === 'formula');
    expect(formulas).toHaveLength(POUFA_DEFAULT_FORMULAS.length);
    expect(formulas).toHaveLength(12);
    expect(def('FORMULE_TAUX_MORTALITE').defaultValue).toBe(
      'morts_cumules / mis_en_place * 100',
    );
    const keys = PARAMETER_CATALOG.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(formulaParameterKey('gmq_g_j')).toBe('FORMULE_GMQ_G_J');
    expect(indicatorKeyOf('FORMULE_GMQ_G_J')).toBe('gmq_g_j');
    expect(indicatorKeyOf('PESEE_FREQUENCE_J')).toBeNull();
  });

  it('every default value passes its own check', () => {
    for (const d of PARAMETER_CATALOG) {
      expect(checkParameterValue(d, d.defaultValue).ok, d.key).toBe(true);
    }
  });

  it('is unknown outside the catalog', () => {
    expect(parameterDefinition('INCONNU')).toBeNull();
  });
});

describe('checkParameterValue', () => {
  it('checks types and ranges with French messages', () => {
    const freq = def('PESEE_FREQUENCE_J');
    expect(checkParameterValue(freq, 14)).toEqual({ ok: true, value: 14 });
    expect(checkParameterValue(freq, 7.5)).toEqual({
      ok: false,
      error: '« Fréquence des pesées » doit être un nombre entier.',
    });
    expect(checkParameterValue(freq, '7')).toMatchObject({ ok: false });
    expect(checkParameterValue(freq, 0)).toEqual({
      ok: false,
      error: '« Fréquence des pesées » doit être au moins 1 jours.',
    });
    expect(checkParameterValue(freq, Number.NaN).ok).toBe(false);

    const pct = def('SEUIL_ALERTE_MORTALITE_JOUR_PCT');
    expect(checkParameterValue(pct, 0.5).ok).toBe(true);
    expect(checkParameterValue(pct, 101)).toMatchObject({ ok: false });
  });

  it('trims a formula and refuses an empty one', () => {
    const f = def('FORMULE_VIABILITE');
    expect(checkParameterValue(f, '  100 - taux_mortalite ')).toEqual({
      ok: true,
      value: '100 - taux_mortalite',
    });
    expect(checkParameterValue(f, '   ').ok).toBe(false);
    expect(checkParameterValue(f, 3).ok).toBe(false);
  });
});

describe('checkFormulaSet', () => {
  it('accepts the default set', () => {
    expect(checkFormulaSet(defaultFormulas())).toBeNull();
  });

  it('reports an unknown variable with the indicator in French', () => {
    const set = defaultFormulas();
    set.set('FORMULE_TAUX_MORTALITE', 'morts_cumules / effectif_inconnu * 100');
    expect(checkFormulaSet(set)).toMatch(
      /^Indicateur « taux_mortalite » : .*effectif_inconnu/,
    );
  });

  it('reports a cycle across indicators', () => {
    const set = defaultFormulas();
    set.set('FORMULE_TAUX_MORTALITE', '100 - viabilite');
    expect(checkFormulaSet(set)).toContain('dépendance circulaire');
  });
});

describe('list families', () => {
  it('requires a known family where the list has families, none elsewhere', () => {
    expect(familyError(ProgramListType.MOTIF_SORTIE, 'VENTE')).toBeNull();
    expect(familyError(ProgramListType.MOTIF_SORTIE, undefined)).toContain(
      'Famille obligatoire',
    );
    expect(familyError(ProgramListType.MOTIF_SORTIE, 'TROC')).toContain(
      'inconnue',
    );
    expect(familyError(ProgramListType.COHORTE, null)).toBeNull();
    expect(familyError(ProgramListType.COHORTE, 'X')).toContain(
      "n'utilise pas de famille",
    );
  });

  it('the seeded lists respect their families and have unique codes', () => {
    for (const [listType, items] of Object.entries(DEFAULT_REF_LISTS)) {
      const codes = items.map((i) => i.code);
      expect(new Set(codes).size, listType).toBe(codes.length);
      for (const item of items) {
        expect(
          familyError(listType as ProgramListType, item.family),
          `${listType}/${item.code}`,
        ).toBeNull();
        expect(item.code).toMatch(/^[A-Z0-9_]{1,40}$/);
      }
    }
  });
});
