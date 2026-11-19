/**
 * Pure rules of the financer's statements: how complete the farm's entries
 * are over the period and the result including the estimated feed stock.
 */

/** Days with entries / days in period, in percent (one decimal); 0 for an empty period. */
export function coveragePctOf(daysWithEntries: number, daysInPeriod: number): number {
  return daysInPeriod > 0 ? Math.round((daysWithEntries / daysInPeriod) * 1000) / 10 : 0;
}

/** French percent: « 42,5 », « 60 ». */
const frPct = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** The warning shown on the first page of the PDF, or null when the entries are complete enough. */
export function incompleteEntriesWarning(r: {
  daysWithEntries: number;
  daysInPeriod: number;
  coveragePct: number;
  coverageMinPct: number;
}): string | null {
  return r.coveragePct < r.coverageMinPct
    ? `Saisie incomplète : ${r.daysWithEntries} jours saisis sur ${r.daysInPeriod} (${frPct(r.coveragePct)} %)`
    : null;
}

/** Net result of the income statement: the ledger's result plus the estimated feed stock. */
export function netResultWithStock(ledgerResultFcfa: number, stockVariationFcfa: number): number {
  return ledgerResultFcfa + stockVariationFcfa;
}
