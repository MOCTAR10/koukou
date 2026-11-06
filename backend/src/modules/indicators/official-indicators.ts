import {
  PARAMETER_CATALOG,
  indicatorKeyOf,
} from '../programme/parameter-catalog.js';
import {
  POUFA_BASE_VARIABLE_NAMES,
  POUFA_DEFAULT_FORMULAS,
} from './formula/formula-catalog.js';
import { evaluateIndicatorSet } from './formula/formula.js';

/**
 * Official POUFA indicators: the `FORMULE_*` parameters in force at the date
 * of the fact, evaluated by the formula engine. Each result keeps the formula
 * version that produced it, so a later formula change never rewrites a
 * frozen bilan.
 */

/** Reads stored parameter versions (`ParameterResolver`). */
export interface FormulaVersionSource {
  version(
    key: string,
    at: Date,
  ): { id: string; value: unknown; validFrom: Date } | null;
}

export interface FormulaInForce {
  key: string;
  label: string;
  unit: string;
  expression: string;
  parameterKey: string;
  /** Null when no version is stored: the catalog « Proposé » default applies. */
  parameterVersionId: string | null;
  validFrom: string | null;
}

export interface OfficialIndicator extends FormulaInForce {
  /** Null when undefined (division by zero, missing input). */
  value: number | null;
}

const FORMULA_DEFS = PARAMETER_CATALOG.filter((d) => d.type === 'formula');
const LABELS = new Map(POUFA_DEFAULT_FORMULAS.map((f) => [f.key, f]));

/** Every indicator formula in force at `at`. */
export function formulasInForce(
  source: FormulaVersionSource,
  at: Date,
): FormulaInForce[] {
  return FORMULA_DEFS.map((def) => {
    const key = indicatorKeyOf(def.key) ?? def.key;
    const version = source.version(def.key, at);
    return {
      key,
      label: LABELS.get(key)?.label ?? def.label,
      unit: def.unit ?? '',
      expression: version ? String(version.value) : String(def.defaultValue),
      parameterKey: def.key,
      parameterVersionId: version?.id ?? null,
      validFrom: version ? version.validFrom.toISOString() : null,
    };
  });
}

/**
 * Evaluates the whole set on the band's base variables (unknown names are
 * ignored, missing ones are null, so is every indicator that needs them).
 * @throws FormulaError if the stored set does not compile (refused at save)
 */
export function evaluateOfficialIndicators(
  formulas: readonly FormulaInForce[],
  variables: Readonly<Record<string, number | null | undefined>>,
): OfficialIndicator[] {
  const values = evaluateIndicatorSet(
    formulas,
    variables,
    POUFA_BASE_VARIABLE_NAMES,
  );
  return formulas.map((f) => ({ ...f, value: values[f.key] ?? null }));
}

/** Value of one indicator of a set (null when absent or undefined). */
export function indicatorValue(
  indicators: readonly OfficialIndicator[],
  key: string,
): number | null {
  return indicators.find((i) => i.key === key)?.value ?? null;
}
