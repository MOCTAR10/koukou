import type * as C from './financing.contract.js';

/**
 * Risk-committee figures of the portfolio, pure: ageing of the overdue
 * amounts, concentration of the outstanding and indicative provisions.
 */

type AgeingKey = C.PortfolioRisk['ageing'][number]['key'];

const AGEING: ReadonlyArray<{ key: AgeingKey; label: string; max: number }> = [
  { key: 'J1_30', label: '1 à 30 jours', max: 30 },
  { key: 'J31_60', label: '31 à 60 jours', max: 60 },
  { key: 'J61_90', label: '61 à 90 jours', max: 90 },
  { key: 'J90_PLUS', label: 'Plus de 90 jours', max: Infinity },
];

export interface RiskFile {
  farmId: string;
  farmName: string;
  provinceKey: string;
  provinceName: string | null;
  claimClass: C.ClaimClass;
  /** Days since the oldest unpaid due date, 0 when none. */
  daysLate: number;
  overdueFcfa: number;
  outstandingFcfa: number;
}

/** Percent with one decimal; null when the whole is not positive. */
export function sharePct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/** Files and overdue FCFA by days late; a file with nothing overdue is not counted. */
export function ageingOf(files: readonly RiskFile[]): C.PortfolioRisk['ageing'] {
  return AGEING.map((bucket, i) => {
    const min = i === 0 ? 1 : AGEING[i - 1].max + 1;
    const inBucket = files.filter((f) => f.overdueFcfa > 0 && f.daysLate >= min && f.daysLate <= bucket.max);
    return {
      key: bucket.key,
      label: bucket.label,
      files: inBucket.length,
      overdueFcfa: inBucket.reduce((s, f) => s + f.overdueFcfa, 0),
    };
  });
}

/** Five largest borrowers (farms, files added up) and the outstanding by province. */
export function concentrationOf(files: readonly RiskFile[]): C.PortfolioRisk['concentration'] {
  const total = files.reduce((s, f) => s + f.outstandingFcfa, 0);
  const farms = new Map<string, { farmName: string; provinceName: string | null; files: number; outstandingFcfa: number }>();
  const provinces = new Map<string, { label: string; files: number; outstandingFcfa: number }>();
  for (const f of files) {
    if (f.outstandingFcfa <= 0) continue;
    const farm = farms.get(f.farmId) ?? { farmName: f.farmName, provinceName: f.provinceName, files: 0, outstandingFcfa: 0 };
    farm.files += 1;
    farm.outstandingFcfa += f.outstandingFcfa;
    farms.set(f.farmId, farm);
    const province = provinces.get(f.provinceKey) ?? { label: f.provinceName ?? 'Sans province', files: 0, outstandingFcfa: 0 };
    province.files += 1;
    province.outstandingFcfa += f.outstandingFcfa;
    provinces.set(f.provinceKey, province);
  }
  const top = [...farms]
    .map(([farmId, v]) => ({ farmId, ...v, sharePct: sharePct(v.outstandingFcfa, total) ?? 0 }))
    .sort((a, b) => b.outstandingFcfa - a.outstandingFcfa || a.farmName.localeCompare(b.farmName, 'fr'))
    .slice(0, 5);
  return {
    top,
    topSharePct: sharePct(
      top.reduce((s, t) => s + t.outstandingFcfa, 0),
      total,
    ),
    byProvince: [...provinces]
      .map(([key, v]) => ({ key, ...v, sharePct: sharePct(v.outstandingFcfa, total) ?? 0 }))
      .sort((a, b) => b.outstandingFcfa - a.outstandingFcfa || a.label.localeCompare(b.label, 'fr')),
  };
}

/** Provision rates by claim class, in percent (programme parameters). */
export interface ProvisionRates {
  generale: number;
  impaye: number;
  douteux: number;
  irrecouvrable: number;
}

export const PROVISION_CLASSES: readonly C.ClaimClass[] = ['SAIN', 'SENSIBLE', 'RESTRUCTURE', 'IMPAYE', 'DOUTEUX', 'IRRECOUVRABLE'];

const CLASS_LABELS: Record<string, string> = {
  SAIN: 'Saine',
  SENSIBLE: 'Sensible',
  RESTRUCTURE: 'Restructurée',
  IMPAYE: 'Impayée',
  DOUTEUX: 'Douteuse',
  IRRECOUVRABLE: 'Irrécouvrable',
};

export function rateOf(claimClass: C.ClaimClass, rates: ProvisionRates): number {
  switch (claimClass) {
    case 'IMPAYE':
      return rates.impaye;
    case 'DOUTEUX':
      return rates.douteux;
    case 'IRRECOUVRABLE':
      return rates.irrecouvrable;
    default:
      return rates.generale;
  }
}

/** Outstanding × rate per class, rounded to the FCFA; paid-off and empty files carry none. */
export function provisionsOf(files: readonly RiskFile[], rates: ProvisionRates): C.PortfolioRisk['provisions'] {
  const rows = PROVISION_CLASSES.map((claimClass) => {
    const inClass = files.filter((f) => f.claimClass === claimClass && f.outstandingFcfa > 0);
    const outstandingFcfa = inClass.reduce((s, f) => s + f.outstandingFcfa, 0);
    const ratePct = rateOf(claimClass, rates);
    return {
      claimClass,
      label: CLASS_LABELS[claimClass],
      files: inClass.length,
      outstandingFcfa,
      ratePct,
      provisionFcfa: Math.round((outstandingFcfa * ratePct) / 100),
    };
  });
  const totalFcfa = rows.reduce((s, r) => s + r.provisionFcfa, 0);
  const outstanding = rows.reduce((s, r) => s + r.outstandingFcfa, 0);
  return { rows, totalFcfa, coveragePct: sharePct(totalFcfa, outstanding) };
}

/** Programme parameters holding the rates, with the catalogue's proposed values. */
export const PROVISION_PARAMETERS: ReadonlyArray<readonly [keyof ProvisionRates, string, number]> = [
  ['generale', 'FINANCEMENT_PROVISION_GENERALE_PCT', 2],
  ['impaye', 'FINANCEMENT_PROVISION_IMPAYE_PCT', 0],
  ['douteux', 'FINANCEMENT_PROVISION_DOUTEUX_PCT', 50],
  ['irrecouvrable', 'FINANCEMENT_PROVISION_IRRECOUVRABLE_PCT', 100],
];

export function riskOf(files: readonly RiskFile[], rates: ProvisionRates): C.PortfolioRisk {
  return { ageing: ageingOf(files), concentration: concentrationOf(files), provisions: provisionsOf(files, rates) };
}
