/**
 * Programme-wide economic synthesis of the Fermia bonus features (user
 * decision 2026-11-06: the government benefits from the farms' caisse,
 * payroll and stock): one row per farm, subtotals per province, a total.
 * A column the caller's matrix does not grant is null everywhere (gating by
 * the matrix, never a partial mask). Rates and volumes come from the
 * programme formulas in force (CDC §7.3), never from fixed arithmetic.
 * Pure, unit-tested.
 */

import {
  evaluateOfficialIndicators,
  indicatorValue,
  type FormulaInForce,
} from '../indicators/official-indicators.js';
import {
  periodCompletenessPct,
  periodProduced,
} from '../reporting/pilotage-programme.js';

/** Columns the caller reads, each from its own domain of the matrix. */
export interface SynthesisColumns {
  /** Sales, expenses and margin (ECONOMIQUE:CONSULTER, the route's domain). */
  sales: boolean;
  /** Cash collected (ECONOMIQUE or VENTES consultation). */
  collected: boolean;
  /** Monthly payroll of the active members (EQUIPE:CONSULTER). */
  payroll: boolean;
  /** Feed available (INTRANTS:CONSULTER). */
  stock: boolean;
  /** POUFA lot A2 dge: SYSCOHADA books (COMPTABILITE:CONSULTER). */
  accounting: boolean;
  /** POUFA lot A2 dge: Market requests and deliveries (MARCHE:CONSULTER). */
  market: boolean;
  /** POUFA lot A2 dge: completeness and volumes produced (TECHNIQUE:CONSULTER). */
  production: boolean;
  /** Class of the latest biosecurity control (TECHNIQUE:CONSULTER, like production). */
  biosecurity: boolean;
}

/** Figures summed per farm over the period. */
export interface FarmSums {
  salesFcfa: number;
  salesCount: number;
  collectedFcfa: number;
  expensesFcfa: number;
  payrollMonthlyFcfa: number;
  employeeCount: number;
  feedStockKg: number;
  /** Class 6 of the period (net debit). */
  accountingChargesFcfa: number;
  /** Class 7 of the period (net credit). */
  accountingProductsFcfa: number;
  /** Class 5 balance at the end of the period. */
  treasuryFcfa: number;
  /** Customer receivables (411, 416) at the end of the period. */
  receivablesFcfa: number;
  /** Market requests received in the period. */
  marketRequests: number;
  /** Market requests the farm accepted in the period. */
  marketAccepted: number;
  /** Market orders delivered in the period, and their amount. */
  marketDelivered: number;
  marketSalesFcfa: number;
  /** Live birds and carcasses of those deliveries. */
  marketBirds: number;
  marketCarcasses: number;
  /** Band days entered / elapsed in the period (programme bands). */
  daysEntered: number;
  daysElapsed: number;
  /** Birds that left the programme bands alive, and their live kg. */
  exitHeads: number;
  exitKg: number;
  /** Biosecurity: 1 for the class of the farm's latest control, summed up. */
  bioA: number;
  bioB: number;
  bioC: number;
  /** 1 when the farm was never controlled. */
  bioNever: number;
  /** 1 when the latest control is older than `BIOSECURITE_CONTROLE_ANCIEN_JOURS`. */
  bioStale: number;
  /** Sum of the latest scores (for the mean). */
  bioScoreSum: number;
}

/** Detail of a farm's latest control (farm rows only). */
export interface FarmBiosecurityDetail {
  bioClass?: 'A' | 'B' | 'C' | null;
  bioScorePct?: number | null;
  bioDate?: string | null;
}

export interface FarmFigures extends FarmSums, FarmBiosecurityDetail {
  farmId: string;
  code: string | null;
  name: string;
  provinceCode: string | null;
  provinceName: string | null;
}

export interface SynthesisRow {
  farmId?: string;
  code?: string | null;
  name?: string;
  provinceCode: string | null;
  provinceName: string | null;
  farmCount?: number;
  salesFcfa: number | null;
  salesCount: number | null;
  collectedFcfa: number | null;
  expensesFcfa: number | null;
  /** `FORMULE_MARGE_FCFA` on the period's sales and expenses. */
  marginFcfa: number | null;
  /** `FORMULE_TAUX_MARGE`, one decimal. */
  marginPct: number | null;
  payrollMonthlyFcfa: number | null;
  employeeCount: number | null;
  feedStockKg: number | null;
  accountingChargesFcfa: number | null;
  accountingProductsFcfa: number | null;
  /** Résultat SYSCOHADA of the period: products − charges (classes 7 − 6). */
  accountingResultFcfa: number | null;
  treasuryFcfa: number | null;
  receivablesFcfa: number | null;
  marketRequests: number | null;
  marketAccepted: number | null;
  marketDelivered: number | null;
  marketSalesFcfa: number | null;
  marketBirds: number | null;
  marketCarcasses: number | null;
  /** `FORMULE_COMPLETUDE_PCT`, one decimal. */
  completenessPct: number | null;
  /** `FORMULE_VOLUME_PRODUIT_TETES`. */
  producedHeads: number | null;
  /** `FORMULE_VOLUME_PRODUIT_KG`, one decimal. */
  producedKg: number | null;
  /** Farm rows: class, score and date of the latest biosecurity control. */
  bioClass: string | null;
  bioScorePct: number | null;
  bioDate: string | null;
  /** Group rows: distribution of the latest classes. */
  bioA: number | null;
  bioB: number | null;
  bioC: number | null;
  bioNever: number | null;
  bioStale: number | null;
  /** Mean of the latest scores, one decimal. */
  bioAverageScorePct: number | null;
  /** Controlled farms over farms, one decimal. */
  bioControlledPct: number | null;
}

export interface Synthesis {
  columns: SynthesisColumns;
  farms: SynthesisRow[];
  provinces: SynthesisRow[];
  total: SynthesisRow;
}

/**
 * The formulas in force the synthesis computes with (bound by the service to
 * the `FORMULE_*` set at the end of the period).
 */
export interface SynthesisFormulas {
  /** `marge_fcfa` and `taux_marge` on sales (ca_fcfa) and expenses (charges_fcfa). */
  margin(
    salesFcfa: number,
    expensesFcfa: number,
  ): { fcfa: number | null; pct: number | null };
  /** `completude_pct` on days entered / elapsed. */
  completeness(entered: number, elapsed: number): number | null;
  /** `volume_produit_tetes` / `volume_produit_kg`. */
  produced(
    heads: number,
    kg: number,
  ): { heads: number | null; kg: number | null };
}

/**
 * The synthesis formulas bound to the `FORMULE_*` set in force: the official
 * margin (`marge_fcfa`, `taux_marge`), completeness and volumes produced.
 */
export function synthesisFormulasOf(
  formulas: readonly FormulaInForce[],
): SynthesisFormulas {
  return {
    margin: (sales, expenses) => {
      const values = evaluateOfficialIndicators(formulas, {
        ca_fcfa: sales,
        charges_fcfa: expenses,
      });
      const fcfa = indicatorValue(values, 'marge_fcfa');
      const pct = indicatorValue(values, 'taux_marge');
      return {
        fcfa: fcfa == null ? null : Math.round(fcfa),
        pct: pct == null ? null : Math.round(pct * 10) / 10,
      };
    },
    completeness: (entered, elapsed) =>
      periodCompletenessPct(formulas, entered, elapsed),
    produced: (heads, kg) => periodProduced(formulas, heads, kg),
  };
}

/** Margin rate (% of sales, one decimal), null without sales. */
export function marginPct(
  salesFcfa: number,
  marginFcfa: number,
): number | null {
  if (salesFcfa <= 0) return null;
  return Math.round((marginFcfa / salesFcfa) * 1000) / 10;
}

/** Plain ratios matching the catalog defaults: the unit tests' stand-in. */
export const PLAIN_SYNTHESIS_FORMULAS: SynthesisFormulas = {
  margin: (sales, expenses) => ({
    fcfa: sales - expenses,
    pct: marginPct(sales, sales - expenses),
  }),
  completeness: (entered, elapsed) =>
    elapsed > 0 ? Math.round((entered / elapsed) * 1000) / 10 : null,
  produced: (heads, kg) => ({ heads, kg: Math.round(kg * 10) / 10 }),
};

type RowBase = Pick<SynthesisRow, 'provinceCode' | 'provinceName'> &
  Partial<Pick<SynthesisRow, 'farmId' | 'code' | 'name' | 'farmCount'>>;

function rowOf(
  base: RowBase,
  f: FarmSums,
  columns: SynthesisColumns,
  formulas: SynthesisFormulas,
  detail?: FarmBiosecurityDetail,
): SynthesisRow {
  const margin = columns.sales
    ? formulas.margin(f.salesFcfa, f.expensesFcfa)
    : null;
  const produced = columns.production
    ? formulas.produced(f.exitHeads, f.exitKg)
    : null;
  const bio = <T>(v: T): T | null => (columns.biosecurity ? v : null);
  const bioControlled = f.bioA + f.bioB + f.bioC;
  const bioFarms = bioControlled + f.bioNever;
  const acc = <T>(v: T): T | null => (columns.accounting ? v : null);
  const mkt = <T>(v: T): T | null => (columns.market ? v : null);
  return {
    ...base,
    salesFcfa: columns.sales ? f.salesFcfa : null,
    salesCount: columns.sales ? f.salesCount : null,
    collectedFcfa: columns.collected ? f.collectedFcfa : null,
    expensesFcfa: columns.sales ? f.expensesFcfa : null,
    marginFcfa: margin?.fcfa ?? null,
    marginPct: margin?.pct ?? null,
    payrollMonthlyFcfa: columns.payroll ? f.payrollMonthlyFcfa : null,
    employeeCount: columns.payroll ? f.employeeCount : null,
    feedStockKg: columns.stock ? Math.round(f.feedStockKg * 10) / 10 : null,
    accountingChargesFcfa: acc(f.accountingChargesFcfa),
    accountingProductsFcfa: acc(f.accountingProductsFcfa),
    accountingResultFcfa: acc(
      f.accountingProductsFcfa - f.accountingChargesFcfa,
    ),
    treasuryFcfa: acc(f.treasuryFcfa),
    receivablesFcfa: acc(f.receivablesFcfa),
    marketRequests: mkt(f.marketRequests),
    marketAccepted: mkt(f.marketAccepted),
    marketDelivered: mkt(f.marketDelivered),
    marketSalesFcfa: mkt(f.marketSalesFcfa),
    marketBirds: mkt(f.marketBirds),
    marketCarcasses: mkt(f.marketCarcasses),
    completenessPct: columns.production
      ? formulas.completeness(f.daysEntered, f.daysElapsed)
      : null,
    producedHeads: produced?.heads ?? null,
    producedKg: produced?.kg ?? null,
    bioClass: columns.biosecurity
      ? base.farmId
        ? (detail?.bioClass ?? 'Non contrôlée')
        : null
      : null,
    bioScorePct: bio(base.farmId ? (detail?.bioScorePct ?? null) : null),
    bioDate: bio(base.farmId ? (detail?.bioDate ?? null) : null),
    bioA: bio(f.bioA),
    bioB: bio(f.bioB),
    bioC: bio(f.bioC),
    bioNever: bio(f.bioNever),
    bioStale: bio(f.bioStale),
    bioAverageScorePct: bio(
      bioControlled > 0
        ? Math.round((f.bioScoreSum / bioControlled) * 10) / 10
        : null,
    ),
    bioControlledPct: bio(
      bioFarms > 0 ? Math.round((bioControlled / bioFarms) * 1000) / 10 : null,
    ),
  };
}

const SUM_KEYS = [
  'salesFcfa',
  'salesCount',
  'collectedFcfa',
  'expensesFcfa',
  'payrollMonthlyFcfa',
  'employeeCount',
  'feedStockKg',
  'accountingChargesFcfa',
  'accountingProductsFcfa',
  'treasuryFcfa',
  'receivablesFcfa',
  'marketRequests',
  'marketAccepted',
  'marketDelivered',
  'marketSalesFcfa',
  'marketBirds',
  'marketCarcasses',
  'daysEntered',
  'daysElapsed',
  'exitHeads',
  'exitKg',
  'bioA',
  'bioB',
  'bioC',
  'bioNever',
  'bioStale',
  'bioScoreSum',
] as const satisfies readonly (keyof FarmSums)[];

/** Every figure of a farm at zero. */
export function emptySums(): FarmSums {
  return Object.fromEntries(SUM_KEYS.map((k) => [k, 0])) as unknown as FarmSums;
}

function add(into: FarmSums, f: FarmSums): void {
  for (const k of SUM_KEYS) into[k] += f[k];
}

const LAST = '￿';

/** Farms sorted by province then code; provinces in the same order (none last). */
export function buildSynthesis(
  figures: readonly FarmFigures[],
  columns: SynthesisColumns,
  formulas: SynthesisFormulas = PLAIN_SYNTHESIS_FORMULAS,
): Synthesis {
  const sorted = [...figures].sort(
    (a, b) =>
      (a.provinceName ?? LAST).localeCompare(b.provinceName ?? LAST, 'fr') ||
      (a.code ?? '').localeCompare(b.code ?? '') ||
      a.name.localeCompare(b.name, 'fr'),
  );
  const byProvince = new Map<
    string,
    { code: string | null; name: string | null; count: number; sums: FarmSums }
  >();
  const total = emptySums();
  for (const f of sorted) {
    const key = f.provinceCode ?? '';
    let p = byProvince.get(key);
    if (!p) {
      p = {
        code: f.provinceCode,
        name: f.provinceName,
        count: 0,
        sums: emptySums(),
      };
      byProvince.set(key, p);
    }
    p.count += 1;
    add(p.sums, f);
    add(total, f);
  }
  return {
    columns,
    farms: sorted.map((f) =>
      rowOf(
        {
          farmId: f.farmId,
          code: f.code,
          name: f.name,
          provinceCode: f.provinceCode,
          provinceName: f.provinceName,
        },
        f,
        columns,
        formulas,
        f,
      ),
    ),
    provinces: [...byProvince.values()].map((p) =>
      rowOf(
        { provinceCode: p.code, provinceName: p.name, farmCount: p.count },
        p.sums,
        columns,
        formulas,
      ),
    ),
    total: rowOf(
      { provinceCode: null, provinceName: null, farmCount: sorted.length },
      total,
      columns,
      formulas,
    ),
  };
}

/** Export columns (row key, French header) for the columns the caller reads. */
export function exportColumns(
  columns: SynthesisColumns,
): Array<readonly [keyof SynthesisRow, string]> {
  const out: Array<readonly [keyof SynthesisRow, string]> = [
    ['provinceName', 'Province'],
    ['code', 'Code ferme'],
    ['name', 'Ferme'],
  ];
  if (columns.sales) {
    out.push(
      ['salesFcfa', 'Chiffre d’affaires (FCFA)'],
      ['salesCount', 'Nombre de ventes'],
      ['expensesFcfa', 'Charges (FCFA)'],
      ['marginFcfa', 'Marge (FCFA)'],
      ['marginPct', 'Marge (%)'],
    );
  }
  if (columns.collected) out.push(['collectedFcfa', 'Encaissé (FCFA)']);
  if (columns.payroll) {
    out.push(
      ['payrollMonthlyFcfa', 'Masse salariale mensuelle (FCFA)'],
      ['employeeCount', 'Membres actifs'],
    );
  }
  if (columns.stock) out.push(['feedStockKg', 'Aliment disponible (kg)']);
  if (columns.accounting) {
    out.push(
      ['accountingChargesFcfa', 'Charges comptables, classe 6 (FCFA)'],
      ['accountingProductsFcfa', 'Produits comptables, classe 7 (FCFA)'],
      ['accountingResultFcfa', 'Résultat SYSCOHADA (FCFA)'],
      ['treasuryFcfa', 'Trésorerie en fin de période (FCFA)'],
      ['receivablesFcfa', 'Créances clients en fin de période (FCFA)'],
    );
  }
  if (columns.market) {
    out.push(
      ['marketRequests', 'Demandes Market reçues'],
      ['marketAccepted', 'Demandes Market acceptées'],
      ['marketDelivered', 'Commandes Market livrées'],
      ['marketSalesFcfa', 'Ventes Market livrées (FCFA)'],
      ['marketBirds', 'Market : poulets vifs livrés (têtes)'],
      ['marketCarcasses', 'Market : carcasses livrées (pièces)'],
    );
  }
  if (columns.production) {
    out.push(
      ['completenessPct', 'Complétude des saisies (%)'],
      ['producedHeads', 'Volumes produits (têtes)'],
      ['producedKg', 'Volumes produits (kg vif)'],
    );
  }
  if (columns.biosecurity) {
    out.push(
      ['bioClass', 'Biosécurité : classe du dernier contrôle'],
      ['bioScorePct', 'Biosécurité : score (%)'],
      ['bioDate', 'Biosécurité : date du contrôle'],
      ['bioA', 'Biosécurité : fermes en classe A'],
      ['bioB', 'Biosécurité : fermes en classe B'],
      ['bioC', 'Biosécurité : fermes en classe C'],
      ['bioNever', 'Biosécurité : fermes jamais contrôlées'],
      ['bioStale', 'Biosécurité : contrôles anciens'],
      ['bioAverageScorePct', 'Biosécurité : score moyen (%)'],
      ['bioControlledPct', 'Biosécurité : fermes contrôlées (%)'],
    );
  }
  return out;
}
