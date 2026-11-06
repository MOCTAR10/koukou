import { POUFA_BASE_VARIABLE_NAMES } from './formula/formula-catalog.js';
import { formulaVariables, parseFormula } from './formula/formula.js';

/**
 * POUFA lot A2 droits (audit F6): the economic part of a band's official
 * indicators (revenue, charges, cost, margin) is served only to a reader of
 * the ECONOMIQUE domain (`FarmsService.readsEconomics`): the farm's own
 * accounts, the platform admin, an institution granted ECONOMIQUE:CONSULTER.
 * Others (the agent technique: TECHNIQUE only) get the same answer without
 * it: money variables null, money indicators absent, money totals null, and
 * `economicMasked: true` so the screens say why. Pure, unit-tested.
 */

/** Money base variables of a band (FCFA): its revenue and its charges. */
export const ECONOMIC_VARIABLES: readonly string[] = ['ca_fcfa', 'charges_fcfa'];

/** Money totals stored on a bilan or a band summary. */
const ECONOMIC_TOTALS = ['revenueFcfa', 'chargesFcfa', 'marginFcfa'] as const;

interface IndicatorDef {
  key: string;
  expression?: string | null;
  unit?: string | null;
}

/**
 * Keys of the indicators that carry money: a formula reading a money
 * variable, or another money indicator (transitively), or a FCFA unit. The
 * formulas are configurable (`FORMULE_*`), so the rule follows the
 * expressions in force rather than a fixed list; an expression that does
 * not parse counts by its unit only.
 */
export function economicIndicatorKeys(
  defs: readonly IndicatorDef[],
): Set<string> {
  const allowed = [...POUFA_BASE_VARIABLE_NAMES, ...defs.map((d) => d.key)];
  const reads = new Map<string, string[]>();
  const economic = new Set<string>();
  for (const d of defs) {
    if ((d.unit ?? '').toUpperCase().includes('FCFA')) economic.add(d.key);
    try {
      reads.set(
        d.key,
        formulaVariables(parseFormula(String(d.expression ?? ''), allowed)),
      );
    } catch {
      reads.set(d.key, []);
    }
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const [key, names] of reads) {
      if (economic.has(key)) continue;
      if (
        names.some((n) => ECONOMIC_VARIABLES.includes(n) || economic.has(n))
      ) {
        economic.add(key);
        changed = true;
      }
    }
  }
  return economic;
}

/** A band answer whose economic part may be masked. */
interface EconomicShape {
  variables?: Readonly<Record<string, unknown>> | null;
  indicators?: readonly IndicatorDef[] | null;
  revenueFcfa?: number | null;
  chargesFcfa?: number | null;
  marginFcfa?: number | null;
}

export type EconomicView<T> = T & { economicMasked: boolean };

/**
 * `value` as `reads` may see it: unchanged (flagged `economicMasked: false`)
 * for an economic reader, else a copy without its money part. Works on the
 * live indicators, a frozen bilan and a band summary alike.
 */
export function economicView<T extends EconomicShape>(
  value: T,
  reads: boolean,
): EconomicView<T> {
  if (reads) return { ...value, economicMasked: false };
  const out: Record<string, unknown> = { ...(value as object), economicMasked: true };
  if (value.variables) {
    const variables: Record<string, unknown> = { ...value.variables };
    for (const name of ECONOMIC_VARIABLES) {
      if (Object.hasOwn(variables, name)) variables[name] = null;
    }
    out.variables = variables;
  }
  if (value.indicators) {
    const hidden = economicIndicatorKeys(value.indicators);
    out.indicators = value.indicators.filter((i) => !hidden.has(i.key));
  }
  for (const total of ECONOMIC_TOTALS) {
    if (Object.hasOwn(value, total)) out[total] = null;
  }
  return out as unknown as EconomicView<T>;
}

/**
 * The indicators of a list that carry no money (the end-of-band report,
 * read by the agent technique as well as by the economic readers).
 */
export function withoutEconomicIndicators<T extends IndicatorDef>(
  list: readonly T[],
): T[] {
  const hidden = economicIndicatorKeys(list);
  return list.filter((i) => !hidden.has(i.key));
}
