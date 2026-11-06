import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { addDays, utcDay } from '../batches/poufa/bande-rules.js';
import { emptyFacts, type Facts } from './pilotage-metrics.js';
import type { Period } from './pilotage-rules.js';
import {
  PilotageScopeService,
  SqlParams,
  type FarmFilters,
  type PilotageView,
} from './pilotage-scope.service.js';
import {
  PUBLISHED_ALERT_SOURCE,
  type PublishedAlertSource,
  type PublishedSanitaryAlert,
} from './published-alerts.js';

/** Registry columns of a farm in scope. */
export interface ScopedFarm {
  id: string;
  provinceId: string | null;
  code: string | null;
  name: string;
  cohort: string | null;
  statusCode: string | null;
  active: boolean;
  latitude: number | null;
  longitude: number | null;
  capacityPlaces: number | null;
}

export interface FarmFacts {
  farm: ScopedFarm;
  facts: Facts;
}

export interface WeekFacts {
  weekStart: string;
  farms: number;
  exposed: number;
  deaths: number;
  exits: number;
  exitKg: number;
  daysEntered: number;
  daysElapsed: number;
}

export interface ProvinceRow {
  id: string;
  code: string;
  name: string;
  sort: number;
}

export interface ListLabel {
  code: string;
  label: string;
  family: string | null;
}

const POULTRY_ITEMS = [
  'POULET_PIECE',
  'POULET_KG',
  'ABATTU_PIECE',
  'ABATTU_KG',
];

const n = (v: unknown): number => (v == null ? 0 : Number(v));

/**
 * CTE `ws` (needs `sf`): measured live weight of the sorties whose animals did
 * leave (any REFORME/AUTRE, a VENTE whose sale is not cancelled, an ABATTOIR
 * whose slaughter order is processed), per band and per day of removal (the
 * slaughter's planned date, as in `FlockReconciliationService.removalsByDate`).
 * `from`/`to` are SQL placeholders.
 */
export function weighedSortiesCte(from: string, to: string): string {
  return `ws AS (
         SELECT so.batch_id, COALESCE(o.planned_date, so.sortie_date) AS day,
                SUM(so.count) AS heads, SUM(so.weight_kg) AS kg
           FROM sorties so
           JOIN sf ON sf.id = so.farm_id
           LEFT JOIN sales sa ON sa.id = so.sale_id
           LEFT JOIN slaughter_orders o ON o.id = so.slaughter_order_id
          WHERE so.weight_kg > 0
            AND (so.reason_family NOT IN ('VENTE', 'ABATTOIR')
                 OR (so.reason_family = 'VENTE' AND sa.status <> 'CANCELLED')
                 OR (so.reason_family = 'ABATTOIR' AND o.status = 'PROCESSED'))
            AND COALESCE(o.planned_date, so.sortie_date) BETWEEN ${from}::date AND ${to}::date
          GROUP BY 1, 2
       )`;
}

/**
 * Live kg leaving a band on a `bande_daily_stats` row `s` joined to `ws`: the
 * weighed sorties, plus the other removals of the day at the last weighing.
 */
export const DAY_EXIT_KG = `(COALESCE(ws.kg, 0)
  + GREATEST(s.removals - COALESCE(ws.heads, 0), 0) * COALESCE(s.last_weight_g, 0) / 1000.0)`;

/**
 * The steering's SQL: per-farm facts over a period, weekly series, province
 * and list labels. Aggregation happens in SQL (`bande_daily_stats`, sales,
 * alerts), one row per farm; the dashboards only sum those rows.
 */
@Injectable()
export class PilotageDataService {
  constructor(
    private readonly scope: PilotageScopeService,
    @Inject(PUBLISHED_ALERT_SOURCE)
    private readonly publishedAlerts: PublishedAlertSource,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  get publishedAlertsAvailable(): boolean {
    return this.publishedAlerts.available;
  }

  /**
   * One row per farm in scope with its facts over `period`. The headcount is
   * read on the last day of the period (today at most).
   */
  async farmFacts(
    view: PilotageView,
    filters: FarmFilters,
    period: Period,
    today: string = utcDay(),
  ): Promise<FarmFacts[]> {
    const farms = this.scope.scopedFarms(view, filters);
    const p = new SqlParams(farms.params);
    const from = p.add(period.from);
    const to = p.add(period.to);
    const end = p.add(period.to < today ? period.to : today);
    const todayP = p.add(today);
    const fromTs = p.add(`${period.from}T00:00:00.000Z`);
    const toTs = p.add(`${addDays(period.to, 1)}T00:00:00.000Z`);
    const items = p.add(POULTRY_ITEMS);
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `WITH sf AS (${farms.sql}),
       ${weighedSortiesCte(from, to)},
       st AS (
         SELECT s.batch_id, s.farm_id, s.day, s.present_start, s.deaths,
                s.removals, ${DAY_EXIT_KG} AS exit_kg, s.entry_done, s.present
           FROM bande_daily_stats s JOIN sf ON sf.id = s.farm_id
           LEFT JOIN ws ON ws.batch_id = s.batch_id AND ws.day = s.day
          WHERE s.day >= ${from}::date AND s.day <= ${to}::date
       ),
       bb AS (
         SELECT st.batch_id, st.farm_id,
                (array_agg(st.present_start ORDER BY st.day))[1] AS exposed,
                SUM(st.deaths) AS deaths,
                SUM(st.removals) AS exits,
                SUM(st.exit_kg) AS exit_kg,
                COUNT(*) FILTER (WHERE st.entry_done) AS entered,
                COUNT(*) FILTER (WHERE st.entry_done OR st.day < ${todayP}::date) AS elapsed,
                -- A band closed on the last day no longer counts in the headcount.
                MAX(st.present) FILTER (
                  WHERE st.day = ${end}::date
                    AND (pb.closed_at IS NULL
                         OR (pb.closed_at AT TIME ZONE 'UTC')::date > ${end}::date)
                ) AS present_end
           FROM st JOIN production_batches pb ON pb.id = st.batch_id
          GROUP BY st.batch_id, st.farm_id
       ),
       bf AS (
         SELECT farm_id, COUNT(*) AS bands, SUM(exposed) AS exposed,
                SUM(deaths) AS deaths, SUM(exits) AS exits,
                SUM(exit_kg) AS exit_kg, SUM(entered) AS entered,
                SUM(elapsed) AS elapsed,
                COALESCE(SUM(present_end), 0) AS headcount,
                COUNT(*) FILTER (WHERE present_end > 0) AS active_bands
           FROM bb GROUP BY farm_id
       ),
       pl AS (
         SELECT b.farm_id, COUNT(*) AS bands_opened,
                SUM(b.quantity_at_start) AS placed
           FROM production_batches b JOIN sf ON sf.id = b.farm_id
          WHERE b.integration_date >= ${from}::date
            AND b.integration_date <= ${to}::date
          GROUP BY b.farm_id
       ),
       sl AS (
         SELECT s.farm_id,
                SUM(CASE i.product_type WHEN 'POULET_PIECE' THEN i.quantity
                    WHEN 'POULET_KG' THEN COALESCE(i.piece_count, 0) ELSE 0 END) AS live_heads,
                SUM(CASE WHEN i.product_type = 'POULET_KG' THEN i.quantity ELSE 0 END) AS live_kg,
                SUM(CASE WHEN i.product_type = 'POULET_PIECE' THEN i.quantity ELSE 0 END) AS piece_qty,
                SUM(CASE WHEN i.product_type = 'POULET_PIECE' THEN i.amount_fcfa ELSE 0 END) AS piece_fcfa,
                SUM(CASE WHEN i.product_type = 'POULET_KG' THEN i.amount_fcfa ELSE 0 END) AS kg_fcfa,
                SUM(CASE i.product_type WHEN 'ABATTU_PIECE' THEN i.quantity
                    WHEN 'ABATTU_KG' THEN COALESCE(i.piece_count, 0) ELSE 0 END) AS carcass_heads,
                SUM(CASE WHEN i.product_type = 'ABATTU_KG' THEN i.quantity ELSE 0 END) AS carcass_kg,
                SUM(CASE WHEN i.product_type = 'ABATTU_KG' THEN i.amount_fcfa ELSE 0 END) AS carcass_kg_fcfa,
                SUM(CASE WHEN i.product_type = 'ABATTU_PIECE' THEN i.quantity ELSE 0 END) AS carcass_piece_qty,
                SUM(CASE WHEN i.product_type = 'ABATTU_PIECE' THEN i.amount_fcfa ELSE 0 END) AS carcass_piece_fcfa,
                SUM(i.amount_fcfa) AS revenue
           FROM sales s
           JOIN sf ON sf.id = s.farm_id
           JOIN sale_items i ON i.sale_id = s.id
           LEFT JOIN orders o ON o.sale_id = s.id
          WHERE s.status <> 'CANCELLED'
            AND i.product_type::text = ANY(${items}::text[])
            AND (o.id IS NULL OR o.status = 'LIVRE')
            AND COALESCE((o.livred_at AT TIME ZONE 'UTC')::date, s.sale_date)
                BETWEEN ${from}::date AND ${to}::date
          GROUP BY s.farm_id
       ),
       al AS (
         SELECT a.farm_id,
                COUNT(*) FILTER (WHERE a."createdAt" >= ${fromTs}::timestamptz
                                   AND a."createdAt" < ${toTs}::timestamptz) AS raised,
                COUNT(*) FILTER (WHERE a."createdAt" >= ${fromTs}::timestamptz
                                   AND a."createdAt" < ${toTs}::timestamptz
                                   AND a.level = 'ROUGE') AS raised_red,
                COUNT(*) FILTER (WHERE a.status = 'ACTIVE') AS active,
                COUNT(*) FILTER (WHERE a.status = 'ACTIVE' AND a.level = 'ROUGE') AS active_red
           FROM alerts a JOIN sf ON sf.id = a.farm_id
          WHERE a.level <> 'VERT'
          GROUP BY a.farm_id
       )
       SELECT sf.id, sf.province_id, sf.code, sf.name, sf.cohort, sf.status_code,
              sf.active, sf.latitude, sf.longitude, sf.capacity_places,
              bf.bands, bf.exposed, bf.deaths, bf.exits, bf.exit_kg, bf.entered,
              bf.elapsed, bf.headcount, bf.active_bands,
              pl.bands_opened, pl.placed,
              sl.live_heads, sl.live_kg, sl.piece_qty, sl.piece_fcfa, sl.kg_fcfa,
              sl.carcass_heads, sl.carcass_kg, sl.carcass_kg_fcfa,
              sl.carcass_piece_qty, sl.carcass_piece_fcfa, sl.revenue,
              al.raised, al.raised_red, al.active, al.active_red
         FROM sf
         LEFT JOIN bf ON bf.farm_id = sf.id
         LEFT JOIN pl ON pl.farm_id = sf.id
         LEFT JOIN sl ON sl.farm_id = sf.id
         LEFT JOIN al ON al.farm_id = sf.id
        ORDER BY sf.code NULLS LAST, sf.name`,
      p.values,
    );
    const published = await this.published(view, filters, rows, period);
    return rows.map((r) => {
      const facts = emptyFacts();
      facts.farms = 1;
      facts.bands = n(r.bands);
      facts.farmsReporting = facts.bands > 0 ? 1 : 0;
      facts.activeBands = n(r.active_bands);
      facts.headcount = n(r.headcount);
      facts.bandsOpened = n(r.bands_opened);
      facts.placed = n(r.placed);
      facts.exposed = n(r.exposed);
      facts.deaths = n(r.deaths);
      facts.exits = n(r.exits);
      facts.exitKg = n(r.exit_kg);
      facts.daysEntered = n(r.entered);
      facts.daysElapsed = n(r.elapsed);
      facts.liveHeads = n(r.live_heads);
      facts.liveKg = n(r.live_kg);
      facts.pieceQty = n(r.piece_qty);
      facts.pieceFcfa = n(r.piece_fcfa);
      facts.kgFcfa = n(r.kg_fcfa);
      facts.carcassHeads = n(r.carcass_heads);
      facts.carcassKg = n(r.carcass_kg);
      facts.carcassKgFcfa = n(r.carcass_kg_fcfa);
      facts.carcassPieceQty = n(r.carcass_piece_qty);
      facts.carcassPieceFcfa = n(r.carcass_piece_fcfa);
      facts.revenueFcfa = n(r.revenue);
      facts.alertsRaised = n(r.raised);
      facts.alertsRaisedRed = n(r.raised_red);
      facts.alertsActive = n(r.active);
      facts.alertsActiveRed = n(r.active_red);
      const id = String(r.id);
      facts.publishedAlerts = published.byFarm.get(id) ?? 0;
      facts.farmsWithData =
        facts.bands > 0 ||
        facts.bandsOpened > 0 ||
        facts.revenueFcfa > 0 ||
        facts.liveHeads + facts.carcassHeads > 0 ||
        facts.alertsRaised + facts.alertsActive + facts.publishedAlerts > 0
          ? 1
          : 0;
      return {
        farm: {
          id,
          provinceId: (r.province_id as string | null) ?? null,
          code: (r.code as string | null) ?? null,
          name: String(r.name),
          cohort: (r.cohort as string | null) ?? null,
          statusCode: (r.status_code as string | null) ?? null,
          active: Boolean(r.active),
          latitude: r.latitude == null ? null : Number(r.latitude),
          longitude: r.longitude == null ? null : Number(r.longitude),
          capacityPlaces:
            r.capacity_places == null ? null : Number(r.capacity_places),
        },
        facts,
      };
    });
  }

  /**
   * Published sanitary alerts of the period counted per farm, plus those
   * about a province or the whole country (no farm), which only the totals
   * carry.
   */
  async publishedCounts(
    view: PilotageView,
    filters: FarmFilters,
    period: Period,
    provinceIds: readonly string[] | null,
  ): Promise<PublishedSanitaryAlert[]> {
    if (!this.publishedAlerts.available) return [];
    return this.publishedAlerts.published({
      programId: view.programId,
      provinceIds: filters.provinceIds ?? provinceIds,
      from: new Date(`${period.from}T00:00:00.000Z`),
      to: new Date(`${addDays(period.to, 1)}T00:00:00.000Z`),
    });
  }

  private async published(
    view: PilotageView,
    filters: FarmFilters,
    rows: Record<string, unknown>[],
    period: Period,
  ): Promise<{ byFarm: Map<string, number> }> {
    const byFarm = new Map<string, number>();
    if (!this.publishedAlerts.available) return { byFarm };
    const provinces = this.unrestricted(view)
      ? null
      : [
          ...new Set(
            rows
              .map((r) => r.province_id as string | null)
              .filter((id): id is string => id != null),
          ),
        ];
    const alerts = await this.publishedCounts(view, filters, period, provinces);
    for (const a of alerts) {
      if (a.farmId) byFarm.set(a.farmId, (byFarm.get(a.farmId) ?? 0) + 1);
    }
    return { byFarm };
  }

  /** Whether the view reads the whole programme. */
  unrestricted(view: PilotageView): boolean {
    return !view.access || view.aggregateOnly || view.kind === 'ALL';
  }

  /** Weekly series (ISO weeks, Monday first) of the band facts over `period`. */
  async weeklyFacts(
    view: PilotageView,
    filters: FarmFilters,
    period: Period,
    today: string = utcDay(),
  ): Promise<WeekFacts[]> {
    const farms = this.scope.scopedFarms(view, filters);
    const p = new SqlParams(farms.params);
    const from = p.add(period.from);
    const to = p.add(period.to);
    const todayP = p.add(today);
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `WITH sf AS (${farms.sql}),
       ${weighedSortiesCte(from, to)},
       wb AS (
         SELECT date_trunc('week', s.day)::date AS week, s.batch_id, s.farm_id,
                (array_agg(s.present_start ORDER BY s.day))[1] AS exposed,
                SUM(s.deaths) AS deaths, SUM(s.removals) AS exits,
                SUM(${DAY_EXIT_KG}) AS exit_kg,
                COUNT(*) FILTER (WHERE s.entry_done) AS entered,
                COUNT(*) FILTER (WHERE s.entry_done OR s.day < ${todayP}::date) AS elapsed
           FROM bande_daily_stats s JOIN sf ON sf.id = s.farm_id
           LEFT JOIN ws ON ws.batch_id = s.batch_id AND ws.day = s.day
          WHERE s.day >= ${from}::date AND s.day <= ${to}::date
          GROUP BY 1, s.batch_id, s.farm_id
       )
       SELECT to_char(week, 'YYYY-MM-DD') AS week, COUNT(DISTINCT farm_id) AS farms,
              SUM(exposed) AS exposed, SUM(deaths) AS deaths, SUM(exits) AS exits,
              SUM(exit_kg) AS exit_kg, SUM(entered) AS entered, SUM(elapsed) AS elapsed
         FROM wb GROUP BY week ORDER BY week`,
      p.values,
    );
    return rows.map((r) => ({
      weekStart: String(r.week),
      farms: n(r.farms),
      exposed: n(r.exposed),
      deaths: n(r.deaths),
      exits: n(r.exits),
      exitKg: n(r.exit_kg),
      daysEntered: n(r.entered),
      daysElapsed: n(r.elapsed),
    }));
  }

  async provinces(programId: string): Promise<ProvinceRow[]> {
    return this.dataSource.query(
      `SELECT id, code, name, sort FROM provinces WHERE program_id = $1 ORDER BY sort, code`,
      [programId],
    );
  }

  /** Province geometries (GeoJSON), for map centroids. */
  async provinceGeometries(programId: string): Promise<Map<string, unknown>> {
    const rows: { id: string; geometry: unknown }[] =
      await this.dataSource.query(
        `SELECT id, geometry FROM provinces WHERE program_id = $1 AND geometry IS NOT NULL`,
        [programId],
      );
    return new Map(rows.map((r) => [r.id, r.geometry]));
  }

  /** Items of a programme list (labels for status and cohort codes). */
  async listLabels(programId: string, listType: string): Promise<ListLabel[]> {
    return this.dataSource.query(
      `SELECT code, label, family FROM ref_items
        WHERE program_id = $1 AND list_type = $2 ORDER BY sort, code`,
      [programId, listType],
    );
  }
}
