/** How far under the breed's IPE target a lot counts as behind (the server alert's default). */
const IPE_WARN_DEVIATION_PCT = 10;

/**
 * Week the laying cycle ends: the first drop under 60 % after the peak. Weeks
 * before the peak also sit under 60 %, so they must not count.
 */
export function endOfLayStandard<T extends { week: number; targetLayRatePercent?: number | null }>(
  standards: T[],
  peakWeek: number,
): T | undefined {
  return [...standards]
    .sort((a, b) => a.week - b.week)
    .find((s) => s.week > peakWeek && (s.targetLayRatePercent ?? 0) < 60);
}

export type IpeStatus = { label: string; tone: 'green' | 'amber' | 'default' };

/** A higher IPE is better: it is judged against the breed's target, as the server does. */
export function ipeStatus(ipe: number | null, target: number | null): IpeStatus | null {
  if (ipe == null) return null;
  if (target == null || target <= 0) return { label: 'Sans référence', tone: 'default' };
  const deviationPct = ((ipe - target) / target) * 100;
  return deviationPct < -IPE_WARN_DEVIATION_PCT
    ? { label: 'En retrait', tone: 'amber' }
    : { label: 'Conforme', tone: 'green' };
}
