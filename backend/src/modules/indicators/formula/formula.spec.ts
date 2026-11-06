import { describe, expect, it } from 'vitest';
import {
  compileIndicatorSet,
  evaluateFormula,
  evaluateIndicatorSet,
  FORMULA_MAX_DEPTH,
  FORMULA_MAX_LENGTH,
  FormulaError,
  formulaVariables,
  parseFormula,
  validateFormula,
} from './formula.js';
import {
  POUFA_BASE_VARIABLE_NAMES,
  POUFA_BASE_VARIABLES,
  POUFA_DEFAULT_FORMULAS,
} from './formula-catalog.js';

const VARS = ['a', 'b', 'c', 'presents', 'morts_jour'] as const;

/** Parses with VARS allowed and evaluates against `values`. */
function calc(
  source: string,
  values: Record<string, number | null | undefined> = {},
): number | null {
  return evaluateFormula(parseFormula(source, VARS), values);
}

/** The FormulaError thrown by `fn`. */
function errorOf(fn: () => unknown): FormulaError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(FormulaError);
    return e as FormulaError;
  }
  throw new Error('expected a FormulaError');
}

const parseError = (source: string, allowed: readonly string[] = VARS) =>
  errorOf(() => parseFormula(source, allowed));

describe('arithmetic', () => {
  it('applies the usual precedence and left associativity', () => {
    expect(calc('2 + 3 * 4')).toBe(14);
    expect(calc('(2 + 3) * 4')).toBe(20);
    expect(calc('10 - 4 - 3')).toBe(3);
    expect(calc('24 / 4 / 2')).toBe(3);
    expect(calc('2 * 3 + 4 * 5 - 6 / 3')).toBe(24);
    expect(calc('((((7))))')).toBe(7);
  });

  it('handles unary minus', () => {
    expect(calc('-3 + 5')).toBe(2);
    expect(calc('-(2 + 3) * 2')).toBe(-10);
    expect(calc('2 * -3')).toBe(-6);
    expect(calc('2 - -3')).toBe(5);
    expect(calc('--4')).toBe(4);
    expect(calc('-a', { a: 7 })).toBe(-7);
    expect(Object.is(calc('-0'), 0)).toBe(true); // -0 is normalized
  });

  it('accepts a decimal comma or dot', () => {
    expect(calc('0,5 + 0.25')).toBe(0.75);
    expect(calc('1,5 * 2')).toBe(3);
    expect(calc('007,50')).toBe(7.5);
  });

  it('ignores whitespace and an Excel-style leading "="', () => {
    expect(calc('  a\t*\n2 ', { a: 4 })).toBe(8);
    expect(calc('=a/2', { a: 4 })).toBe(2);
  });

  it('reads variables', () => {
    expect(calc('a + b * c', { a: 1, b: 2, c: 3 })).toBe(7);
  });
});

describe('functions', () => {
  it('min / max take two or more ";"-separated arguments', () => {
    expect(calc('min(3; 1; 2)')).toBe(1);
    expect(calc('max(3; 1; 2)')).toBe(3);
    expect(calc('max(a; b)', { a: -1, b: -5 })).toBe(-1);
    expect(calc('min(0,5; 0,25)')).toBe(0.25);
  });

  it('abs', () => {
    expect(calc('abs(-2,5)')).toBe(2.5);
    expect(calc('abs(a - b)', { a: 1, b: 4 })).toBe(3);
  });

  it('arrondi rounds half away from zero like Excel', () => {
    expect(calc('arrondi(2,345; 2)')).toBe(2.35);
    expect(calc('arrondi(1,005; 2)')).toBe(1.01);
    expect(calc('arrondi(-2,5; 0)')).toBe(-3);
    expect(calc('arrondi(2,5; 0)')).toBe(3);
    expect(calc('arrondi(1234; -2)')).toBe(1200);
    expect(calc('arrondi(2,345; 1,9)')).toBe(2.3); // digits truncated
    expect(calc('arrondi(1 / 3; 40)')).toBeCloseTo(1 / 3, 14); // clamped
  });

  it('are case-insensitive', () => {
    expect(calc('MIN(1; 2) + Max(1; 2) + ABS(-1) + ARRONDI(1,4; 0)')).toBe(5);
    expect(calc('SI(a > 0; 1; 2)', { a: 1 })).toBe(1);
  });

  it('si picks a branch with every comparison operator', () => {
    const cases: [string, number][] = [
      ['<', 2],
      ['<=', 1],
      ['>', 2],
      ['>=', 1],
      ['=', 1],
      ['<>', 2],
    ];
    for (const [op, expected] of cases) {
      expect(calc(`si(a ${op} 3; 1; 2)`, { a: 3 })).toBe(expected);
    }
    expect(calc('si(a + 1 > b * 2; a; b)', { a: 5, b: 2 })).toBe(5);
    expect(calc('si(a < 0; -a; a)', { a: -4 })).toBe(4);
  });

  it('si compares with Excel-like tolerance', () => {
    expect(calc('si(0,1 + 0,2 = 0,3; 1; 0)')).toBe(1);
    expect(calc('si(0,1 + 0,2 > 0,3; 1; 0)')).toBe(0);
  });

  it('si is lazy: the other branch may divide by zero or be null', () => {
    expect(
      calc('si(presents = 0; 0; morts_jour / presents)', {
        presents: 0,
        morts_jour: 3,
      }),
    ).toBe(0);
    expect(calc('si(a > 0; 1; b)', { a: 1, b: null })).toBe(1);
    expect(calc('si(a > 0; b; 1)', { a: 1, b: null })).toBeNull();
    expect(calc('si(a > 0; 1; 1 / 0)', { a: 1 })).toBe(1);
  });

  it('si with a null condition operand is null', () => {
    expect(calc('si(a > 0; 1; 2)', { a: null })).toBeNull();
  });

  it('functions nest', () => {
    expect(
      calc('arrondi(max(a; si(b > 1; b * 2; 0)) / 3; 1)', { a: 1, b: 5 }),
    ).toBe(3.3);
  });
});

describe('null results', () => {
  it('division by zero is null, not Infinity or NaN', () => {
    expect(calc('1 / 0')).toBeNull();
    expect(calc('0 / 0')).toBeNull();
    expect(calc('a / (b - b)', { a: 1, b: 2 })).toBeNull();
    expect(calc('1 + a / b', { a: 1, b: 0 })).toBeNull();
  });

  it('a null, undefined or non-finite needed variable is null', () => {
    expect(calc('a + 1', { a: null })).toBeNull();
    expect(calc('a + 1', {})).toBeNull();
    expect(calc('a + 1', { a: Number.NaN })).toBeNull();
    expect(calc('a + 1', { a: Infinity })).toBeNull();
    expect(calc('min(a; b)', { a: 1, b: null })).toBeNull();
    expect(calc('abs(a)', { a: null })).toBeNull();
    expect(calc('-a', { a: null })).toBeNull();
    // A value that is not a number at runtime (e.g. bad JSON) counts as missing.
    expect(calc('a', { a: '3' as unknown as number })).toBeNull();
  });

  it('an overflowing result is null', () => {
    const big = '9'.repeat(200);
    expect(calc(`${big} * ${big}`)).toBeNull();
    expect(calc(`-${big} * ${big}`)).toBeNull();
  });

  it('only reads own properties of the values', () => {
    const allowed = ['constructor', 'tostring'];
    const ast = parseFormula('constructor + 1', allowed);
    expect(evaluateFormula(ast, {})).toBeNull();
    expect(evaluateFormula(ast, { constructor: 2 })).toBe(3);
    const values = Object.create({ constructor: 5 }) as Record<string, number>;
    expect(evaluateFormula(ast, values)).toBeNull();
  });
});

describe('parse errors', () => {
  it('rejects an unknown variable with its position', () => {
    const e = parseError('a + inconnu * 2');
    expect(e.position).toBe(4);
    expect(e.message).toBe('Variable inconnue « inconnu » au caractère 5.');
  });

  it('hints lowercase for a known variable typed in capitals', () => {
    const e = parseError('2 * Presents');
    expect(e.position).toBe(4);
    expect(e.message).toContain('minuscules');
    expect(e.message).toContain('« presents »');
  });

  it('rejects prototype names unless explicitly allowed', () => {
    for (const name of [
      'constructor',
      '__proto__',
      'tostring',
      'hasownproperty',
    ]) {
      expect(parseError(`${name} + 1`).message).toContain('Variable inconnue');
    }
    expect(parseError('toString').message).toContain('Variable inconnue');
    expect(
      formulaVariables(parseFormula('__proto__ * 2', ['__proto__'])),
    ).toEqual(['__proto__']);
  });

  it('rejects an empty formula', () => {
    for (const source of ['', '   ', '=']) {
      const e = parseError(source);
      expect(e.message).toBe('La formule est vide.');
    }
  });

  it('rejects unbalanced parentheses', () => {
    let e = parseError('(a + b');
    expect(e.position).toBe(0);
    expect(e.message).toContain('non fermée');
    e = parseError('a + b)');
    expect(e.position).toBe(5);
    expect(e.message).toContain('en trop');
    e = parseError('min(a; b');
    expect(e.position).toBe(0);
    expect(e.message).toContain('min');
    expect(parseError('()').message).toContain('« ) » inattendu');
  });

  it('rejects a trailing or doubled operator', () => {
    let e = parseError('a +');
    expect(e.position).toBe(3);
    expect(e.message).toContain('Fin de formule inattendue');
    e = parseError('a * / b');
    expect(e.position).toBe(4);
    expect(e.message).toContain('« / » inattendu');
  });

  it('rejects two values without an operator', () => {
    const e = parseError('a b');
    expect(e.position).toBe(2);
    expect(e.message).toContain('un opérateur est attendu');
    expect(parseError('2 3').position).toBe(2);
  });

  it('rejects malformed numbers', () => {
    expect(parseError('1,').position).toBe(1);
    expect(parseError('1.000,5').message).toContain('un seul séparateur');
    expect(parseError('2a').message).toContain('Nombre invalide');
    expect(parseError('.5').message).toContain('Point inattendu');
  });

  it('points to ";" when a comma separates arguments', () => {
    const e = parseError('max(a,b)');
    expect(e.position).toBe(5);
    expect(e.message).toContain('« ; »');
  });

  it('rejects forbidden characters (no eval-able syntax)', () => {
    for (const source of ['a ^ 2', 'a % 2', 'a.b', '"x"', 'a[0]', '`a`', 'é']) {
      expect(() => parseFormula(source, VARS)).toThrow(FormulaError);
    }
    expect(parseError('a ^ 2').position).toBe(2);
  });

  it('rejects unknown functions and wrong arity', () => {
    let e = parseError('somme(a; b)');
    expect(e.message).toContain('Fonction inconnue « somme »');
    expect(e.position).toBe(0);
    e = parseError('1 + abs(a; b)');
    expect(e.position).toBe(4);
    expect(e.message).toContain('attend 1 argument');
    expect(parseError('abs()').message).toContain('0 fourni');
    // `max(0,5)` is a single number 0.5, almost surely a typo for `max(0;5)`.
    expect(parseError('max(0,5)').message).toContain('au moins 2 arguments');
    expect(parseError('arrondi(a)').message).toContain('attend 2 arguments');
    expect(parseError('si(a > 0; 1)').message).toContain('attend 3 arguments');
    expect(parseError('si(a > 0; 1; 2; 3)').message).toContain(
      'attend 3 arguments',
    );
    expect(parseError('min(a;)').message).toContain('inattendu');
  });

  it('restricts comparisons to the condition of si', () => {
    let e = parseError('a > b');
    expect(e.position).toBe(2);
    expect(e.message).toContain('condition de si');
    expect(parseError('si(a; 1; 2)').message).toContain(
      'doit être une comparaison',
    );
    expect(parseError('si(a > 0; b > 1; 2)').message).toContain(
      'condition de si',
    );
    e = parseError('si(a < b < c; 1; 2)');
    expect(e.position).toBe(9);
  });

  it(`limits the source to ${FORMULA_MAX_LENGTH} characters`, () => {
    const ok = '1' + ' + 1'.repeat((FORMULA_MAX_LENGTH - 1) / 4 - 1);
    expect(ok.length).toBeLessThanOrEqual(FORMULA_MAX_LENGTH);
    expect(() => parseFormula(ok, VARS)).not.toThrow();
    const e = parseError('a'.repeat(FORMULA_MAX_LENGTH + 1));
    expect(e.message).toContain('trop longue');
    expect(e.position).toBe(FORMULA_MAX_LENGTH);
  });

  it(`limits nesting to ${FORMULA_MAX_DEPTH} levels`, () => {
    const nested = (n: number) => '('.repeat(n) + '1' + ')'.repeat(n);
    expect(calc(nested(FORMULA_MAX_DEPTH))).toBe(1);
    const e = parseError(nested(FORMULA_MAX_DEPTH + 1));
    expect(e.message).toContain('trop imbriquée');
    expect(e.position).toBe(FORMULA_MAX_DEPTH);
    expect(
      parseError('-'.repeat(FORMULA_MAX_DEPTH + 1) + '1').message,
    ).toContain('trop imbriquée');
    expect(
      parseError(
        'abs('.repeat(FORMULA_MAX_DEPTH + 1) +
          '1' +
          ')'.repeat(FORMULA_MAX_DEPTH + 1),
      ).message,
    ).toContain('trop imbriquée');
  });

  it('FormulaError is a named Error', () => {
    const e = parseError('?');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('FormulaError');
  });
});

describe('formulaVariables / validateFormula', () => {
  it('lists distinct variables in order of appearance', () => {
    const ast = parseFormula('si(b > 0; a / b; a + c + b)', VARS);
    expect(formulaVariables(ast)).toEqual(['b', 'a', 'c']);
    expect(formulaVariables(parseFormula('1 + 2', VARS))).toEqual([]);
  });

  it('validateFormula returns the variables or the error without throwing', () => {
    expect(validateFormula('a / b', VARS)).toEqual({
      ok: true,
      variables: ['a', 'b'],
    });
    expect(validateFormula('a / z', VARS)).toEqual({
      ok: false,
      error: 'Variable inconnue « z » au caractère 5.',
      position: 4,
    });
  });

  it('produces a JSON-serializable AST', () => {
    const ast = parseFormula('si(a > 0; arrondi(a / b; 1); -c)', VARS);
    const copy = JSON.parse(JSON.stringify(ast));
    expect(evaluateFormula(copy, { a: 1, b: 3, c: 2 })).toBe(0.3);
  });
});

describe('indicator sets', () => {
  const base = ['x', 'y'];

  it('evaluates indicators in dependency order, keeping definition order', () => {
    const result = evaluateIndicatorSet(
      [
        { key: 'total', expression: 'double + y' },
        { key: 'double', expression: 'x * 2' },
        { key: 'half', expression: 'total / 2' },
      ],
      { x: 3, y: 4 },
      base,
    );
    expect(result).toEqual({ total: 10, double: 6, half: 5 });
    expect(Object.keys(result)).toEqual(['total', 'double', 'half']);
  });

  it('propagates null through dependent indicators', () => {
    expect(
      evaluateIndicatorSet(
        [
          { key: 'ratio', expression: 'x / y' },
          { key: 'pct', expression: 'ratio * 100' },
          { key: 'safe', expression: 'si(y = 0; 0; ratio)' },
        ],
        { x: 1, y: 0 },
        base,
      ),
    ).toEqual({ ratio: null, pct: null, safe: 0 });
  });

  it('only reads allowed base values', () => {
    expect(
      evaluateIndicatorSet(
        [{ key: 'k', expression: 'x' }],
        { x: 1, z: 2 },
        base,
      ),
    ).toEqual({ k: 1 });
    expect(
      errorOf(() =>
        evaluateIndicatorSet([{ key: 'k', expression: 'z' }], { z: 2 }, base),
      ).message,
    ).toContain('Variable inconnue « z »');
  });

  it('detects a cycle', () => {
    const e = errorOf(() =>
      compileIndicatorSet(
        [
          { key: 'a1', expression: 'x + b1' },
          { key: 'b1', expression: 'c1 * 2' },
          { key: 'c1', expression: 'y - a1' },
        ],
        base,
      ),
    );
    expect(e.message).toBe(
      'Indicateur « c1 » : dépendance circulaire (a1 → b1 → c1 → a1).',
    );
    expect(e.indicatorKey).toBe('c1');
    expect(e.position).toBe(4);
  });

  it('detects a self-reference', () => {
    const e = errorOf(() =>
      evaluateIndicatorSet([{ key: 'k', expression: 'k + 1' }], {}, base),
    );
    expect(e.message).toContain('dépendance circulaire (k → k)');
  });

  it('rejects a key colliding with a base variable, duplicated or invalid', () => {
    let e = errorOf(() =>
      compileIndicatorSet([{ key: 'x', expression: '1' }], base),
    );
    expect(e.message).toContain("déjà le nom d'une variable de base");
    e = errorOf(() =>
      compileIndicatorSet(
        [
          { key: 'k', expression: '1' },
          { key: 'k', expression: '2' },
        ],
        base,
      ),
    );
    expect(e.message).toContain('défini deux fois');
    e = errorOf(() =>
      compileIndicatorSet([{ key: 'Taux', expression: '1' }], base),
    );
    expect(e.message).toContain("Clé d'indicateur invalide");
  });

  it('prefixes a parse error with the indicator key', () => {
    const e = errorOf(() =>
      compileIndicatorSet(
        [
          { key: 'ok', expression: 'x' },
          { key: 'ko', expression: 'x +' },
        ],
        base,
      ),
    );
    expect(e.indicatorKey).toBe('ko');
    expect(e.position).toBe(3);
    expect(e.message).toMatch(/^Indicateur « ko » : Fin de formule inattendue/);
  });

  it('keeps a "__proto__" indicator key as a plain own key', () => {
    const result = evaluateIndicatorSet(
      [{ key: '__proto__', expression: 'x + 1' }],
      { x: 1 },
      base,
    );
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toBe(2);
  });
});

describe('POUFA catalog and default formulas', () => {
  it('catalogs every required base variable with a French label and a unit', () => {
    const required = [
      'mis_en_place',
      'morts_cumules',
      'morts_jour',
      'presents',
      'presents_veille',
      'sortis_tetes',
      'poids_sortis_kg',
      'poids_presents_kg',
      'poids_poussins_kg',
      'poids_moyen_g',
      'poids_initial_g',
      'jours_elevage',
      'aliment_kg',
      'charges_fcfa',
      'ca_fcfa',
      'capacite_places',
    ];
    expect(POUFA_BASE_VARIABLE_NAMES).toEqual(expect.arrayContaining(required));
    expect(new Set(POUFA_BASE_VARIABLE_NAMES).size).toBe(
      POUFA_BASE_VARIABLE_NAMES.length,
    );
    for (const v of POUFA_BASE_VARIABLES) {
      expect(v.name).toMatch(/^[a-z_][a-z0-9_]*$/);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.unit.length).toBeGreaterThan(0);
    }
  });

  it('every default formula compiles as one set', () => {
    const compiled = compileIndicatorSet(
      POUFA_DEFAULT_FORMULAS,
      POUFA_BASE_VARIABLE_NAMES,
    );
    expect(compiled).toHaveLength(POUFA_DEFAULT_FORMULAS.length);
    const keys = compiled.map((c) => c.key);
    expect(keys.indexOf('taux_mortalite')).toBeLessThan(
      keys.indexOf('viabilite'),
    );
    expect(keys.indexOf('poids_vif_produit_kg')).toBeLessThan(
      keys.indexOf('ic'),
    );
    for (const f of POUFA_DEFAULT_FORMULAS) {
      expect(f.label.length).toBeGreaterThan(0);
    }
  });

  // A broiler band at day 42: 1000 chicks of 40 g placed in a 1250-place
  // house, 30 dead (2 today, out of 972 present yesterday), 970 present at
  // 2100 g, none sold yet, 3400 kg of feed, 2 500 000 FCFA of charges, and
  // the band valued at 1500 FCFA/kg live: 2037 kg x 1500 = 3 055 500 FCFA.
  const band = {
    mis_en_place: 1000,
    morts_cumules: 30,
    morts_jour: 2,
    presents: 970,
    presents_veille: 972,
    sortis_tetes: 0,
    poids_sortis_kg: 0,
    poids_presents_kg: 2037, // 970 x 2.1 kg
    poids_poussins_kg: 40, // 1000 x 0.04 kg
    poids_moyen_g: 2100,
    poids_initial_g: 40,
    jours_elevage: 42,
    aliment_kg: 3400,
    charges_fcfa: 2_500_000,
    ca_fcfa: 3_055_500,
    capacite_places: 1250,
  };

  it('evaluates every default formula on a realistic broiler band', () => {
    const r = evaluateIndicatorSet(
      POUFA_DEFAULT_FORMULAS,
      band,
      POUFA_BASE_VARIABLE_NAMES,
    );
    expect(Object.keys(r)).toEqual(POUFA_DEFAULT_FORMULAS.map((f) => f.key));
    expect(r.taux_mortalite).toBeCloseTo(3, 10); // 30 / 1000 x 100
    expect(r.viabilite).toBeCloseTo(97, 10); // 100 - 3
    expect(r.poids_vif_produit_kg).toBe(1997); // 0 + 2037 - 40
    expect(r.gmq_g_j).toBeCloseTo(49.047619, 6); // 2060 / 42
    expect(r.ic).toBeCloseTo(1.702554, 6); // 3400 / 1997
    expect(r.cout_production_kg).toBeCloseTo(1251.877817, 6); // 2 500 000 / 1997
    expect(r.cout_production_tete).toBeCloseTo(2577.319588, 6); // 2 500 000 / 970
    expect(r.marge_fcfa).toBe(555_500); // 3 055 500 - 2 500 000
    expect(r.marge_kg).toBeCloseTo(278.167251, 6); // 555 500 / 1997
    expect(r.taux_marge).toBeCloseTo(18.180331, 6); // 555 500 / 3 055 500 x 100
    expect(r.taux_occupation).toBeCloseTo(80, 10); // 1000 / 1250 x 100
    expect(r.mortalite_jour_pct).toBeCloseTo(0.205761, 6); // 2 / 972 x 100
  });

  it('gives null (not Infinity) for ratios over an empty band', () => {
    const r = evaluateIndicatorSet(
      POUFA_DEFAULT_FORMULAS,
      {
        ...band,
        presents: 0,
        presents_veille: 0,
        poids_presents_kg: 40, // produced weight = 0
        ca_fcfa: 0,
        capacite_places: null as unknown as number,
      },
      POUFA_BASE_VARIABLE_NAMES,
    );
    expect(r.ic).toBeNull();
    expect(r.cout_production_kg).toBeNull();
    expect(r.cout_production_tete).toBeNull();
    expect(r.marge_kg).toBeNull();
    expect(r.taux_marge).toBeNull();
    expect(r.mortalite_jour_pct).toBeNull();
    expect(r.taux_occupation).toBeNull();
    expect(r.marge_fcfa).toBe(-2_500_000);
    expect(r.viabilite).toBeCloseTo(97, 10);
  });
});
