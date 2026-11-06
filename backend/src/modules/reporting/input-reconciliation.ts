/**
 * L4 seam (intrants): the declarative stock module's per-farm summaries
 * (`DeclarativeStockService.farmSummaries(farmIds)` on the L4 branch), read by
 * the dashboards to count delivery and stock gaps. The default provider has
 * no data (`available: false`); at integration, bind
 * `INPUT_RECONCILIATION_SOURCE` in `ReportingModule` to an adapter over the
 * L4 service. The écart threshold is `SEUIL_ECART_INTRANTS_PCT` (read here,
 * at the dashboard's date).
 */

export const INPUT_RECONCILIATION_SOURCE = Symbol(
  'INPUT_RECONCILIATION_SOURCE',
);

export interface InputDeliveryCounts {
  pending: number;
  confirmed: number;
  cancelled: number;
  /** Confirmed deliveries whose received quantity differs from the shipped one. */
  withGap: number;
}

export interface InputStockLine {
  inputCode: string;
  pending: number;
  shipped: number;
  received: number;
  used: number;
  /** Received − used, as declared by the farm. */
  declarativeStock: number;
  /** Last physical count, null when none. */
  physicalStock: number | null;
}

export interface InputFarmSummary {
  farmId: string;
  deliveries: InputDeliveryCounts;
  inputs: InputStockLine[];
}

export interface InputReconciliationSource {
  readonly available: boolean;
  /** Summaries of the given farms (already scoped by the caller). */
  farmSummaries(farmIds: readonly string[]): Promise<InputFarmSummary[]>;
}

export class NoInputReconciliationSource implements InputReconciliationSource {
  readonly available = false;

  farmSummaries(): Promise<InputFarmSummary[]> {
    return Promise.resolve([]);
  }
}

/**
 * Gap between the declared and the counted stock, in % of the declared one;
 * null without a physical count. A count on a zero declared stock is 0 % when
 * it is zero too, 100 % otherwise.
 */
export function stockGapPct(
  declarative: number,
  physical: number | null,
): number | null {
  if (physical == null) return null;
  if (declarative <= 0) return physical === 0 ? 0 : 100;
  return (Math.abs(declarative - physical) / declarative) * 100;
}

export interface InputGapFigures {
  farms: number;
  deliveries: InputDeliveryCounts;
  /** Input lines with a physical count. */
  stockLinesCounted: number;
  /** Counted lines whose gap exceeds the threshold. */
  stockLinesOverThreshold: number;
  /** Farms with at least one such line. */
  farmsWithStockGap: number;
}

export function inputGapFigures(
  summaries: readonly InputFarmSummary[],
  thresholdPct: number,
): InputGapFigures {
  const out: InputGapFigures = {
    farms: summaries.length,
    deliveries: { pending: 0, confirmed: 0, cancelled: 0, withGap: 0 },
    stockLinesCounted: 0,
    stockLinesOverThreshold: 0,
    farmsWithStockGap: 0,
  };
  for (const s of summaries) {
    out.deliveries.pending += s.deliveries.pending;
    out.deliveries.confirmed += s.deliveries.confirmed;
    out.deliveries.cancelled += s.deliveries.cancelled;
    out.deliveries.withGap += s.deliveries.withGap;
    let farmGap = false;
    for (const line of s.inputs) {
      const gap = stockGapPct(line.declarativeStock, line.physicalStock);
      if (gap == null) continue;
      out.stockLinesCounted += 1;
      if (gap > thresholdPct) {
        out.stockLinesOverThreshold += 1;
        farmGap = true;
      }
    }
    if (farmGap) out.farmsWithStockGap += 1;
  }
  return out;
}
