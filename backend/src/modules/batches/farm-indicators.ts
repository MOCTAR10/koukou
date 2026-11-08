import { BatchStatus, BatchType } from '../../common/enums/batch-type.enum.js';
import type { Species } from '../../common/enums/species.enum.js';
import type { BatchMetrics } from './models/batch-metrics.model.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export interface FarmLayingRate {
  species: Species;
  customSpecies: string | null;
  /** Σ eggs / Σ hen-days of the 7-day window, capped at 100 %. */
  layRatePercent: number | null;
  eggs: number;
  henDays: number;
  lots: number;
}

export interface FarmIndicators {
  /** Window (days) the rates below are measured on. */
  windowDays: number;
  /** Laying rate per species, hen-days weighted (open layer lots). */
  layingBySpecies: FarmLayingRate[];
  /** All the open layer lots together, hen-days weighted. */
  layRatePercent: number | null;
  /** Feed per bird-day (kg/bird/day), on the birds present (open lots). */
  feedPerBirdDayKg: number | null;
}

interface LotLike {
  status: BatchStatus;
  type: BatchType;
  species: Species;
  customSpecies?: string | null;
  metrics: Pick<
    BatchMetrics,
    | 'layWindowEggs'
    | 'layWindowHenDays'
    | 'feedWindowKg'
    | 'feedWindowBirdDays'
  >;
}

/**
 * Farm-level indicators from the lots' windowed terms, the same rule as
 * MetricsService / PondageService (hen-days weighted, hens present on each
 * recorded day): a mean of rates would let a 20-hen lot weigh like a
 * 2000-hen one. Pure.
 */
export function farmIndicators(lots: readonly LotLike[]): FarmIndicators {
  const open = lots.filter((l) => l.status !== BatchStatus.CLOTURE);
  const groups = new Map<
    string,
    {
      species: Species;
      custom: string | null;
      eggs: number;
      henDays: number;
      lots: number;
    }
  >();
  for (const l of open) {
    if (l.type !== BatchType.PONDEUSE) continue;
    const custom = l.customSpecies ?? null;
    const key = `${l.species}|${custom ?? ''}`;
    const g = groups.get(key) ?? {
      species: l.species,
      custom,
      eggs: 0,
      henDays: 0,
      lots: 0,
    };
    g.eggs += l.metrics.layWindowEggs;
    g.henDays += l.metrics.layWindowHenDays;
    g.lots += 1;
    groups.set(key, g);
  }
  const feedKg = open.reduce((s, l) => s + l.metrics.feedWindowKg, 0);
  const birdDays = open.reduce((s, l) => s + l.metrics.feedWindowBirdDays, 0);
  const allEggs = [...groups.values()].reduce((s, g) => s + g.eggs, 0);
  const allHenDays = [...groups.values()].reduce((s, g) => s + g.henDays, 0);
  return {
    windowDays: 7,
    layRatePercent:
      allHenDays > 0
        ? round2(Math.min(100, (allEggs / allHenDays) * 100))
        : null,
    layingBySpecies: [...groups.values()].map((g) => ({
      species: g.species,
      customSpecies: g.custom,
      layRatePercent:
        g.henDays > 0
          ? round2(Math.min(100, (g.eggs / g.henDays) * 100))
          : null,
      eggs: g.eggs,
      henDays: g.henDays,
      lots: g.lots,
    })),
    feedPerBirdDayKg:
      feedKg > 0 && birdDays > 0 ? round4(feedKg / birdDays) : null,
  };
}
