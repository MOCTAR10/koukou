import type * as C from './financing.contract.js';

/**
 * Banker's ratios of a farm's financial statements, as pure functions of the
 * figures the SYSCOHADA module already computed. A ratio whose inputs are
 * missing, or whose denominator is not strictly positive, is `null`: never a
 * guess. Readings compare to programme parameters; ratios without a
 * threshold have no reading.
 */
export interface RatioInputs {
  netResultFcfa: number | null;
  /** Dotations aux amortissements et provisions (68x, 69x) of the period. */
  depreciationFcfa: number | null;
  revenueFcfa: number | null;
  /** Instalments due in the 12 months to come, all the farm's files. */
  due12mFcfa: number | null;
  /** Class 5 assets minus overdrafts. */
  netCashFcfa: number | null;
  /** Clients (41x), gross of nothing: the booked receivable. */
  receivablesFcfa: number | null;
  /** Emprunts et dettes assimilées (16x, 17x) and overdrafts. */
  financialDebtFcfa: number | null;
  equityFcfa: number | null;
  /** Equity + long-term debts. */
  stableResourcesFcfa: number | null;
  /** Net fixed assets (class 2, depreciation included). */
  fixedAssetsFcfa: number | null;
  daysInPeriod: number;
}

export interface RatioThresholds {
  /** Minimum CAF / next 12 months' instalments. */
  coverageMin: number;
  /** Maximum financial debt / equity. */
  leverageMax: number;
}

export type Ratio = C.FarmFinancials['ratios'][number];
type Reading = Ratio['reading'];

const round = (n: number, digits: number): number => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

const sub = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : a - b;

/** CAF = net result + depreciation and provisions. */
export function selfFinancingCapacity(i: RatioInputs): number | null {
  return i.netResultFcfa === null || i.depreciationFcfa === null
    ? null
    : i.netResultFcfa + i.depreciationFcfa;
}

/** Higher is better: BON from `min`, A_SURVEILLER from 1, FAIBLE below. */
export function readCoverage(value: number | null, min: number): Reading {
  if (value === null) return null;
  if (value >= min) return 'BON';
  return value >= 1 ? 'A_SURVEILLER' : 'FAIBLE';
}

/** Lower is better: BON up to `max`, A_SURVEILLER up to 1.5 x `max`, FAIBLE beyond. */
export function readLeverage(value: number | null, max: number): Reading {
  if (value === null) return null;
  if (value <= max) return 'BON';
  return value <= max * 1.5 ? 'A_SURVEILLER' : 'FAIBLE';
}

export function computeRatios(i: RatioInputs, t: RatioThresholds): Ratio[] {
  const caf = selfFinancingCapacity(i);
  const positive = (n: number | null): n is number => n !== null && n > 0;

  const margin =
    i.netResultFcfa !== null && positive(i.revenueFcfa)
      ? round((i.netResultFcfa / i.revenueFcfa) * 100, 1)
      : null;
  const coverage = caf !== null && positive(i.due12mFcfa) ? round(caf / i.due12mFcfa, 2) : null;
  const clientsDays =
    i.receivablesFcfa !== null && positive(i.revenueFcfa) && i.daysInPeriod > 0
      ? Math.round((i.receivablesFcfa / i.revenueFcfa) * i.daysInPeriod)
      : null;
  const leverage =
    i.financialDebtFcfa !== null && positive(i.equityFcfa)
      ? round(i.financialDebtFcfa / i.equityFcfa, 2)
      : null;
  const workingCapital = sub(i.stableResourcesFcfa, i.fixedAssetsFcfa);

  return [
    {
      code: 'CAF',
      label: 'Capacité d’autofinancement',
      value: caf,
      unit: 'FCFA',
      formula: 'Résultat net + dotations aux amortissements et aux provisions.',
      reading: null,
    },
    {
      code: 'MARGE_NETTE',
      label: 'Marge nette',
      value: margin,
      unit: '%',
      formula: 'Résultat net ÷ chiffre d’affaires de la période.',
      reading: null,
    },
    {
      code: 'SERVICE_DETTE',
      label: 'Couverture des échéances par la CAF',
      value: coverage,
      unit: 'x',
      formula:
        'Capacité d’autofinancement ÷ échéances des 12 prochains mois des dossiers de la ferme.',
      reading: readCoverage(coverage, t.coverageMin),
    },
    {
      code: 'TRESORERIE_NETTE',
      label: 'Trésorerie nette',
      value: i.netCashFcfa,
      unit: 'FCFA',
      formula: 'Comptes de trésorerie (classe 5) à l’actif moins les découverts bancaires.',
      reading: null,
    },
    {
      code: 'DELAI_CLIENTS',
      label: 'Délai de paiement des clients',
      value: clientsDays,
      unit: 'jours',
      formula: 'Créances clients ÷ chiffre d’affaires × nombre de jours de la période.',
      reading: null,
    },
    {
      code: 'ENDETTEMENT',
      label: 'Endettement',
      value: leverage,
      unit: 'x',
      formula: 'Dettes financières (emprunts, découverts) ÷ capitaux propres.',
      reading: readLeverage(leverage, t.leverageMax),
    },
    {
      code: 'FONDS_ROULEMENT',
      label: 'Fonds de roulement',
      value: workingCapital,
      unit: 'FCFA',
      formula: 'Ressources stables (capitaux propres et dettes à long terme) moins actif immobilisé net.',
      reading: null,
    },
  ];
}

/** Whole months between two ISO days (inclusive span), at least 0. */
export function monthsCovered(from: string, to: string): number {
  if (to < from) return 0;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  return Math.round(days / 30.4375);
}
