import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { utcDay } from '../batches/poufa/bande-rules.js';
import { ParametersService } from '../programme/parameters.service.js';
import {
  INPUT_RECONCILIATION_SOURCE,
  inputGapFigures,
  type InputGapFigures,
  type InputReconciliationSource,
} from './input-reconciliation.js';
import {
  METRIC_NOTES,
  metricsOf,
  sumFacts,
  type Facts,
  type PilotageMetrics,
} from './pilotage-metrics.js';
import {
  pct,
  resolvePeriod,
  round,
  suppressedKeys,
  type Period,
} from './pilotage-rules.js';
import {
  PilotageDataService,
  type FarmFacts,
  type ProvinceRow,
} from './pilotage-data.service.js';
import {
  PilotageScopeService,
  type FarmFilters,
  type PilotageView,
  type RawFilters,
} from './pilotage-scope.service.js';

export interface PilotageQuery extends RawFilters {
  from?: string;
  to?: string;
}

export interface ScopeInfo {
  kind: PilotageView['kind'];
  aggregateOnly: boolean;
  /** Minimal number of farms behind an aggregate shown to an aggregate-only view. */
  minGroupSize: number;
  note: string | null;
}

export interface GroupFigures {
  /** Farms of the registry in the group. */
  farms: number;
  /** True when hidden (aggregate-only view, fewer than `minGroupSize` farms). */
  suppressed: boolean;
  metrics: PilotageMetrics | null;
}

export interface ProvinceFigures extends GroupFigures {
  provinceId: string;
  code: string;
  name: string;
}

export interface CountItem {
  code: string | null;
  label: string;
  count: number;
}

export interface WeekFigures {
  weekStart: string;
  suppressed: boolean;
  farms: number;
  deaths: number | null;
  mortalityPct: number | null;
  producedHeads: number | null;
  producedTonnes: number | null;
  completenessPct: number | null;
}

export interface PilotageDashboard {
  generatedAt: string;
  period: Period;
  filters: {
    provinces: string[] | null;
    cohort: string | null;
    status: string | null;
  };
  scope: ScopeInfo;
  totals: GroupFigures;
  provinces: ProvinceFigures[];
  farms: {
    total: number;
    /** Farms with birds at the end of the period. */
    producing: number;
    byStatus: CountItem[];
    byCohort: CountItem[];
  };
  series: WeekFigures[];
  publishedAlerts: {
    /** False while no sanitary module provides published alerts (L5). */
    available: boolean;
    /** Published in the period, national and province alerts included. */
    count: number;
  };
  /** Input delivery and stock gaps (L4 intrants). */
  inputs: {
    /** False while no intrants module provides summaries (L4). */
    available: boolean;
    /** SEUIL_ECART_INTRANTS_PCT in force. */
    thresholdPct: number;
    suppressed: boolean;
    figures: InputGapFigures | null;
  };
  notes: readonly string[];
}

/** Everything a dashboard, an export or a report reads for one view. */
export interface DashboardContext {
  view: PilotageView;
  filters: FarmFilters;
  period: Period;
  minGroupSize: number;
  rows: FarmFacts[];
  provinces: ProvinceRow[];
}

const SUPPRESSION_NOTE = (k: number) =>
  `Données agrégées seulement : un agrégat calculé sur moins de ${k} fermes est masqué, ainsi que le plus petit groupe voisin quand il permettrait de le retrouver par différence.`;

/**
 * Province and national dashboards (CDC « Tableaux de bord province et
 * national »): headcounts, mortality, volumes produced and sold, prices,
 * farms by status and cohort, alerts and completeness, filtered by province,
 * period, cohort and status, within the viewer's scope.
 */
@Injectable()
export class PilotageDashboardService {
  constructor(
    private readonly scope: PilotageScopeService,
    private readonly data: PilotageDataService,
    private readonly parameters: ParametersService,
    @Inject(INPUT_RECONCILIATION_SOURCE)
    private readonly inputSource: InputReconciliationSource,
  ) {}

  /**
   * Period and registry filters of a query.
   * @throws BadRequestException on a bad period or an unknown province
   * @throws ForbiddenException on a province out of scope
   */
  async parse(
    view: PilotageView,
    query: PilotageQuery,
    today: string = utcDay(),
  ): Promise<{ period: Period; filters: FarmFilters }> {
    const resolved = resolvePeriod(query.from, query.to, today);
    if (!resolved.ok) throw new BadRequestException(resolved.error);
    return {
      period: resolved.period,
      filters: await this.scope.filters(view, query),
    };
  }

  /** Parses the query, reads the farms' facts. */
  async context(
    view: PilotageView,
    query: PilotageQuery,
    today: string = utcDay(),
  ): Promise<DashboardContext> {
    const { period, filters } = await this.parse(view, query, today);
    const [rows, provinces, minGroupSize] = await Promise.all([
      this.data.farmFacts(view, filters, period, today),
      this.data.provinces(view.programId),
      this.scope.minGroupSize(view.programId),
    ]);
    return {
      view,
      filters,
      period,
      minGroupSize,
      rows,
      provinces,
    };
  }

  async dashboard(
    view: PilotageView,
    query: PilotageQuery,
    today: string = utcDay(),
  ): Promise<PilotageDashboard> {
    const ctx = await this.context(view, query, today);
    return this.build(ctx, today);
  }

  async build(
    ctx: DashboardContext,
    today: string = utcDay(),
  ): Promise<PilotageDashboard> {
    const { view, filters, period, minGroupSize: k, rows } = ctx;
    const [weeks, statuses, cohorts, published, inputs] = await Promise.all([
      this.data.weeklyFacts(view, filters, period, today),
      this.data.listLabels(view.programId, 'STATUT_FERME'),
      this.data.listLabels(view.programId, 'COHORTE'),
      this.data.publishedCounts(
        view,
        filters,
        period,
        this.data.unrestricted(view)
          ? null
          : [
              ...new Set(
                rows
                  .map((r) => r.farm.provinceId)
                  .filter((id): id is string => id != null),
              ),
            ],
      ),
      this.inputs(view, rows),
    ]);
    const totalFacts = sumFacts(rows.map((r) => r.facts));
    // Published alerts about a province or the whole country count in the
    // totals, not in a farm's row.
    totalFacts.publishedAlerts = published.length;

    const provinces = this.byProvince(ctx);
    const totalsHidden =
      view.aggregateOnly &&
      totalFacts.farmsWithData > 0 &&
      totalFacts.farmsWithData < k;

    const weekHidden = view.aggregateOnly
      ? suppressedKeys(
          weeks.map((w) => ({ key: w.weekStart, farms: w.farms })),
          k,
        )
      : new Set<string>();

    return {
      generatedAt: new Date().toISOString(),
      period,
      filters: {
        provinces: filters.provinceIds
          ? ctx.provinces
              .filter((p) => filters.provinceIds!.includes(p.id))
              .map((p) => p.code)
          : null,
        cohort: filters.cohort,
        status: filters.status,
      },
      scope: this.scopeInfo(view, k),
      totals: {
        farms: totalFacts.farms,
        suppressed: totalsHidden,
        metrics: totalsHidden ? null : metricsOf(totalFacts),
      },
      provinces,
      farms: {
        total: rows.length,
        producing: rows.filter((r) => r.facts.activeBands > 0).length,
        byStatus: this.countBy(rows, (r) => r.farm.statusCode, statuses),
        byCohort: this.countBy(rows, (r) => r.farm.cohort, cohorts),
      },
      series: weeks.map((w) => {
        const hidden = totalsHidden || weekHidden.has(w.weekStart);
        return {
          weekStart: w.weekStart,
          suppressed: hidden,
          farms: w.farms,
          deaths: hidden ? null : w.deaths,
          mortalityPct: hidden ? null : pct(w.deaths, w.exposed),
          producedHeads: hidden ? null : w.exits,
          producedTonnes: hidden ? null : round(w.exitKg / 1000, 3),
          completenessPct: hidden ? null : pct(w.daysEntered, w.daysElapsed),
        };
      }),
      publishedAlerts: {
        available: this.data.publishedAlertsAvailable,
        count: published.length,
      },
      inputs: {
        ...inputs,
        suppressed: inputs.suppressed || totalsHidden,
        figures: inputs.suppressed || totalsHidden ? null : inputs.figures,
      },
      notes: METRIC_NOTES,
    };
  }

  /** Input gaps of the farms in scope, hidden under `k` farms for an aggregate view. */
  private async inputs(
    view: PilotageView,
    rows: readonly FarmFacts[],
  ): Promise<PilotageDashboard['inputs']> {
    const resolver = await this.parameters.resolver(view.programId);
    const thresholdPct = Number(
      resolver.value('SEUIL_ECART_INTRANTS_PCT', new Date()),
    );
    const available = this.inputSource.available;
    if (!available || rows.length === 0) {
      return { available, thresholdPct, suppressed: false, figures: null };
    }
    const summaries = await this.inputSource.farmSummaries(
      rows.map((r) => r.farm.id),
    );
    const k = await this.scope.minGroupSize(view.programId);
    const suppressed =
      view.aggregateOnly && summaries.length > 0 && summaries.length < k;
    return {
      available,
      thresholdPct,
      suppressed,
      figures: suppressed ? null : inputGapFigures(summaries, thresholdPct),
    };
  }

  scopeInfo(view: PilotageView, k: number): ScopeInfo {
    return {
      kind: view.kind,
      aggregateOnly: view.aggregateOnly,
      minGroupSize: k,
      note: view.aggregateOnly ? SUPPRESSION_NOTE(k) : null,
    };
  }

  /** One line per province holding farms in scope, small groups hidden for an aggregate view. */
  byProvince(ctx: DashboardContext): ProvinceFigures[] {
    const groups = new Map<string, Facts[]>();
    for (const r of ctx.rows) {
      const key = r.farm.provinceId ?? '';
      const list = groups.get(key);
      if (list) list.push(r.facts);
      else groups.set(key, [r.facts]);
    }
    const sums = [...groups].map(([key, list]) => ({
      key,
      facts: sumFacts(list),
    }));
    const hidden = ctx.view.aggregateOnly
      ? suppressedKeys(
          sums.map((s) => ({ key: s.key, farms: s.facts.farmsWithData })),
          ctx.minGroupSize,
        )
      : new Set<string>();
    const byId = new Map(ctx.provinces.map((p) => [p.id, p]));
    return sums
      .map(({ key, facts }) => {
        const province = byId.get(key);
        const suppressed = hidden.has(key);
        return {
          provinceId: key,
          code: province?.code ?? '',
          name: province?.name ?? 'Sans province',
          sort: province?.sort ?? Number.MAX_SAFE_INTEGER,
          farms: facts.farms,
          suppressed,
          metrics: suppressed ? null : metricsOf(facts),
        };
      })
      .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code))
      .map(({ sort: _sort, ...rest }) => rest);
  }

  private countBy(
    rows: FarmFacts[],
    keyOf: (r: FarmFacts) => string | null,
    labels: { code: string; label: string }[],
  ): CountItem[] {
    const counts = new Map<string | null, number>();
    for (const r of rows) {
      const k = keyOf(r);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const known = labels
      .filter((l) => counts.has(l.code))
      .map((l) => ({
        code: l.code,
        label: l.label,
        count: counts.get(l.code)!,
      }));
    const others = [...counts]
      .filter(([code]) => code !== null && !labels.some((l) => l.code === code))
      .map(([code, count]) => ({ code, label: String(code), count }));
    const none = counts.get(null);
    return [
      ...known,
      ...others,
      ...(none ? [{ code: null, label: 'Non renseigné', count: none }] : []),
    ];
  }
}
