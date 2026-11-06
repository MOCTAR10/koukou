import { Injectable } from '@nestjs/common';
import { utcDay } from '../batches/poufa/bande-rules.js';
import { ParametersService } from '../programme/parameters.service.js';
import {
  conductAlertsOf,
  metricsOf,
  sumFacts,
  type ConductAlerts,
} from './pilotage-metrics.js';
import { CONDUCT_ALERTS_LABEL } from './pilotage-programme.js';
import {
  alertLevel,
  boundaryCentre,
  completenessLevel,
  mortalityLevel,
  pct,
  suppressedKeys,
  type ColourLevel,
  type Period,
  type Thresholds,
} from './pilotage-rules.js';
import {
  PilotageDashboardService,
  type PilotageQuery,
  type ScopeInfo,
} from './pilotage-dashboard.service.js';
import { PilotageDataService } from './pilotage-data.service.js';
import type { PilotageView } from './pilotage-scope.service.js';

export interface MapColours {
  mortality: ColourLevel | null;
  completeness: ColourLevel | null;
  /** ROUGE only with a published sanitary alert (conduct alerts never colour). */
  alert: ColourLevel;
}

/** Alerts of a point or a cluster: the published ones, conduct ones apart. */
export interface MapAlerts {
  published: number;
  conduct: ConductAlerts;
}

export interface MapPoint {
  farmId: string;
  code: string | null;
  name: string;
  provinceCode: string | null;
  latitude: number;
  longitude: number;
  statusCode: string | null;
  cohort: string | null;
  activeBands: number;
  headcount: number;
  mortalityPct: number | null;
  completenessPct: number | null;
  alerts: MapAlerts;
  colours: MapColours;
}

export interface MapCluster {
  provinceId: string;
  code: string;
  name: string;
  /** Centre of the province boundary, else the mean of its farms' points. */
  centroid: { latitude: number; longitude: number } | null;
  farms: number;
  farmsWithGps: number;
  suppressed: boolean;
  headcount: number | null;
  mortalityPct: number | null;
  completenessPct: number | null;
  alerts: MapAlerts | null;
  colours: MapColours | null;
}

export interface PilotageMap {
  generatedAt: string;
  period: Period;
  scope: ScopeInfo;
  legend: {
    mortality: Thresholds & { unit: '%'; description: string };
    completeness: Thresholds & { unit: '%'; description: string };
    alert: { description: string; conduct: string };
  };
  /** Farm points (registry GPS). Always empty for an aggregate-only view. */
  points: MapPoint[];
  /** Farms in scope without a GPS point (not on the map). */
  farmsWithoutGps: number;
  /** One cluster per province with farms in scope. */
  clusters: MapCluster[];
}

/**
 * Map data (CDC « Cartographie des exploitations »): farm points from the
 * registry GPS with colour keys (mortality, alert, completeness) and province
 * clusters. Tiles are a client choice: the backend serves data only.
 */
@Injectable()
export class PilotageMapService {
  constructor(
    private readonly dashboards: PilotageDashboardService,
    private readonly data: PilotageDataService,
    private readonly parameters: ParametersService,
  ) {}

  async map(
    view: PilotageView,
    query: PilotageQuery,
    today: string = utcDay(),
  ): Promise<PilotageMap> {
    const ctx = await this.dashboards.context(view, query, today);
    const resolver = await this.parameters.resolver(view.programId);
    const now = new Date();
    const mortalityT: Thresholds = {
      jaune: Number(resolver.value('CARTE_MORTALITE_JAUNE_PCT', now)),
      rouge: Number(resolver.value('CARTE_MORTALITE_ROUGE_PCT', now)),
    };
    const completenessT: Thresholds = {
      jaune: Number(resolver.value('CARTE_COMPLETUDE_JAUNE_PCT', now)),
      rouge: Number(resolver.value('CARTE_COMPLETUDE_ROUGE_PCT', now)),
    };
    const k = ctx.minGroupSize;
    const provinceById = new Map(ctx.provinces.map((p) => [p.id, p]));
    const colours = (f: {
      mortalityPct: number | null;
      completenessPct: number | null;
      published: number;
    }): MapColours => ({
      mortality: mortalityLevel(f.mortalityPct, mortalityT),
      completeness: completenessLevel(f.completenessPct, completenessT),
      alert: alertLevel(f),
    });

    const located = ctx.rows.filter(
      (r) => r.farm.latitude != null && r.farm.longitude != null,
    );
    const points: MapPoint[] = view.aggregateOnly
      ? []
      : located.map(({ farm, facts }) => {
          const mortalityPct = ctx.mortality(facts.deaths, facts.exposed);
          const completenessPct = pct(facts.daysEntered, facts.daysElapsed);
          return {
            farmId: farm.id,
            code: farm.code,
            name: farm.name,
            provinceCode: farm.provinceId
              ? (provinceById.get(farm.provinceId)?.code ?? null)
              : null,
            latitude: farm.latitude!,
            longitude: farm.longitude!,
            statusCode: farm.statusCode,
            cohort: farm.cohort,
            activeBands: facts.activeBands,
            headcount: facts.headcount,
            mortalityPct,
            completenessPct,
            alerts: {
              published: facts.publishedAlerts,
              conduct: conductAlertsOf(facts),
            },
            colours: colours({
              mortalityPct,
              completenessPct,
              published: facts.publishedAlerts,
            }),
          };
        });

    const geometries = await this.data.provinceGeometries(view.programId);
    const groups = new Map<string, typeof ctx.rows>();
    for (const r of ctx.rows) {
      const key = r.farm.provinceId ?? '';
      const list = groups.get(key);
      if (list) list.push(r);
      else groups.set(key, [r]);
    }
    const sums = [...groups].map(([key, list]) => ({
      key,
      list,
      facts: sumFacts(list.map((r) => r.facts)),
    }));
    const hidden = view.aggregateOnly
      ? suppressedKeys(
          sums.map((s) => ({ key: s.key, farms: s.facts.farmsWithData })),
          k,
        )
      : new Set<string>();

    const clusters: MapCluster[] = sums
      .map(({ key, list, facts }) => {
        const province = provinceById.get(key);
        const withGps = list.filter(
          (r) => r.farm.latitude != null && r.farm.longitude != null,
        );
        const suppressed = hidden.has(key);
        const m = metricsOf(facts, ctx.mortality);
        const centroid =
          boundaryCentre(geometries.get(key)) ??
          (!view.aggregateOnly || withGps.length >= k
            ? meanPoint(withGps.map((r) => r.farm))
            : null);
        return {
          sort: province?.sort ?? Number.MAX_SAFE_INTEGER,
          cluster: {
            provinceId: key,
            code: province?.code ?? '',
            name: province?.name ?? 'Sans province',
            centroid,
            farms: facts.farms,
            farmsWithGps: withGps.length,
            suppressed,
            headcount: suppressed ? null : m.headcount,
            mortalityPct: suppressed ? null : m.mortalityPct,
            completenessPct: suppressed ? null : m.completeness.pct,
            alerts: suppressed
              ? null
              : {
                  published: facts.publishedAlerts,
                  conduct: conductAlertsOf(facts),
                },
            colours: suppressed
              ? null
              : colours({
                  mortalityPct: m.mortalityPct,
                  completenessPct: m.completeness.pct,
                  published: facts.publishedAlerts,
                }),
          },
        };
      })
      .sort((a, b) => a.sort - b.sort)
      .map((c) => c.cluster);

    return {
      generatedAt: new Date().toISOString(),
      period: ctx.period,
      scope: this.dashboards.scopeInfo(view, k),
      legend: {
        mortality: {
          ...mortalityT,
          unit: '%',
          description:
            'Mortalité de la période : rouge à partir du seuil rouge, jaune à partir du seuil jaune.',
        },
        completeness: {
          ...completenessT,
          unit: '%',
          description:
            'Complétude des saisies : rouge sous le seuil rouge, jaune sous le seuil jaune.',
        },
        alert: {
          description:
            'Rouge : alerte sanitaire publiée par les services vétérinaires sur la période ; vert : aucune.',
          conduct: `${CONDUCT_ALERTS_LABEL} : comptées à part, elles ne colorent jamais une ferme.`,
        },
      },
      points,
      farmsWithoutGps: ctx.rows.length - located.length,
      clusters,
    };
  }
}

function meanPoint(
  farms: { latitude: number | null; longitude: number | null }[],
): { latitude: number; longitude: number } | null {
  if (farms.length === 0) return null;
  const lat = farms.reduce((s, f) => s + f.latitude!, 0) / farms.length;
  const lng = farms.reduce((s, f) => s + f.longitude!, 0) / farms.length;
  return {
    latitude: Math.round(lat * 1e5) / 1e5,
    longitude: Math.round(lng * 1e5) / 1e5,
  };
}
