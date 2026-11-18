/**
 * Daily feed per bird (grams) derived from the weekly weight and cumulative
 * FCR targets of a breed:
 *   cumulative(w) = targetAvgWeightKg(w) x targetFcr(w)   (kg per bird)
 *   daily(w)      = (cumulative(w) - cumulative(previous week)) / days x 1000
 * The first row uses a previous cumulative of 0 at week 0. When weeks are
 * skipped, the difference is spread over the days between the two rows.
 * Null when weight or FCR is missing, or the result is not positive. Indicative
 * value, to be validated by the DGE. The migration `TechnicalItinerary`
 * applies the same rule in SQL; keep both in step.
 */
export interface DailyFeedInput {
  week: number;
  targetAvgWeightKg: number | null;
  targetFcr: number | null;
}

export function deriveDailyFeedG<T extends DailyFeedInput>(
  rows: readonly T[],
): Array<number | null> {
  const order = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.week - b.row.week);
  const out: Array<number | null> = rows.map(() => null);
  let prevCum = 0;
  let prevWeek = 0;
  for (const { row, index } of order) {
    const w = row.targetAvgWeightKg;
    const f = row.targetFcr;
    if (w == null || f == null) {
      // Same as the SQL LAG over the ordered rows: the previous row is the
      // previous one whatever its content, a null cumulative leaves the next
      // result null.
      prevCum = Number.NaN;
      prevWeek = row.week;
      continue;
    }
    const cum = w * f;
    const days = (row.week - prevWeek) * 7;
    if (!Number.isNaN(prevCum) && days > 0) {
      const daily = ((cum - prevCum) / days) * 1000;
      out[index] = daily > 0 ? Math.round(daily * 10) / 10 : null;
    }
    prevCum = cum;
    prevWeek = row.week;
  }
  return out;
}
