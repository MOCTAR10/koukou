import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { utcDay } from '../batches/poufa/bande-rules.js';
import type { ExportTable } from './export-table.js';
import { metricsOf } from './pilotage-metrics.js';
import { pct, round } from './pilotage-rules.js';
import {
  PilotageDashboardService,
  type PilotageQuery,
} from './pilotage-dashboard.service.js';
import {
  PilotageScopeService,
  SqlParams,
  type PilotageView,
} from './pilotage-scope.service.js';

/** Band rows of one export, at most. */
const MAX_BAND_ROWS = 20_000;

const n = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * Export tables of the steering (CDC « Filtres et exports »: conformes aux
 * droits du profil et journalisés). Same scope and filters as the
 * dashboards; the farm and band files are refused to an aggregate-only view.
 * Each method returns columns + rows; `ExportWriter` (export-table.ts) turns
 * them into CSV today and Excel once its serializer is plugged in.
 */
@Injectable()
export class PilotageExportsService {
  constructor(
    private readonly dashboards: PilotageDashboardService,
    private readonly scope: PilotageScopeService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** One line per province, then the total (hidden cells left empty). */
  async provinces(
    view: PilotageView,
    query: PilotageQuery,
  ): Promise<ExportTable> {
    const ctx = await this.dashboards.context(view, query);
    const d = await this.dashboards.build(ctx);
    const line = (
      code: string,
      name: string,
      farms: number,
      suppressed: boolean,
      m: ReturnType<typeof metricsOf> | null,
    ) => ({
      code,
      name,
      farms,
      suppressed: suppressed ? 'oui' : 'non',
      farmsReporting: m?.farmsReporting,
      bands: m?.bands,
      activeBands: m?.activeBands,
      headcount: m?.headcount,
      placed: m?.placedHeads,
      deaths: m?.deaths,
      mortality: m?.mortalityPct,
      producedHeads: m?.produced.heads,
      producedT: m?.produced.tonnes,
      soldHeads: m?.sold.liveHeads,
      soldKg: m?.sold.liveKg,
      carcassHeads: m?.sold.carcassHeads,
      carcassKg: m?.sold.carcassKg,
      revenue: m?.sold.revenueFcfa,
      pricePerHead: m?.sold.avgPricePerHeadFcfa,
      pricePerKg: m?.sold.avgPricePerKgFcfa,
      completeness: m?.completeness.pct,
      alertsRaised: m?.alerts.raised,
      alertsRed: m?.alerts.raisedRed,
      alertsActive: m?.alerts.activeNow,
      published: m?.alerts.published,
    });
    const rows = [
      ...d.provinces.map((p) =>
        line(p.code, p.name, p.farms, p.suppressed, p.metrics),
      ),
      line(
        'TOTAL',
        'Total du périmètre',
        d.totals.farms,
        d.totals.suppressed,
        d.totals.metrics,
      ),
    ];
    return {
      baseName: `pilotage-provinces-${ctx.period.from}-${ctx.period.to}`,
      sheetName: 'Provinces',
      columns: [
        ['code', 'Code province'],
        ['name', 'Province'],
        ['farms', 'Fermes'],
        ['suppressed', 'Masqué (petit groupe)'],
        ['farmsReporting', 'Fermes ayant saisi'],
        ['bands', 'Bandes suivies'],
        ['activeBands', 'Bandes en cours'],
        ['headcount', 'Effectif fin de période'],
        ['placed', 'Poussins mis en place'],
        ['deaths', 'Morts'],
        ['mortality', 'Mortalité (%)'],
        ['producedHeads', 'Sortis vivants (têtes)'],
        ['producedT', 'Poids vif produit (t)'],
        ['soldHeads', 'Vifs vendus (têtes)'],
        ['soldKg', 'Vifs vendus (kg)'],
        ['carcassHeads', 'Carcasses vendues (pièces)'],
        ['carcassKg', 'Carcasses vendues (kg)'],
        ['revenue', 'Chiffre d’affaires volailles (FCFA)'],
        ['pricePerHead', 'Prix moyen par tête (FCFA)'],
        ['pricePerKg', 'Prix moyen au kg vif (FCFA)'],
        ['completeness', 'Complétude (%)'],
        ['alertsRaised', 'Alertes levées'],
        ['alertsRed', 'dont rouges'],
        ['alertsActive', 'Alertes actives'],
        ['published', 'Alertes sanitaires publiées'],
      ],
      rows,
    };
  }

  /** One line per farm in scope (never for an aggregate-only view). */
  async farms(view: PilotageView, query: PilotageQuery): Promise<ExportTable> {
    this.scope.assertFarmRows(view);
    const ctx = await this.dashboards.context(view, query);
    const provinces = new Map(ctx.provinces.map((p) => [p.id, p]));
    const rows = ctx.rows.map(({ farm, facts }) => {
      const m = metricsOf(facts);
      return {
        code: farm.code,
        name: farm.name,
        province: farm.provinceId ? provinces.get(farm.provinceId)?.code : null,
        status: farm.statusCode,
        cohort: farm.cohort,
        capacity: farm.capacityPlaces,
        latitude: farm.latitude,
        longitude: farm.longitude,
        bands: m.bands,
        activeBands: m.activeBands,
        headcount: m.headcount,
        placed: m.placedHeads,
        deaths: m.deaths,
        mortality: m.mortalityPct,
        producedHeads: m.produced.heads,
        producedKg: m.produced.kg,
        soldHeads: m.sold.liveHeads,
        soldKg: m.sold.liveKg,
        revenue: m.sold.revenueFcfa,
        pricePerHead: m.sold.avgPricePerHeadFcfa,
        completeness: m.completeness.pct,
        alertsActive: m.alerts.activeNow,
        alertsRed: m.alerts.activeRedNow,
        published: m.alerts.published,
      };
    });
    return {
      baseName: `pilotage-fermes-${ctx.period.from}-${ctx.period.to}`,
      sheetName: 'Fermes',
      columns: [
        ['code', 'Code ferme'],
        ['name', 'Ferme'],
        ['province', 'Province'],
        ['status', 'Statut'],
        ['cohort', 'Cohorte'],
        ['capacity', 'Capacité (places)'],
        ['latitude', 'Latitude'],
        ['longitude', 'Longitude'],
        ['bands', 'Bandes suivies'],
        ['activeBands', 'Bandes en cours'],
        ['headcount', 'Effectif fin de période'],
        ['placed', 'Poussins mis en place'],
        ['deaths', 'Morts'],
        ['mortality', 'Mortalité (%)'],
        ['producedHeads', 'Sortis vivants (têtes)'],
        ['producedKg', 'Poids vif produit (kg)'],
        ['soldHeads', 'Vifs vendus (têtes)'],
        ['soldKg', 'Vifs vendus (kg)'],
        ['revenue', 'Chiffre d’affaires volailles (FCFA)'],
        ['pricePerHead', 'Prix moyen par tête (FCFA)'],
        ['completeness', 'Complétude (%)'],
        ['alertsActive', 'Alertes actives'],
        ['alertsRed', 'dont rouges'],
        ['published', 'Alertes sanitaires publiées'],
      ],
      rows,
    };
  }

  /** One line per band active in the period (never for an aggregate-only view). */
  async bands(view: PilotageView, query: PilotageQuery): Promise<ExportTable> {
    this.scope.assertFarmRows(view);
    // Same period and filter checks as the dashboards.
    const ctx = await this.dashboards.parse(view, query);
    const farms = this.scope.scopedFarms(view, ctx.filters);
    const p = new SqlParams(farms.params);
    const from = p.add(`${ctx.period.from}T00:00:00.000Z`);
    const to = p.add(ctx.period.to);
    const today = p.add(utcDay());
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `WITH sf AS (${farms.sql})
       SELECT b.code, b.batch_name, b.status, b.integration_date, b.initial_age_days,
              b.quantity_at_start, b.closed_at, sf.code AS farm_code, sf.name AS farm_name,
              pr.code AS province, l.day, l.age_days, l.present, l.deaths_cumulative,
              l.removals_cumulative, l.last_weight_g, l.feed_cumulative_kg,
              c.entered, c.elapsed
         FROM production_batches b
         JOIN sf ON sf.id = b.farm_id
         LEFT JOIN provinces pr ON pr.id = sf.province_id
         JOIN LATERAL (
           SELECT s.day, s.age_days, s.present, s.deaths_cumulative, s.removals_cumulative,
                  s.last_weight_g, s.feed_cumulative_kg
             FROM bande_daily_stats s
            WHERE s.batch_id = b.id AND s.day <= ${to}::date
            ORDER BY s.day DESC LIMIT 1
         ) l ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (WHERE s.entry_done) AS entered,
                  COUNT(*) FILTER (WHERE s.entry_done OR s.day < ${today}::date) AS elapsed
             FROM bande_daily_stats s
            WHERE s.batch_id = b.id AND s.day <= ${to}::date
         ) c ON TRUE
        WHERE b.integration_date <= ${to}::date
          AND (b.closed_at IS NULL OR b.closed_at >= ${from}::timestamptz)
        ORDER BY sf.code NULLS LAST, b.code NULLS LAST
        LIMIT ${MAX_BAND_ROWS}`,
      p.values,
    );
    return {
      baseName: `pilotage-bandes-${ctx.period.from}-${ctx.period.to}`,
      sheetName: 'Bandes',
      columns: [
        ['code', 'Code bande'],
        ['name', 'Nom'],
        ['farmCode', 'Code ferme'],
        ['farmName', 'Ferme'],
        ['province', 'Province'],
        ['status', 'Statut'],
        ['opened', 'Ouverture'],
        ['initialAge', 'Âge à l’ouverture (j)'],
        ['closed', 'Clôture'],
        ['lastDay', 'Dernier jour suivi'],
        ['age', 'Âge (j)'],
        ['placed', 'Mis en place'],
        ['present', 'Présents'],
        ['deaths', 'Morts cumulés'],
        ['mortality', 'Mortalité cumulée (%)'],
        ['exits', 'Sortis vivants cumulés'],
        ['feedKg', 'Aliment cumulé (kg)'],
        ['weight', 'Dernier poids moyen (g)'],
        ['completeness', 'Complétude (%)'],
      ],
      rows: rows.map((r) => ({
        code: r.code,
        name: r.batch_name,
        farmCode: r.farm_code,
        farmName: r.farm_name,
        province: r.province,
        status: r.status,
        opened: String(r.integration_date ?? '').slice(0, 10),
        initialAge: n(r.initial_age_days),
        closed: r.closed_at
          ? new Date(String(r.closed_at)).toISOString().slice(0, 10)
          : null,
        lastDay: String(r.day ?? '').slice(0, 10),
        age: n(r.age_days),
        placed: n(r.quantity_at_start),
        present: n(r.present),
        deaths: n(r.deaths_cumulative),
        mortality: pct(
          Number(r.deaths_cumulative ?? 0),
          Number(r.quantity_at_start ?? 0),
        ),
        exits: n(r.removals_cumulative),
        feedKg:
          r.feed_cumulative_kg == null
            ? null
            : round(Number(r.feed_cumulative_kg), 1),
        weight:
          r.last_weight_g == null ? null : round(Number(r.last_weight_g), 0),
        completeness: pct(Number(r.entered ?? 0), Number(r.elapsed ?? 0)),
      })),
    };
  }
}
